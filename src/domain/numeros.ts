/**
 * numeros.ts — Redondeo y tolerancias numéricas.
 *
 * Política del motor: se calcula SIEMPRE con precisión completa (IEEE-754 double)
 * y se redondea SOLO en el borde (presentación o montos finales de cotización).
 * Las comparaciones contra cero usan EPSILON para absorber residuos del tipo
 * 0.1 + 0.2 = 0.30000000000000004 al partir lotes.
 */

/** Tolerancia absoluta para considerar una cantidad (g, ml, unidades, Bs) como cero. */
export const EPSILON = 1e-9;

/** Decimales monetarios del Boliviano. */
export const DECIMALES_BS = 2;

/** Lanza si el valor no es un número finito. */
export function asegurarFinito(valor: number, nombre = 'valor'): number {
  if (!Number.isFinite(valor)) {
    throw new RangeError(`${nombre} debe ser un número finito (recibido: ${valor})`);
  }
  return valor;
}

/** Lanza si el valor es negativo o no finito. Devuelve el valor para encadenar. */
export function asegurarNoNegativo(valor: number, nombre = 'valor'): number {
  asegurarFinito(valor, nombre);
  if (valor < -EPSILON) {
    throw new RangeError(`${nombre} no puede ser negativo (recibido: ${valor})`);
  }
  return valor < 0 ? 0 : valor;
}

/**
 * Redondeo "half away from zero" simétrico y robusto a errores binarios.
 * redondear(1.005, 2) === 1.01 (Math.round ingenuo devuelve 1.00).
 */
export function redondear(valor: number, decimales = DECIMALES_BS): number {
  asegurarFinito(valor, 'valor a redondear');
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 12) {
    throw new RangeError(`decimales inválidos: ${decimales}`);
  }
  const factor = 10 ** decimales;
  const signo = valor < 0 ? -1 : 1;
  // toPrecision(15) elimina la "basura" binaria antes de redondear.
  const escalado = Number((Math.abs(valor) * factor).toPrecision(15));
  const resultado = (signo * Math.round(escalado)) / factor;
  return Object.is(resultado, -0) ? 0 : resultado;
}

/** Redondeo monetario a centavos de Boliviano. */
export function redondearBs(valor: number): number {
  return redondear(valor, DECIMALES_BS);
}

/** Igualdad con tolerancia relativa/absoluta combinada. */
export function casiIgual(a: number, b: number, tolerancia = EPSILON): boolean {
  return Math.abs(a - b) <= tolerancia * Math.max(1, Math.abs(a), Math.abs(b));
}

export function esCero(valor: number): boolean {
  return Math.abs(valor) <= EPSILON;
}

/** Convierte residuos ínfimos (p. ej. 1e-14) en 0 exacto. */
export function limpiarResiduo(valor: number): number {
  return esCero(valor) ? 0 : valor;
}

/** Suma compensada (Neumaier): estable al acumular muchos montos pequeños. */
export function sumar(valores: readonly number[]): number {
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

export function acotar(valor: number, minimo: number, maximo: number): number {
  if (minimo > maximo) throw new RangeError('acotar: mínimo mayor que máximo');
  return Math.min(maximo, Math.max(minimo, valor));
}
