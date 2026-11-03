import { describe, expect, it } from 'vitest';
import {
  aplicarPlanes,
  cantidadBruta,
  crearLote,
  darDeBajaVencidos,
  disponibleUtilizable,
  estrategiaFEFO,
  necesidadesReceta,
  planificarSalida,
  producir,
  resumirInsumo,
} from '../inventario';
import { HOY, INSUMOS, lote, receta } from './fixtures';

describe('crearLote', () => {
  it('inicializa disponible = inicial', () => {
    const l = lote('L1', 'harina', 1000, 0.01, '2026-12-01');
    expect(l.cantidadDisponible).toBe(1000);
    expect(l.cantidadInicial).toBe(1000);
  });

  it('valida cantidad, costo y fechas', () => {
    const base = { id: 'x', insumoId: 'harina', costoUnitario: 0.01, fechaIngreso: HOY, fechaVencimiento: HOY } as const;
    expect(() => crearLote({ ...base, cantidad: 0 })).toThrow();
    expect(() => crearLote({ ...base, cantidad: 10, costoUnitario: -1 })).toThrow();
    expect(() => crearLote({ ...base, cantidad: 10, fechaVencimiento: '2026-11-01' })).toThrow();
  });
});

describe('estrategia FEFO', () => {
  it('ordena por vencimiento ascendente, no por fecha de ingreso', () => {
    const lotes = [
      lote('viejoLargo', 'harina', 100, 0.01, '2027-01-01', '2026-09-01'),
      lote('nuevoCorto', 'harina', 100, 0.02, '2026-11-08', '2026-10-30'),
    ];
    expect(estrategiaFEFO.ordenar(lotes, HOY).map((l) => l.id)).toEqual(['nuevoCorto', 'viejoLargo']);
  });

  it('desempata por fecha de ingreso y luego por id (orden determinista)', () => {
    const lotes = [
      lote('B', 'harina', 1, 1, '2026-12-01', '2026-10-05'),
      lote('C', 'harina', 1, 1, '2026-12-01', '2026-10-01'),
      lote('A', 'harina', 1, 1, '2026-12-01', '2026-10-05'),
    ];
    expect(estrategiaFEFO.ordenar(lotes, HOY).map((l) => l.id)).toEqual(['C', 'A', 'B']);
  });

  it('excluye lotes vencidos y vacíos; incluye el que vence hoy', () => {
    const vacio = { ...lote('vacio', 'harina', 10, 1, '2026-11-20'), cantidadDisponible: 0 };
    const lotes = [lote('vencido', 'harina', 100, 1, '2026-11-02'), lote('hoy', 'harina', 100, 1, HOY), vacio];
    expect(estrategiaFEFO.ordenar(lotes, HOY).map((l) => l.id)).toEqual(['hoy']);
  });

  it('no muta el arreglo original', () => {
    const lotes = [lote('2', 'harina', 1, 1, '2026-12-02'), lote('1', 'harina', 1, 1, '2026-12-01')];
    const copia = [...lotes];
    estrategiaFEFO.ordenar(lotes, HOY);
    expect(lotes).toEqual(copia);
  });
});

describe('planificarSalida (cascada multilote)', () => {
  const lotes = [
    lote('L1', 'harina', 300, 0.01, '2026-11-06'),
    lote('L2', 'harina', 500, 0.012, '2026-11-20'),
    lote('L3', 'harina', 1000, 0.015, '2026-12-30'),
  ];

  it('parte la salida entre lotes y debita el costo de cada uno', () => {
    const r = planificarSalida('harina', 650, lotes, HOY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tomas.map((t) => [t.loteId, t.cantidad])).toEqual([
      ['L1', 300],
      ['L2', 350],
    ]);
    // 300·0.01 + 350·0.012 = 3 + 4.2
    expect(r.valor.costoTotal).toBeCloseTo(7.2, 10);
  });

  it('frontera exacta: consumir justo un lote completo no toca el siguiente', () => {
    const r = planificarSalida('harina', 300, lotes, HOY);
    expect(r.ok && r.valor.tomas.map((t) => t.loteId)).toEqual(['L1']);
  });

  it('cantidad 0 produce un plan vacío con costo 0', () => {
    const r = planificarSalida('harina', 0, lotes, HOY);
    expect(r.ok && r.valor.tomas).toEqual([]);
    expect(r.ok && r.valor.costoTotal).toBe(0);
  });

  it('informa el faltante sin lanzar', () => {
    const r = planificarSalida('harina', 2000, lotes, HOY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ insumoId: 'harina', requerido: 2000, disponible: 1800, faltante: 200 });
  });

  it('absorbe residuos de punto flotante (0.1 + 0.2 contra un lote de 0.3)', () => {
    const fino = [lote('a', 'azucar', 0.1, 1, '2026-12-01'), lote('b', 'azucar', 0.2, 1, '2026-12-02')];
    const r = planificarSalida('azucar', 0.3, fino, HOY);
    expect(r.ok).toBe(true);
  });

  it('nunca toma de un lote vencido aunque sea el único', () => {
    const r = planificarSalida('harina', 10, [lote('v', 'harina', 999, 1, '2026-11-01')], HOY);
    expect(r.ok).toBe(false);
  });
});

describe('aplicarPlanes', () => {
  it('descuenta sin mutar y deja 0 exacto (no -1e-16)', () => {
    const lotes = [lote('a', 'azucar', 0.3, 1, '2026-12-01')];
    const plan = planificarSalida('azucar', 0.1 + 0.2, lotes, HOY);
    if (!plan.ok) throw new Error('esperaba ok');
    const nuevos = aplicarPlanes(lotes, [plan.valor]);
    expect(nuevos[0]?.cantidadDisponible).toBe(0);
    expect(lotes[0]?.cantidadDisponible).toBe(0.3);
  });
});

describe('merma y necesidades brutas', () => {
  it('Q_bruta = Q / (1 − m)', () => {
    expect(cantidadBruta(400, 0.2)).toBeCloseTo(500, 10);
    expect(cantidadBruta(400, 0)).toBe(400);
    expect(() => cantidadBruta(400, 1)).toThrow();
    expect(() => cantidadBruta(400, -0.1)).toThrow();
  });

  it('agrega un insumo repetido en la receta antes de planificar', () => {
    const r = receta({
      ingredientes: [
        { insumoId: 'azucar', cantidad: 200 },
        { insumoId: 'azucar', cantidad: 100 },
        { insumoId: 'frutilla', cantidad: 400 },
      ],
    });
    const n = necesidadesReceta(r, INSUMOS, 2);
    expect(n.get('azucar')).toBe(600);
    expect(n.get('frutilla')).toBeCloseTo(1000, 10);
  });

  it('falla ruidosamente si la receta usa un insumo inexistente', () => {
    const r = receta({ ingredientes: [{ insumoId: 'fantasma', cantidad: 1 }] });
    expect(() => necesidadesReceta(r, INSUMOS)).toThrow(/fantasma/);
  });
});

describe('producir (atómico)', () => {
  const lotes = [
    lote('H1', 'harina', 400, 0.01, '2026-11-05'),
    lote('H2', 'harina', 1000, 0.012, '2026-12-01'),
    lote('E1', 'huevo', 6, 1, '2026-11-15'),
  ];

  it('descuenta todos los ingredientes por FEFO y calcula el costo MPD real', () => {
    const r = producir(receta(), INSUMOS, lotes, HOY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porId = Object.fromEntries(r.valor.lotes.map((l) => [l.id, l.cantidadDisponible]));
    expect(porId).toEqual({ H1: 0, H2: 900, E1: 2 });
    // 400·0.01 + 100·0.012 + 4·1 = 4 + 1.2 + 4
    expect(r.valor.costoMPD).toBeCloseTo(9.2, 10);
  });

  it('si falta UN ingrediente no descuenta NINGUNO', () => {
    const r = producir(receta(), INSUMOS, lotes, HOY, 2); // necesita 8 huevos, hay 6
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.faltantes).toEqual([{ insumoId: 'huevo', requerido: 8, disponible: 6, faltante: 2 }]);
    // Los lotes originales siguen intactos (inmutabilidad).
    expect(lotes.map((l) => l.cantidadDisponible)).toEqual([400, 1000, 6]);
  });

  it('reporta todos los faltantes a la vez, no solo el primero', () => {
    const r = producir(receta(), INSUMOS, [], HOY);
    expect(!r.ok && r.error.faltantes.map((f) => f.insumoId)).toEqual(['harina', 'huevo']);
  });

  it('rechaza factor ≤ 0', () => {
    expect(() => producir(receta(), INSUMOS, lotes, HOY, 0)).toThrow();
  });
});

describe('vencidos y resumen', () => {
  const lotes = [
    lote('ok', 'harina', 500, 0.01, '2026-12-20'),
    lote('pronto', 'harina', 200, 0.01, '2026-11-08'),
    lote('vencido', 'harina', 300, 0.02, '2026-11-01'),
  ];

  it('darDeBajaVencidos lleva a 0 y valoriza la merma', () => {
    const r = darDeBajaVencidos(lotes, HOY);
    expect(r.bajas.map((b) => b.loteId)).toEqual(['vencido']);
    expect(r.costoTotal).toBeCloseTo(6, 10);
    expect(r.lotes.find((l) => l.id === 'vencido')?.cantidadDisponible).toBe(0);
    // Idempotente: una segunda baja no genera nada.
    expect(darDeBajaVencidos(r.lotes, HOY).bajas).toHaveLength(0);
  });

  it('resumirInsumo separa útil de vencido y muestra el peor semáforo', () => {
    const r = resumirInsumo(lotes, 'harina', HOY);
    expect(r.disponibleUtil).toBe(700);
    expect(r.disponibleVencido).toBe(300);
    expect(r.semaforo).toBe('rojo');
    expect(r.valorStock).toBeCloseTo(7, 10);
    expect(disponibleUtilizable(lotes, 'harina', HOY)).toBe(700);
  });

  it('sin stock el semáforo es null', () => {
    expect(resumirInsumo([], 'harina', HOY).semaforo).toBeNull();
  });
});
