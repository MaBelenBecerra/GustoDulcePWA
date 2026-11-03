/**
 * fechas.ts — Aritmética de días calendario y semáforo de caducidad.
 *
 * Las fechas del dominio son fechas CIVILES "YYYY-MM-DD" (sin hora ni zona).
 * Toda la aritmética se hace en días UTC enteros para que el horario de
 * Bolivia (UTC-4) o un cambio de hora en el dispositivo nunca desplacen
 * un vencimiento un día.
 */
import type { FechaISO, Semaforo } from './tipos';

const MS_POR_DIA = 86_400_000;
const PATRON_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Umbral superior (inclusive) de la franja amarilla. */
export const UMBRAL_AMARILLO_DIAS = 7;

export function esFechaISO(valor: string): valor is FechaISO {
  const m = PATRON_ISO.exec(valor);
  if (!m) return false;
  const [, a, me, d] = m;
  const fecha = new Date(Date.UTC(Number(a), Number(me) - 1, Number(d)));
  // Rechaza fechas imposibles como 2026-02-30 (Date las "desborda" a marzo).
  return (
    fecha.getUTCFullYear() === Number(a) &&
    fecha.getUTCMonth() === Number(me) - 1 &&
    fecha.getUTCDate() === Number(d)
  );
}

export function asegurarFechaISO(valor: string): FechaISO {
  if (!esFechaISO(valor)) throw new RangeError(`Fecha inválida (se espera YYYY-MM-DD): "${valor}"`);
  return valor;
}

/** Número de día absoluto (días desde 1970-01-01 UTC). */
export function aDiaAbsoluto(fecha: FechaISO): number {
  const m = PATRON_ISO.exec(asegurarFechaISO(fecha));
  // m no es null porque asegurarFechaISO ya validó.
  const [, a, me, d] = m as RegExpExecArray;
  return Math.round(Date.UTC(Number(a), Number(me) - 1, Number(d)) / MS_POR_DIA);
}

export function desdeDiaAbsoluto(dia: number): FechaISO {
  if (!Number.isInteger(dia)) throw new RangeError('El día absoluto debe ser entero');
  return new Date(dia * MS_POR_DIA).toISOString().slice(0, 10) as FechaISO;
}

/** hasta − desde, en días enteros (positivo si `hasta` es posterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return aDiaAbsoluto(hasta) - aDiaAbsoluto(desde);
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  return desdeDiaAbsoluto(aDiaAbsoluto(fecha) + dias);
}

export function compararFechas(a: FechaISO, b: FechaISO): number {
  return aDiaAbsoluto(a) - aDiaAbsoluto(b);
}

/**
 * Fecha civil LOCAL del dispositivo. Usar `toISOString()` aquí sería un error:
 * a las 21:00 en Santa Cruz (UTC-4) ya es "mañana" en UTC.
 */
export function fechaLocalDe(instante: Date): FechaISO {
  const a = instante.getFullYear();
  const m = String(instante.getMonth() + 1).padStart(2, '0');
  const d = String(instante.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}` as FechaISO;
}

/** d_j = f_vencimiento − f_hoy */
export function diasRestantes(fechaVencimiento: FechaISO, hoy: FechaISO): number {
  return diasEntre(hoy, fechaVencimiento);
}

/**
 * Semáforo de caducidad:
 *  - verde:    d > 7
 *  - amarillo: 0 ≤ d ≤ 7  (vence hoy todavía es utilizable)
 *  - rojo:     d < 0      (vencido → merma)
 */
export function clasificarDias(dias: number): Semaforo {
  if (!Number.isInteger(dias)) throw new RangeError('Los días restantes deben ser enteros');
  if (dias < 0) return 'rojo';
  if (dias <= UMBRAL_AMARILLO_DIAS) return 'amarillo';
  return 'verde';
}

export function semaforoCaducidad(fechaVencimiento: FechaISO, hoy: FechaISO): Semaforo {
  return clasificarDias(diasRestantes(fechaVencimiento, hoy));
}

export function estaVencido(fechaVencimiento: FechaISO, hoy: FechaISO): boolean {
  return diasRestantes(fechaVencimiento, hoy) < 0;
}

const PRIORIDAD: Record<Semaforo, number> = { verde: 0, amarillo: 1, rojo: 2 };

/** Devuelve el estado más urgente de una lista (rojo > amarillo > verde). */
export function peorSemaforo(estados: readonly Semaforo[]): Semaforo | null {
  let peor: Semaforo | null = null;
  for (const e of estados) if (peor === null || PRIORIDAD[e] > PRIORIDAD[peor]) peor = e;
  return peor;
}
