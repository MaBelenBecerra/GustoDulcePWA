
import { redondear } from './numeros';

export function interpretarNumero(texto: string): number | null {
  let limpio = texto
    .trim()
    .toLowerCase()
    .replace(/bs\.?|%|kg|ml|min|h|días|dias|g|u|l/g, '')
    .replace(/\s+/g, '');
  if (limpio === '') return null;

  
  const milesValidos = (entero: string, sep: string) => new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`).test(entero);

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    const posDecimal = Math.max(ultimaComa, ultimoPunto);
    const entero = limpio.slice(0, posDecimal);
    if (!milesValidos(entero, miles)) return null;
    limpio = `${entero.split(miles).join('')}.${limpio.slice(posDecimal + 1)}`;
  } else if (ultimaComa >= 0) {
    if (limpio.indexOf(',') !== ultimaComa) return null; 
    limpio = limpio.replace(',', '.');
  } else if (ultimoPunto >= 0 && limpio.indexOf('.') !== ultimoPunto) {
    if (!milesValidos(limpio, '.')) return null;
    limpio = limpio.split('.').join(''); 
  }
  

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(limpio)) return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

export interface LimitesEntrada {
  readonly min: number;
  readonly max: number;
  
  readonly decimales: number;
}

export type ResultadoEntrada = { readonly ok: true; readonly valor: number } | { readonly ok: false; readonly mensaje: string };

const formatoLimite = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });

export function validarEntradaNumerica(texto: string, { min, max, decimales }: LimitesEntrada): ResultadoEntrada {
  const numero = interpretarNumero(texto);
  if (numero === null) return { ok: false, mensaje: 'Escribe solo un número, por ejemplo 250 o 12,5.' };
  const valor = redondear(numero, decimales);
  if (valor < min) return { ok: false, mensaje: `El mínimo es ${formatoLimite.format(min)}.` };
  if (valor > max) return { ok: false, mensaje: `El máximo es ${formatoLimite.format(max)}.` };
  return { ok: true, valor };
}


export function textoParaEditar(valor: number, decimales: number): string {
  return String(redondear(valor, decimales)).replace('.', ',');
}


export function decimalesPorPaso(paso: number): number {
  return Number.isInteger(paso) ? 0 : 2;
}
