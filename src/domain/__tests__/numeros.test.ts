import { describe, expect, it } from 'vitest';
import {
  EPSILON,
  acotar,
  asegurarNoNegativo,
  casiIgual,
  esCero,
  limpiarResiduo,
  redondear,
  redondearBs,
  sumar,
} from '../numeros';

describe('redondear', () => {
  it('corrige el clásico 1.005 → 1.01 (Math.round ingenuo da 1.00)', () => {
    expect(redondear(1.005, 2)).toBe(1.01);
    expect(redondearBs(2.675)).toBe(2.68);
  });

  it('es simétrico para negativos y nunca devuelve -0', () => {
    expect(redondear(-1.005, 2)).toBe(-1.01);
    expect(Object.is(redondear(-0.001, 2), 0)).toBe(true);
  });

  it('respeta los decimales pedidos', () => {
    expect(redondear(0.2864583333, 4)).toBe(0.2865);
    expect(redondear(12.5, 0)).toBe(13);
  });

  it('rechaza valores no finitos y decimales inválidos', () => {
    expect(() => redondear(Number.NaN)).toThrow(RangeError);
    expect(() => redondear(Infinity)).toThrow(RangeError);
    expect(() => redondear(1, -1)).toThrow(RangeError);
    expect(() => redondear(1, 1.5)).toThrow(RangeError);
  });
});

describe('tolerancias', () => {
  it('casiIgual absorbe el error binario 0.1 + 0.2', () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(casiIgual(0.1 + 0.2, 0.3)).toBe(true);
    expect(casiIgual(1, 1.001)).toBe(false);
  });

  it('esCero / limpiarResiduo eliminan residuos ínfimos', () => {
    const residuo = 0.3 - (0.1 + 0.2); // ≈ -5.55e-17
    expect(esCero(residuo)).toBe(true);
    expect(limpiarResiduo(residuo)).toBe(0);
    expect(limpiarResiduo(EPSILON * 10)).toBe(EPSILON * 10);
  });

  it('asegurarNoNegativo tolera -ε pero rechaza negativos reales', () => {
    expect(asegurarNoNegativo(-1e-12)).toBe(0);
    expect(() => asegurarNoNegativo(-0.01, 'cantidad')).toThrow(/cantidad/);
  });
});

describe('sumar (Neumaier)', () => {
  it('es más exacto que la suma ingenua con muchos sumandos pequeños', () => {
    const valores = Array.from({ length: 10_000 }, () => 0.1);
    expect(sumar(valores)).toBe(1000);
    expect(valores.reduce((a, b) => a + b, 0)).not.toBe(1000);
  });

  it('suma vacía es 0', () => {
    expect(sumar([])).toBe(0);
  });
});

describe('acotar', () => {
  it('limita al rango', () => {
    expect(acotar(15, 0, 10)).toBe(10);
    expect(acotar(-3, 0, 10)).toBe(0);
    expect(() => acotar(1, 5, 0)).toThrow();
  });
});
