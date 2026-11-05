import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, aRegistro } from '../db';
import {
  InventarioRepositorioDexie,
  agruparTomas,
  validarPlan,
} from './InventarioRepositorioDexie';
import { planificadorReferencia } from '../../dev/planificadorReferencia';
import type { Lote, PlanSalida } from '../../domain/tipos';

const repo = new InventarioRepositorioDexie();
const INSUMO = 'harina';

const lote = (id: string, venc: Lote['fechaVencimiento'], q: number, c: number): Lote => ({
  id,
  insumoId: INSUMO,
  cantidadInicial: q,
  cantidadDisponible: q,
  costoUnitario: c,
  fechaIngreso: '2026-11-01',
  fechaVencimiento: venc,
});

async function saldos(): Promise<Record<string, number>> {
  const todos = await db.lotes_inventario.toArray();
  return Object.fromEntries(todos.map((l) => [l.id, l.cantidadDisponible]));
}

beforeEach(async () => {
  await db.delete();
  await db.open();

  await db.lotes_inventario.bulkPut([
    aRegistro(lote('C', '2026-12-30', 500, 0.014)),
    aRegistro(lote('A', '2026-11-06', 1000, 0.012)),
    aRegistro(lote('B', '2026-11-18', 1000, 0.013)),
  ]);
});

describe('descontarFEFO', () => {
  it('descuenta en cascada por vencimiento y registra el kardex', async () => {
    const r = await repo.descontarFEFO(INSUMO, 1500, planificadorReferencia, 'prueba');

    expect(r.ok).toBe(true);
    expect(await saldos()).toEqual({ A: 0, B: 500, C: 500 });

    const movs = await db.movimientos_inventario.toArray();
    expect(movs.map((m) => m.loteId).sort()).toEqual(['A', 'B']);
    expect(new Set(movs.map((m) => m.operacionId)).size).toBe(1);
    expect(movs.reduce((s, m) => s + m.costo, 0)).toBeCloseTo(12 + 6.5, 10);
    expect(movs.every((m) => m.pendienteSync === 1)).toBe(true);
  });

  it('si falta stock no modifica nada', async () => {
    const r = await repo.descontarFEFO(INSUMO, 99_999, planificadorReferencia, 'prueba');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe('faltante');
    expect(await saldos()).toEqual({ A: 1000, B: 1000, C: 500 });
    expect(await db.movimientos_inventario.count()).toBe(0);
  });

  it('serializa descuentos concurrentes: nunca deja saldos negativos', async () => {
    const resultados = await Promise.all([
      repo.descontarFEFO(INSUMO, 800, planificadorReferencia, 'pedido 1'),
      repo.descontarFEFO(INSUMO, 800, planificadorReferencia, 'pedido 2'),
      repo.descontarFEFO(INSUMO, 800, planificadorReferencia, 'pedido 3'),
    ]);

    expect(resultados.every((r) => r.ok)).toBe(true);
    expect(await saldos()).toEqual({ A: 0, B: 0, C: 100 });

    const cuarto = await repo.descontarFEFO(INSUMO, 800, planificadorReferencia, 'pedido 4');
    expect(cuarto.ok).toBe(false);
    expect(await saldos()).toEqual({ A: 0, B: 0, C: 100 });
  });

  it('los lotes agotados salen de la cola FEFO', async () => {
    await repo.descontarFEFO(INSUMO, 1000, planificadorReferencia, 'prueba');
    const cola = await repo.obtenerLotesFEFO(INSUMO);
    expect(cola.map((l) => l.id)).toEqual(['B', 'C']);
  });
});

describe('aplicarPlanSalida (atomicidad)', () => {
  const plan = (tomas: PlanSalida['tomas']): PlanSalida => ({
    insumoId: INSUMO,
    cantidadSolicitada: tomas.reduce((s, t) => s + t.cantidad, 0),
    tomas,
    costoTotal: tomas.reduce((s, t) => s + t.costo, 0),
  });

  it('si la segunda toma falla, la primera también se revierte', async () => {
    const r = await repo.aplicarPlanSalida(
      plan([
        { loteId: 'A', cantidad: 1000, costoUnitario: 0.012, costo: 12 },
        { loteId: 'C', cantidad: 600, costoUnitario: 0.014, costo: 8.4 },
      ]),
      'prueba',
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ tipo: 'stock-insuficiente', loteId: 'C' });
    expect(await saldos()).toEqual({ A: 1000, B: 1000, C: 500 });
    expect(await db.movimientos_inventario.count()).toBe(0);
  });

  it('rechaza un plan calculado con un costo que ya cambió', async () => {
    const r = await repo.aplicarPlanSalida(
      plan([{ loteId: 'A', cantidad: 100, costoUnitario: 0.011, costo: 1.1 }]),
      'prueba',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe('costo-desactualizado');
  });

  it('rechaza lotes inexistentes', async () => {
    const r = await repo.aplicarPlanSalida(
      plan([{ loteId: 'NO-EXISTE', cantidad: 1, costoUnitario: 1, costo: 1 }]),
      'prueba',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe('lote-no-encontrado');
  });

  it('agrupa tomas repetidas del mismo lote antes de validar', async () => {
    const r = await repo.aplicarPlanSalida(
      plan([
        { loteId: 'C', cantidad: 300, costoUnitario: 0.014, costo: 4.2 },
        { loteId: 'C', cantidad: 300, costoUnitario: 0.014, costo: 4.2 },
      ]),
      'prueba',
    );
    expect(r.ok).toBe(false);
    expect((await saldos()).C).toBe(500);
  });

  it('normaliza residuos de punto flotante a 0', async () => {

    await db.lotes_inventario.put(aRegistro(lote('F', '2026-11-04', 0.3, 1)));
    const r = await repo.aplicarPlanSalida(
      plan([
        { loteId: 'F', cantidad: 0.1, costoUnitario: 1, costo: 0.1 },
        { loteId: 'F', cantidad: 0.2, costoUnitario: 1, costo: 0.2 },
      ]),
      'prueba',
    );
    expect(r.ok).toBe(true);
    expect((await saldos()).F).toBe(0);
  });
});

describe('funciones puras', () => {
  it('validarPlan detecta tomas que no suman lo solicitado', () => {
    expect(
      validarPlan({
        insumoId: INSUMO,
        cantidadSolicitada: 100,
        tomas: [{ loteId: 'A', cantidad: 90, costoUnitario: 1, costo: 90 }],
        costoTotal: 90,
      }),
    ).toMatch(/suman/);
  });

  it('agruparTomas devuelve null ante costos inconsistentes en un lote', () => {
    expect(
      agruparTomas([
        { loteId: 'A', cantidad: 1, costoUnitario: 1, costo: 1 },
        { loteId: 'A', cantidad: 1, costoUnitario: 2, costo: 2 },
      ]),
    ).toBeNull();
  });
});