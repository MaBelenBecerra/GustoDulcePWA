import { describe, expect, it } from 'vitest';
import {
  fusionar,
  movimientoCompra,
  movimientosBaja,
  movimientosProduccion,
  ordenarMovimientos,
  proyectarInventario,
  validarMovimiento,
} from '..';
import type { Contexto, Lote, Movimiento } from '..';

let contador = 0;
const ctx = (dispositivoId = 'd1', lamport = 1): Contexto => ({
  dispositivoId,
  registradoEn: '2026-11-17T10:00:00Z',
  lamport,
  nuevoId: () => `m${++contador}`,
});

const lote = (id: string, insumoId: string, cantidad: number, vence: string, costo = 0.01): Lote => ({
  id,
  insumoId,
  cantidadInicial: cantidad,
  cantidadDisponible: cantidad,
  costoUnitario: costo,
  fechaIngreso: '2026-11-01',
  fechaVencimiento: vence,
});

const consumo = (c: Contexto, loteId: string, cantidad: number) =>
  movimientosProduccion(c, `p${++contador}`, 'torta', [{ asignaciones: [{ loteId, cantidad, costo: cantidad * 0.01 }] }]);

describe('Proyección del inventario desde movimientos', () => {
  it('el saldo es la compra menos los consumos', () => {
    const c = ctx();
    const r = proyectarInventario([movimientoCompra(c, lote('L1', 'harina', 1000, '2026-12-30')), ...consumo(c, 'L1', 300)]);
    expect(r.lotes).toHaveLength(1);
    expect(r.lotes[0]!.cantidadDisponible).toBe(700);
    expect(r.sobregiros).toEqual([]);
  });

  it('no depende del orden de llegada (conmutatividad)', () => {
    const c = ctx();
    const movs = [movimientoCompra(c, lote('L1', 'harina', 1000, '2026-12-30')), ...consumo(c, 'L1', 100.1), ...consumo(c, 'L1', 200.2)];
    const a = proyectarInventario(movs);
    const b = proyectarInventario([...movs].reverse());
    expect(a.lotes).toEqual(b.lotes);
    expect(a.lotes[0]!.cantidadDisponible).toBeCloseTo(699.7, 9);
  });

  it('acumula el valor de las bajas por vencimiento', () => {
    const c = ctx();
    const r = proyectarInventario([
      movimientoCompra(c, lote('L1', 'leche', 1000, '2026-11-10', 0.008)),
      ...movimientosBaja(c, [{ loteId: 'L1', cantidad: 1000, valor: 8 }]),
    ]);
    expect(r.valorMerma).toBe(8);
    expect(r.lotes[0]!.cantidadDisponible).toBe(0);
  });

  it('reporta consumos huérfanos cuya compra aún no llegó', () => {
    const r = proyectarInventario(consumo(ctx(), 'LX', 5));
    expect(r.huerfanos).toHaveLength(1);
    expect(r.lotes).toEqual([]);
  });

  it('detecta un sobregiro si dos dispositivos consumieron el mismo lote sin conexión', () => {
    const compra = movimientoCompra(ctx('d1'), lote('L1', 'harina', 1000, '2026-12-30'));
    const unido = fusionar([compra, ...consumo(ctx('d1', 2), 'L1', 700)], [compra, ...consumo(ctx('d2', 2), 'L1', 700)]);
    expect(proyectarInventario(unido.movimientos).sobregiros).toEqual([{ loteId: 'L1', insumoId: 'harina', exceso: 400 }]);
  });
});

describe('Fusión idempotente con el respaldo (G-Set)', () => {
  const c = ctx();
  const a = movimientoCompra(c, lote('L1', 'harina', 1000, '2026-12-30'));
  const b = movimientoCompra(c, lote('L2', 'azucar', 1000, '2026-12-30'));

  it('reenviar el mismo movimiento no lo duplica', () => {
    const r = fusionar([a], [a, a, b]);
    expect(r.movimientos).toHaveLength(2);
    expect(r.nuevos).toEqual([b.id]);
  });

  it('es conmutativa', () => {
    const ab = fusionar(fusionar([], [a]).movimientos, [b]).movimientos;
    const ba = fusionar(fusionar([], [b]).movimientos, [a]).movimientos;
    expect(ordenarMovimientos(ab)).toEqual(ordenarMovimientos(ba));
  });

  it('detecta un id repetido con contenido distinto', () => {
    expect(fusionar([a], [{ ...a, lamport: 99 }]).divergentes).toEqual([a.id]);
  });
});

describe('Validación de movimientos recibidos', () => {
  it('rechaza cantidades no positivas y relojes inválidos', () => {
    const [m] = consumo(ctx(), 'L', 1);
    expect(validarMovimiento(m!).ok).toBe(true);
    expect(validarMovimiento({ ...m!, cantidad: -1 } as Movimiento).ok).toBe(false);
    expect(validarMovimiento({ ...m!, lamport: 1.5 }).ok).toBe(false);
  });
});
