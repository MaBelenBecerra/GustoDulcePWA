import { describe, expect, it } from 'vitest';
import {
  aDiaEpoch,
  desdeDiaEpoch,
  diasEntre,
  diasRestantes,
  ErrorDominio,
  esFechaValida,
  fechaLocalISO,
  semaforo,
  sumarDias,
} from '../index';

const HOY = '2026-11-05';

describe('aritmética de días', () => {
  it('cuenta días dentro del mes y entre meses', () => {
    expect(diasEntre('2026-11-05', '2026-11-12')).toBe(7);
    expect(diasEntre('2026-10-30', '2026-11-02')).toBe(3);
    expect(diasEntre('2026-11-12', '2026-11-05')).toBe(-7);
  });

  it('respeta años bisiestos', () => {
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('suma días cruzando el fin de año', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('ida y vuelta por día epoch', () => {
    expect(desdeDiaEpoch(aDiaEpoch(HOY))).toBe(HOY);
  });

  it('rechaza formatos y fechas imposibles', () => {
    expect(() => aDiaEpoch('2026-02-30')).toThrow(ErrorDominio);
    expect(() => aDiaEpoch('2026-1-05')).toThrow(ErrorDominio);
    expect(() => aDiaEpoch('05/11/2026')).toThrow(ErrorDominio);
    expect(esFechaValida('2026-13-01')).toBe(false);
    expect(esFechaValida(HOY)).toBe(true);
  });

  it('no permite sumar fracciones de día', () => {
    expect(() => sumarDias(HOY, 1.5)).toThrow(ErrorDominio);
  });
});

describe('semáforo de caducidad', () => {
  it('verde con más de 7 días', () => {
    expect(diasRestantes('2026-11-13', HOY)).toBe(8);
    expect(semaforo('2026-11-13', HOY)).toBe('verde');
  });

  it('amarillo exactamente en el borde de 7 días', () => {
    expect(semaforo('2026-11-12', HOY)).toBe('amarillo');
  });

  it('amarillo si vence hoy (todavía utilizable)', () => {
    expect(semaforo(HOY, HOY)).toBe('amarillo');
  });

  it('rojo desde el día siguiente al vencimiento', () => {
    expect(semaforo('2026-11-04', HOY)).toBe('rojo');
  });
});

describe('fechaLocalISO', () => {
  it('usa la fecha local, no UTC (23:30 sigue siendo el mismo día)', () => {
    expect(fechaLocalISO(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
    expect(fechaLocalISO(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});
