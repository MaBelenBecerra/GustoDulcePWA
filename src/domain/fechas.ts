

import { ErrorDominio, UMBRAL_AMARILLO_DIAS } from './tipos';
import type { FechaISO, Semaforo } from './tipos';

const PATRON_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 86_400_000;

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

export function desdeDiaEpoch(diaEpoch: number): FechaISO {
  if (!Number.isInteger(diaEpoch)) {
    throw new ErrorDominio('FECHA_INVALIDA', 'El día epoch debe ser un entero.');
  }
  return new Date(diaEpoch * MS_POR_DIA).toISOString().slice(0, 10);
}

export function esFechaValida(fecha: string): boolean {
  try {
    aDiaEpoch(fecha);
    return true;
  } catch {
    return false;
  }
}

export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return aDiaEpoch(hasta) - aDiaEpoch(desde);
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  if (!Number.isInteger(dias)) {
    throw new ErrorDominio('FECHA_INVALIDA', 'Solo se pueden sumar días enteros.');
  }
  return desdeDiaEpoch(aDiaEpoch(fecha) + dias);
}

export function compararFechas(a: FechaISO, b: FechaISO): number {
  return aDiaEpoch(a) - aDiaEpoch(b);
}

export function diasRestantes(vencimiento: FechaISO, hoy: FechaISO): number {
  return diasEntre(hoy, vencimiento);
}

export function semaforoPorDias(dias: number): Semaforo {
  if (!Number.isInteger(dias)) {
    throw new ErrorDominio('FECHA_INVALIDA', 'Los días restantes deben ser enteros.');
  }
  if (dias < 0) return 'rojo';
  if (dias <= UMBRAL_AMARILLO_DIAS) return 'amarillo';
  return 'verde';
}

export function semaforo(vencimiento: FechaISO, hoy: FechaISO): Semaforo {
  return semaforoPorDias(diasRestantes(vencimiento, hoy));
}

export const SEVERIDAD_SEMAFORO: Readonly<Record<Semaforo, number>> = {
  verde: 0,
  amarillo: 1,
  rojo: 2,
};

export function fechaLocalISO(fecha: Date): FechaISO {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}
