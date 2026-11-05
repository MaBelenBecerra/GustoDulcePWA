import { describe, expect, it } from 'vitest';
import {
  casiIgual,
  ErrorDominio,
  esCasiCero,
  formatearBs,
  limitar,
  redondear,
  redondearAlAlza,
  sumaPrecisa,
} from '../index';

describe('redondear', () => {
  it('corrige el caso clásico de punto flotante 1.005 → 1.01', () => {
    expect(redondear(1.005)).toBe(1.01);
    expect(redondear(2.675)).toBe(2.68);
  });

  it('redondea mitad lejos de cero en negativos', () => {
    expect(redondear(-1.005)).toBe(-1.01);
  });

  it('nunca devuelve -0', () => {
    expect(Object.is(redondear(-0.001), 0)).toBe(true);
  });

  it('admite otros decimales', () => {
    expect(redondear(0.458333333, 4)).toBe(0.4583);
    expect(redondear(12.5, 0)).toBe(13);
  });

  it('rechaza NaN, Infinity y decimales inválidos', () => {
    expect(() => redondear(Number.NaN)).toThrow(ErrorDominio);
    expect(() => redondear(Number.POSITIVE_INFINITY)).toThrow(ErrorDominio);
    expect(() => redondear(1, -1)).toThrow(ErrorDominio);
  });
});

describe('redondearAlAlza (precio comercial)', () => {
  it('sube al siguiente múltiplo de Bs 0,50', () => {
    expect(redondearAlAlza(23.12)).toBe(23.5);
    expect(redondearAlAlza(23.51)).toBe(24);
  });

  it('no sube un valor que ya es múltiplo, aunque arrastre residuo flotante', () => {
    expect(redondearAlAlza(23.5)).toBe(23.5);
    expect(redondearAlAlza(0.1 + 0.2, 0.1)).toBe(0.3);
  });

  it('rechaza paso no positivo', () => {
    expect(() => redondearAlAlza(10, 0)).toThrow(ErrorDominio);
  });
});

describe('tolerancias', () => {
  it('casiIgual absorbe 0.1 + 0.2', () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(casiIgual(0.1 + 0.2, 0.3)).toBe(true);
    expect(casiIgual(1, 1.001)).toBe(false);
  });

  it('esCasiCero', () => {
    expect(esCasiCero(1e-12)).toBe(true);
    expect(esCasiCero(1e-6)).toBe(false);
  });

  it('limitar acota al intervalo', () => {
    expect(limitar(5, 0, 3)).toBe(3);
    expect(limitar(-2, 0, 3)).toBe(0);
    expect(limitar(2, 0, 3)).toBe(2);
  });
});

describe('sumaPrecisa', () => {
  it('suma diez veces 0.1 exactamente a 1', () => {
    const diezDecimos = Array.from({ length: 10 }, () => 0.1);
    expect(diezDecimos.reduce((a, b) => a + b, 0)).not.toBe(1);
    expect(sumaPrecisa(diezDecimos)).toBe(1);
  });

  it('una lista vacía suma 0', () => {
    expect(sumaPrecisa([])).toBe(0);
  });
});

describe('formatearBs', () => {
  it('antepone Bs y muestra dos decimales', () => {
    const texto = formatearBs(12.5);
    expect(texto.startsWith('Bs ')).toBe(true);
    expect(texto).toMatch(/12[.,]50$/);
  });
});
