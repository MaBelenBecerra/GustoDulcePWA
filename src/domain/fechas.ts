/**
 * GustoDulce · Dominio · Aritmética de días y semáforo de caducidad.
 *
 * Las fechas se manejan como días de calendario ('YYYY-MM-DD') convertidos a
 * "día epoch" en UTC. Así el cálculo es puro, no depende de la zona horaria
 * del dispositivo ni de cambios de horario, y "hoy" siempre se recibe como
 * parámetro (el dominio nunca lee el reloj del sistema).
 */
import { ErrorDominio, UMBRAL_AMARILLO_DIAS } from './tipos';
import type { FechaISO, Semaforo } from './tipos';

const PATRON_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 86_400_000;

/** Convierte 'YYYY-MM-DD' a días desde 1970-01-01. Rechaza fechas imposibles (2026-02-30). */
export function aDiaEpoch(fecha: FechaISO): number {
  const m = PATRON_ISO.exec(fecha);
  if (!m) throw new ErrorDominio('FECHA_INVALIDA', `Formato de fecha inválido: "${fecha}".`);
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const ms = Date.UTC(anio, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new ErrorDominio('FECHA_INVALIDA', `La fecha "${fecha}" no existe en el calendario.`);
  }
  return Math.round(ms / MS_POR_DIA);
}

/** Convierte un día epoch a 'YYYY-MM-DD'. */
export function desdeDiaEpoch(diaEpoch: number): FechaISO {
  if (!Number.isInteger(diaEpoch)) {
    throw new ErrorDominio('FECHA_INVALIDA', 'El día epoch debe ser un entero.');
  }
  return new Date(diaEpoch * MS_POR_DIA).toISOString().slice(0, 10);
}

/** ¿Es una fecha ISO válida? */
export function esFechaValida(fecha: string): boolean {
  try {
    aDiaEpoch(fecha);
    return true;
  } catch {
    return false;
  }
}

/** Días transcurridos de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return aDiaEpoch(hasta) - aDiaEpoch(desde);
}

/** Suma (o resta) días enteros a una fecha. */
export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  if (!Number.isInteger(dias)) {
    throw new ErrorDominio('FECHA_INVALIDA', 'Solo se pueden sumar días enteros.');
  }
  return desdeDiaEpoch(aDiaEpoch(fecha) + dias);
}

/** Comparador para ordenar fechas ascendentemente. */
export function compararFechas(a: FechaISO, b: FechaISO): number {
  return aDiaEpoch(a) - aDiaEpoch(b);
}

/** d_j = f_vencimiento − f_hoy. */
export function diasRestantes(vencimiento: FechaISO, hoy: FechaISO): number {
  return diasEntre(hoy, vencimiento);
}

/** Semáforo a partir de los días restantes ya calculados. */
export function semaforoPorDias(dias: number): Semaforo {
  if (!Number.isInteger(dias)) {
    throw new ErrorDominio('FECHA_INVALIDA', 'Los días restantes deben ser enteros.');
  }
  if (dias < 0) return 'rojo';
  if (dias <= UMBRAL_AMARILLO_DIAS) return 'amarillo';
  return 'verde';
}

/**
 * Semáforo de caducidad:
 *  - Verde:    d > 7
 *  - Amarillo: 0 ≤ d ≤ 7 (un lote que vence HOY todavía se puede usar)
 *  - Rojo:     d < 0 (vencido → merma financiera)
 */
export function semaforo(vencimiento: FechaISO, hoy: FechaISO): Semaforo {
  return semaforoPorDias(diasRestantes(vencimiento, hoy));
}

/** Severidad numérica para escoger el peor semáforo de un conjunto. */
export const SEVERIDAD_SEMAFORO: Readonly<Record<Semaforo, number>> = {
  verde: 0,
  amarillo: 1,
  rojo: 2,
};

/**
 * Fecha local del dispositivo como 'YYYY-MM-DD'. Es el ÚNICO punto que toca
 * un `Date` del sistema; la capa de presentación lo llama y pasa el resultado
 * al motor. Usa la fecha local (America/La_Paz), no UTC: a las 21:00 en
 * Santa Cruz ya es el día siguiente en UTC.
 */
export function fechaLocalISO(fecha: Date): FechaISO {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}
