

import { ErrorDominio } from './tipos';

export const TOLERANCIA = 1e-9;

export function asegurarFinito(valor: number, campo: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new ErrorDominio('NUMERO_INVALIDO', `${campo} debe ser un número finito.`);
  }
  return valor;
}

export function asegurarNoNegativo(valor: number, campo: string): number {
  asegurarFinito(valor, campo);
  if (valor < 0) {
    throw new ErrorDominio('NUMERO_INVALIDO', `${campo} no puede ser negativo.`);
  }
  return valor;
}

export function asegurarPositivo(valor: number, campo: string): number {
  asegurarFinito(valor, campo);
  if (valor <= 0) {
    throw new ErrorDominio('NUMERO_INVALIDO', `${campo} debe ser mayor que cero.`);
  }
  return valor;
}

export function redondear(valor: number, decimales = 2): number {
  asegurarFinito(valor, 'valor a redondear');
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 10) {
    throw new ErrorDominio('NUMERO_INVALIDO', 'decimales debe ser un entero entre 0 y 10.');
  }
  const factor = 10 ** decimales;
  const signo = valor < 0 ? -1 : 1;
  const resultado = (signo * Math.round(Math.abs(valor) * factor * (1 + Number.EPSILON))) / factor;
  return resultado === 0 ? 0 : resultado;
}

export function redondearAlAlza(valor: number, paso = 0.5): number {
  asegurarNoNegativo(valor, 'valor');
  asegurarPositivo(paso, 'paso');
  const cociente = valor / paso;
  const entero = Math.ceil(cociente - TOLERANCIA * Math.max(1, Math.abs(cociente)));
  return redondear(entero * paso, 2);
}

export function casiIgual(a: number, b: number, tol = TOLERANCIA): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

export function esCasiCero(valor: number, tol = TOLERANCIA): boolean {
  return Math.abs(valor) <= tol;
}

export function limitar(valor: number, min: number, max: number): number {
  if (min > max) throw new ErrorDominio('NUMERO_INVALIDO', 'min no puede superar a max.');
  return Math.min(max, Math.max(min, valor));
}

export function sumaPrecisa(valores: readonly number[]): number {
  let suma = 0;
  let compensacion = 0;
  for (const v of valores) {
    asegurarFinito(v, 'sumando');
    const t = suma + v;
    compensacion += Math.abs(suma) >= Math.abs(v) ? suma - t + v : v - t + suma;
    suma = t;
  }
  return suma + compensacion;
}

const formatoBs = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearBs(valor: number): string {
  return `Bs ${formatoBs.format(redondear(valor, 2))}`;
}
