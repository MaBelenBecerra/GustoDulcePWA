import { describe, expect, it } from 'vitest';
import {
  asegurarFechaISO,
  clasificarDias,
  diasEntre,
  diasRestantes,
  esFechaISO,
  estaVencido,
  fechaLocalDe,
  peorSemaforo,
  semaforoCaducidad,
  sumarDias,
} from '../fechas';

describe('validación de FechaISO', () => {
  it('acepta fechas reales y rechaza imposibles o mal formadas', () => {
    expect(esFechaISO('2026-11-03')).toBe(true);
    expect(esFechaISO('2028-02-29')).toBe(true); // bisiesto
    expect(esFechaISO('2026-02-29')).toBe(false);
    expect(esFechaISO('2026-13-01')).toBe(false);
    expect(esFechaISO('3/11/2026')).toBe(false);
    expect(() => asegurarFechaISO('2026-04-31')).toThrow(RangeError);
  });
});

describe('aritmética de días', () => {
  it('cruza fin de mes y de año', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(sumarDias('2026-11-28', 5)).toBe('2026-12-03');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('respeta años bisiestos', () => {
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('fechaLocalDe usa la fecha civil local, no UTC', () => {
    // 23:30 hora local: con toISOString() podría "saltar" al día siguiente.
    const tarde = new Date(2026, 10, 3, 23, 30);
    expect(fechaLocalDe(tarde)).toBe('2026-11-03');
  });
});

describe('semáforo de caducidad', () => {
  const hoy = '2026-11-03';

  it('verde cuando faltan más de 7 días', () => {
    expect(semaforoCaducidad('2026-11-11', hoy)).toBe('verde'); // d = 8
  });

  it('amarillo en el rango inclusivo 0..7', () => {
    expect(semaforoCaducidad('2026-11-10', hoy)).toBe('amarillo'); // d = 7 (frontera)
    expect(semaforoCaducidad('2026-11-03', hoy)).toBe('amarillo'); // vence hoy
  });

  it('rojo cuando ya venció', () => {
    expect(semaforoCaducidad('2026-11-02', hoy)).toBe('rojo'); // d = -1
    expect(estaVencido('2026-11-02', hoy)).toBe(true);
    expect(estaVencido('2026-11-03', hoy)).toBe(false);
  });

  it('diasRestantes = f_venc − f_hoy', () => {
    expect(diasRestantes('2026-11-13', hoy)).toBe(10);
    expect(diasRestantes('2026-10-31', hoy)).toBe(-3);
  });

  it('clasificarDias rechaza fracciones', () => {
    expect(() => clasificarDias(2.5)).toThrow(RangeError);
  });

  it('peorSemaforo prioriza rojo > amarillo > verde', () => {
    expect(peorSemaforo(['verde', 'amarillo', 'verde'])).toBe('amarillo');
    expect(peorSemaforo(['verde', 'rojo', 'amarillo'])).toBe('rojo');
    expect(peorSemaforo([])).toBeNull();
  });
});
