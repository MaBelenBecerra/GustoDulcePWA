import { describe, expect, it } from 'vitest';
import {
  CONFIG_LABORAL_POR_DEFECTO,
  costoCIF,
  costoMOD,
  costoMPD,
  costoPorUnidadBase,
  cotizar,
  minutosLaborablesMes,
  precioReferencia,
  precioSugerido,
  tasaMinutoCIF,
  tasaMinutoMOD,
  validarConfigLaboral,
} from '../costeo';
import { HOY, INSUMOS, SERVICIOS, lote, receta } from './fixtures';

describe('MOD con salario de 3300 Bs (24 días × 8 h)', () => {
  it('minutos laborables al mes = 11 520', () => {
    expect(minutosLaborablesMes()).toBe(11_520);
  });

  it('tasa minutaria = 3300 / 11 520 ≈ 0,2865 Bs/min', () => {
    expect(tasaMinutoMOD()).toBeCloseTo(0.286458333, 8);
    expect(tasaMinutoMOD() * 60).toBeCloseTo(17.1875, 10); // Bs/hora
  });

  it('C_MOD = tasa × (elaboración + horneado)', () => {
    // 90 min × 0.2864583… = 25.78125
    expect(costoMOD(receta())).toBeCloseTo(25.78125, 10);
  });

  it('valida la configuración laboral', () => {
    expect(() => validarConfigLaboral({ ...CONFIG_LABORAL_POR_DEFECTO, horasPorDia: 0 })).toThrow();
    expect(() => validarConfigLaboral({ ...CONFIG_LABORAL_POR_DEFECTO, diasLaborablesMes: 40 })).toThrow();
    expect(() => validarConfigLaboral({ ...CONFIG_LABORAL_POR_DEFECTO, salarioMensual: -1 })).toThrow();
  });

  it('rechaza minutos negativos', () => {
    expect(() => costoMOD(receta({ minutosHorneado: -5 }))).toThrow();
  });
});

describe('CIF personalizable (luz, agua, gas)', () => {
  it('tasa combinada = Σ monto / 11 520', () => {
    // 230.4 + 115.2 + 57.6 = 403.2 → 0.035 Bs/min
    expect(tasaMinutoCIF(SERVICIOS)).toBeCloseTo(0.035, 12);
  });

  it('luz y agua se prorratean sobre minutos totales; el gas solo sobre horneado', () => {
    const c = costoCIF(receta(), SERVICIOS); // 40 elab + 50 horno
    const porId = Object.fromEntries(c.lineas.map((l) => [l.servicioId, l]));
    expect(porId.luz?.minutos).toBe(90);
    expect(porId.gas?.minutos).toBe(50);
    // 0.02·90 + 0.01·90 + 0.005·50 = 1.8 + 0.9 + 0.25
    expect(c.total).toBeCloseTo(2.95, 10);
  });

  it('sin servicios configurados el CIF es 0', () => {
    expect(costoCIF(receta(), []).total).toBe(0);
  });
});

describe('MPD', () => {
  it('costoPorUnidadBase = precio / cantidad', () => {
    expect(costoPorUnidadBase(10, 1000)).toBeCloseTo(0.01, 12);
    expect(() => costoPorUnidadBase(10, 0)).toThrow();
  });

  it('usa el costo real de los lotes FEFO, aplicando merma', () => {
    const lotes = [
      lote('F1', 'frutilla', 300, 0.03, '2026-11-05'),
      lote('F2', 'frutilla', 1000, 0.04, '2026-11-10'),
    ];
    const r = receta({ ingredientes: [{ insumoId: 'frutilla', cantidad: 400 }] });
    const d = costoMPD(r, INSUMOS, lotes, HOY);
    // bruta = 400 / 0.8 = 500 → 300·0.03 + 200·0.04 = 9 + 8
    expect(d.lineas[0]?.cantidadBruta).toBeCloseTo(500, 10);
    expect(d.total).toBeCloseTo(17, 10);
    expect(d.lineas[0]?.origen).toBe('stock');
  });

  it('stock insuficiente: costea lo disponible y el resto al último precio', () => {
    const lotes = [
      lote('viejo', 'harina', 100, 0.01, '2026-11-20', '2026-10-01'),
      { ...lote('agotado', 'harina', 1000, 0.02, '2026-12-20', '2026-10-25'), cantidadDisponible: 0 },
    ];
    const d = costoMPD(receta({ ingredientes: [{ insumoId: 'harina', cantidad: 500 }] }), INSUMOS, lotes, HOY);
    // 100·0.01 + 400·0.02 (precio de referencia = lote más reciente)
    expect(d.total).toBeCloseTo(9, 10);
    expect(d.lineas[0]?.origen).toBe('stock+referencia');
  });

  it('sin ningún lote: costo 0 marcado como sin-precio (nunca se inventa)', () => {
    const d = costoMPD(receta({ ingredientes: [{ insumoId: 'azucar', cantidad: 100 }] }), INSUMOS, [], HOY);
    expect(d.total).toBe(0);
    expect(d.lineas[0]?.origen).toBe('sin-precio');
    expect(precioReferencia([], 'azucar')).toBeNull();
  });

  it('costear NO modifica el inventario', () => {
    const lotes = [lote('H', 'harina', 1000, 0.01, '2026-12-01')];
    costoMPD(receta({ ingredientes: [{ insumoId: 'harina', cantidad: 500 }] }), INSUMOS, lotes, HOY);
    expect(lotes[0]?.cantidadDisponible).toBe(1000);
  });
});

describe('precio sugerido P_v = C_u / (1 − g)', () => {
  it('margen sobre precio de venta, no markup sobre costo', () => {
    expect(precioSugerido(60, 0.4)).toBeCloseTo(100, 10); // 40 % del precio es ganancia
    expect(precioSugerido(60, 0)).toBe(60);
  });

  it('rechaza g ≥ 1 y g < 0', () => {
    expect(() => precioSugerido(10, 1)).toThrow();
    expect(() => precioSugerido(10, -0.1)).toThrow();
  });
});

describe('cotizar (integración del motor)', () => {
  const lotes = [lote('H', 'harina', 1000, 0.01, '2026-12-01'), lote('E', 'huevo', 30, 1, '2026-11-20')];
  const base = { receta: receta(), insumos: INSUMOS, lotes, servicios: SERVICIOS, hoy: HOY } as const;

  it('C_u = (MPD + MOD + CIF) / N y el total cuadra al centavo', () => {
    const c = cotizar({ ...base, margen: 0.3, unidades: 3 });
    // MPD = 500·0.01 + 4·1 = 9 ; MOD = 25.78125 ; CIF = 2.95 → 37.73125 / 10
    expect(c.mpd.total).toBeCloseTo(9, 10);
    expect(c.costoReceta).toBeCloseTo(37.73125, 10);
    expect(c.costoUnitario).toBeCloseTo(3.773125, 10);
    expect(c.precioUnitario).toBe(5.39); // 3.773125 / 0.7 = 5.390178…
    expect(c.precioTotal).toBe(16.17);
    expect(c.advertencias).toEqual([]);
  });

  it('valida unidades enteras ≥ 1', () => {
    expect(() => cotizar({ ...base, margen: 0.3, unidades: 0 })).toThrow();
    expect(() => cotizar({ ...base, margen: 0.3, unidades: 1.5 })).toThrow();
  });

  it('advierte cuando el costo no sale íntegramente del stock', () => {
    const c = cotizar({ ...base, lotes: [], margen: 0.3, unidades: 1 });
    expect(c.advertencias.length).toBe(2);
  });

  it('rendimiento 0 es un error de datos', () => {
    expect(() => cotizar({ ...base, receta: receta({ rendimiento: 0 }), margen: 0.3, unidades: 1 })).toThrow();
  });
});
