import { describe, expect, it } from 'vitest';
import {
  agregarLote,
  darDeBajaVencidos,
  ErrorDominio,
  estrategiaFEFO,
  planificarConsumo,
  producir,
  registrarCompra,
  resumenInsumo,
} from '../index';
import type { Insumo, Lote, Receta } from '../index';

const HOY = '2026-11-05';

const harina: Insumo = { id: 'harina', nombre: 'Harina', unidad: 'g', presentacion: { cantidad: 1000, precio: 9 }, merma: 0 };
const huevo: Insumo = { id: 'huevo', nombre: 'Huevo', unidad: 'u', presentacion: { cantidad: 30, precio: 30 }, merma: 0 };
const insumos = new Map([harina, huevo].map((i) => [i.id, i]));

const loteA: Lote = { id: 'A', insumoId: 'harina', cantidadInicial: 300, cantidadDisponible: 300, costoUnitario: 0.01, fechaIngreso: '2026-10-01', fechaVencimiento: '2026-11-20' };

const loteB: Lote = { id: 'B', insumoId: 'harina', cantidadInicial: 200, cantidadDisponible: 200, costoUnitario: 0.012, fechaIngreso: '2026-10-20', fechaVencimiento: '2026-11-08' };

const loteC: Lote = { id: 'C', insumoId: 'harina', cantidadInicial: 500, cantidadDisponible: 500, costoUnitario: 0.008, fechaIngreso: '2026-09-01', fechaVencimiento: '2026-11-01' };
const huevos3: Lote = { id: 'H1', insumoId: 'huevo', cantidadInicial: 3, cantidadDisponible: 3, costoUnitario: 1, fechaIngreso: '2026-11-01', fechaVencimiento: '2026-11-25' };

const lotes: readonly Lote[] = Object.freeze([loteA, loteB, loteC, huevos3]);

describe('estrategia FEFO', () => {
  it('ordena por vencimiento, no por fecha de compra, y excluye vencidos', () => {
    const orden = estrategiaFEFO.seleccionar(lotes, 'harina', HOY).map((l) => l.id);
    expect(orden).toEqual(['B', 'A']);
  });

  it('desempata por fecha de ingreso y luego por id', () => {
    const x: Lote = { ...loteA, id: 'X', fechaVencimiento: '2026-11-08', fechaIngreso: '2026-10-25' };
    const y: Lote = { ...loteA, id: 'Y', fechaVencimiento: '2026-11-08', fechaIngreso: '2026-10-25' };
    const orden = estrategiaFEFO.seleccionar([y, x, loteB], 'harina', HOY).map((l) => l.id);
    expect(orden).toEqual(['B', 'X', 'Y']);
  });

  it('un lote que vence hoy sigue siendo consumible', () => {
    const hoy: Lote = { ...loteB, id: 'HOY', fechaVencimiento: HOY };
    expect(estrategiaFEFO.seleccionar([hoy], 'harina', HOY)).toHaveLength(1);
  });

  it('ignora lotes agotados', () => {
    const vacio: Lote = { ...loteB, cantidadDisponible: 0 };
    expect(estrategiaFEFO.seleccionar([vacio], 'harina', HOY)).toHaveLength(0);
  });
});

describe('planificarConsumo (cascada multilote)', () => {
  it('parte la cantidad entre lotes y costea cada tramo', () => {
    const plan = planificarConsumo(lotes, 'harina', 350, HOY);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.valor.asignaciones.map((a) => [a.loteId, a.cantidad])).toEqual([
      ['B', 200],
      ['A', 150],
    ]);
    expect(plan.valor.costoTotal).toBeCloseTo(200 * 0.012 + 150 * 0.01, 12);
  });

  it('reporta faltante sin contar el stock vencido', () => {
    const plan = planificarConsumo(lotes, 'harina', 600, HOY);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error.disponible).toBeCloseTo(500, 10);
    expect(plan.error.faltante).toBeCloseTo(100, 10);
  });

  it('pedir 0 no consume nada', () => {
    const plan = planificarConsumo(lotes, 'harina', 0, HOY);
    expect(plan.ok && plan.valor.asignaciones.length).toBe(0);
  });

  it('absorbe residuos flotantes (0.1 + 0.2 = 0.3)', () => {
    const p1: Lote = { ...loteB, id: 'p1', cantidadDisponible: 0.1 };
    const p2: Lote = { ...loteA, id: 'p2', cantidadDisponible: 0.2 };
    const plan = planificarConsumo([p1, p2], 'harina', 0.3, HOY);
    expect(plan.ok).toBe(true);
  });

  it('rechaza cantidades negativas', () => {
    expect(() => planificarConsumo(lotes, 'harina', -1, HOY)).toThrow(ErrorDominio);
  });
});

describe('producir (atómico)', () => {
  const torta: Receta = {
    id: 'torta',
    nombre: 'Torta',
    porciones: 12,
    minutosElaboracion: 60,
    minutosHorneado: 40,
    ingredientes: [
      { insumoId: 'harina', cantidad: 350 },
      { insumoId: 'huevo', cantidad: 3 },
    ],
  };

  it('descuenta todos los insumos y devuelve el costo real', () => {
    const r = producir({ lotes, receta: torta, insumos, veces: 1, hoy: HOY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porId = new Map(r.valor.lotes.map((l) => [l.id, l.cantidadDisponible]));
    expect(porId.get('B')).toBe(0);
    expect(porId.get('A')).toBeCloseTo(150, 10);
    expect(porId.get('C')).toBe(500);
    expect(porId.get('H1')).toBe(0);
    expect(r.valor.costoMPDReal).toBeCloseTo(2.4 + 1.5 + 3, 10);
    expect(r.valor.unidadesProducidas).toBe(12);
  });

  it('si falta UN insumo no descuenta NINGUNO y deja el inventario intacto', () => {
    const copia = structuredClone([...lotes]);
    const r = producir({ lotes, receta: torta, insumos, veces: 2, hoy: HOY });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.tipo).toBe('STOCK_INSUFICIENTE');
    if (r.error.tipo !== 'STOCK_INSUFICIENTE') return;

    expect(r.error.faltantes.map((f) => f.insumoId).sort()).toEqual(['harina', 'huevo']);
    expect(lotes).toEqual(copia);
  });

  it('agrega ingredientes repetidos antes de planificar', () => {
    const doble: Receta = {
      ...torta,
      ingredientes: [
        { insumoId: 'harina', cantidad: 200 },
        { insumoId: 'harina', cantidad: 200 },
      ],
    };
    const r = producir({ lotes, receta: doble, insumos, veces: 1, hoy: HOY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porId = new Map(r.valor.lotes.map((l) => [l.id, l.cantidadDisponible]));
    expect(porId.get('B')).toBe(0);
    expect(porId.get('A')).toBeCloseTo(100, 10);
  });

  it('descuenta la cantidad bruta cuando hay merma', () => {
    const conMerma = new Map(insumos).set('harina', { ...harina, merma: 0.2 });
    const receta: Receta = { ...torta, ingredientes: [{ insumoId: 'harina', cantidad: 160 }] };
    const r = producir({ lotes, receta, insumos: conMerma, veces: 1, hoy: HOY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.lotes.find((l) => l.id === 'B')?.cantidadDisponible).toBe(0);
  });

  it('informa insumos desconocidos', () => {
    const receta: Receta = { ...torta, ingredientes: [{ insumoId: 'fantasma', cantidad: 1 }] };
    const r = producir({ lotes, receta, insumos, veces: 1, hoy: HOY });
    expect(!r.ok && r.error.tipo).toBe('INSUMO_DESCONOCIDO');
  });

  it('rechaza producir 0 o fracciones de receta', () => {
    expect(() => producir({ lotes, receta: torta, insumos, veces: 0, hoy: HOY })).toThrow(ErrorDominio);
    expect(() => producir({ lotes, receta: torta, insumos, veces: 1.5, hoy: HOY })).toThrow(ErrorDominio);
  });
});

describe('compras, resumen y mermas', () => {
  it('registra una compra como lote con costo por unidad base', () => {
    const lote = registrarCompra(harina, {
      id: 'N1',
      presentaciones: 3,
      precioPagado: 27,
      fechaIngreso: HOY,
      fechaVencimiento: '2027-01-05',
    });
    expect(lote.cantidadDisponible).toBe(3000);
    expect(lote.costoUnitario).toBeCloseTo(0.009, 12);
  });

  it('no acepta lotes ya vencidos ni ids duplicados', () => {
    expect(() =>
      registrarCompra(harina, { id: 'V', presentaciones: 1, precioPagado: 9, fechaIngreso: HOY, fechaVencimiento: '2026-11-01' }),
    ).toThrow(ErrorDominio);
    expect(() => agregarLote(lotes, loteA)).toThrow(ErrorDominio);
  });

  it('resume stock vigente, vencido y peor semáforo', () => {
    const r = resumenInsumo(lotes, 'harina', HOY);
    expect(r.disponible).toBe(500);
    expect(r.vencido).toBe(500);
    expect(r.valorVencido).toBeCloseTo(4, 12);
    expect(r.semaforo).toBe('rojo');
    expect(r.proximoVencimiento).toBe('2026-11-08');
  });

  it('dar de baja vencidos registra la merma y mejora el semáforo', () => {
    const baja = darDeBajaVencidos(lotes, HOY);
    expect(baja.mermas).toHaveLength(1);
    expect(baja.valorTotal).toBeCloseTo(4, 12);
    const r = resumenInsumo(baja.lotes, 'harina', HOY);
    expect(r.vencido).toBe(0);
    expect(r.semaforo).toBe('amarillo');
  });

  it('un insumo sin stock no tiene semáforo', () => {
    expect(resumenInsumo([], 'harina', HOY).semaforo).toBeNull();
  });
});
