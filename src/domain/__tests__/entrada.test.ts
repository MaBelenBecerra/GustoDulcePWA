import { describe, expect, it } from 'vitest';
import { decimalesPorPaso, interpretarNumero, textoParaEditar, validarEntradaNumerica } from '../index';

describe('interpretarNumero', () => {
  it.each([
    ['250', 250],
    ['12,5', 12.5],
    ['12.5', 12.5],
    [',5', 0.5],
    ['0,75', 0.75],
    ['1.250,5', 1250.5],
    ['1,250.5', 1250.5],
    ['1.250.000', 1250000],
    ['  35  ', 35],
    ['Bs 45,50', 45.5],
    ['bs.12', 12],
    ['35 %', 35],
    ['500 g', 500],
    ['45 min', 45],
    ['7 días', 7],
    ['10.', 10],
  ] as const)('%j → %d', (texto, esperado) => {
    expect(interpretarNumero(texto)).toBe(esperado);
  });

  it.each(['', '   ', 'abc', '1,2,3', '12a', '--5', '1..2', 'Bs'])('%j no es un número', (texto) => {
    expect(interpretarNumero(texto)).toBeNull();
  });
});

describe('validarEntradaNumerica', () => {
  const precio = { min: 0, max: 5000, decimales: 2 };
  const porciones = { min: 1, max: 200, decimales: 0 };

  it('acepta un precio con centavos', () => {
    expect(validarEntradaNumerica('45,90', precio)).toEqual({ ok: true, valor: 45.9 });
  });

  it('redondea a los decimales permitidos (enteros para porciones)', () => {
    expect(validarEntradaNumerica('12,6', porciones)).toEqual({ ok: true, valor: 13 });
    expect(validarEntradaNumerica('10,005', precio)).toEqual({ ok: true, valor: 10.01 });
  });

  it('acepta exactamente los límites', () => {
    expect(validarEntradaNumerica('1', porciones)).toEqual({ ok: true, valor: 1 });
    expect(validarEntradaNumerica('200', porciones)).toEqual({ ok: true, valor: 200 });
  });

  it('fuera de rango avisa en vez de recortar en silencio', () => {
    expect(validarEntradaNumerica('0', porciones)).toEqual({ ok: false, mensaje: 'El mínimo es 1.' });
    expect(validarEntradaNumerica('50000', precio)).toEqual({ ok: false, mensaje: 'El máximo es 5.000.' });
    expect(validarEntradaNumerica('-3', precio)).toEqual({ ok: false, mensaje: 'El mínimo es 0.' });
  });

  it('el redondeo se aplica antes de comparar con el mínimo (0,4 porciones → 0 → inválido)', () => {
    expect(validarEntradaNumerica('0,4', porciones).ok).toBe(false);
  });

  it('texto que no es número → mensaje de ayuda', () => {
    const r = validarEntradaNumerica('doce', precio);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/solo un número/);
  });
});

describe('textoParaEditar', () => {
  it('muestra coma decimal y sin miles', () => {
    expect(textoParaEditar(12.5, 2)).toBe('12,5');
    expect(textoParaEditar(1250, 0)).toBe('1250');
    expect(textoParaEditar(0.1 + 0.2, 2)).toBe('0,3');
  });
});

describe('decimalesPorPaso', () => {
  it('enteros si el paso es entero; centavos si no', () => {
    expect(decimalesPorPaso(1)).toBe(0);
    expect(decimalesPorPaso(10)).toBe(0);
    expect(decimalesPorPaso(0.5)).toBe(2);
  });
});

describe('interpretarNumero: separadores de miles mal formados', () => {
  it.each(['1.2.3', '1.2,5', '12.34,5', '1,2.5', '1.250,5,3'])('%j se rechaza', (texto) => {
    expect(interpretarNumero(texto)).toBeNull();
  });
});
