import { ErrorDominio, HORAS_MES_MAXIMO } from './tipos';
import type { ConfiguracionCostos, Id, Insumo, Receta } from './tipos';
import {
  asegurarFinito,
  asegurarNoNegativo,
  asegurarPositivo,
  redondear,
  redondearAlAlza,
  sumaPrecisa,
} from './numeros';



export function validarInsumo(insumo: Insumo): void {
  asegurarPositivo(insumo.presentacion.cantidad, `Presentación de ${insumo.nombre}`);
  asegurarNoNegativo(insumo.presentacion.precio, `Precio de ${insumo.nombre}`);
  asegurarFinito(insumo.merma, `Merma de ${insumo.nombre}`);
  if (insumo.merma < 0 || insumo.merma >= 1) {
    throw new ErrorDominio('INSUMO_INVALIDO', `La merma de ${insumo.nombre} debe cumplir 0 ≤ m < 1.`);
  }
}

export function validarReceta(receta: Receta): void {
  if (!Number.isInteger(receta.porciones) || receta.porciones < 1) {
    throw new ErrorDominio('RECETA_INVALIDA', `"${receta.nombre}" debe rendir al menos 1 porción entera.`);
  }
  asegurarNoNegativo(receta.minutosElaboracion, 'Minutos de elaboración');
  asegurarNoNegativo(receta.minutosHorneado, 'Minutos de horneado');
  for (const ing of receta.ingredientes) asegurarNoNegativo(ing.cantidad, 'Cantidad de ingrediente');
}

export function validarConfiguracion(config: ConfiguracionCostos): void {
  asegurarNoNegativo(config.sueldoMensual, 'Sueldo mensual');
  asegurarFinito(config.horasTrabajoMes, 'Horas de trabajo al mes');
  if (config.horasTrabajoMes <= 0 || config.horasTrabajoMes > HORAS_MES_MAXIMO) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `Las horas al mes deben estar entre 1 y ${HORAS_MES_MAXIMO}.`,
    );
  }
  asegurarNoNegativo(config.servicios.luz, 'Monto de luz');
  asegurarNoNegativo(config.servicios.agua, 'Monto de agua');
  asegurarNoNegativo(config.servicios.gas, 'Monto de gas');
}




export function costoPorUnidadBase(insumo: Insumo): number {
  validarInsumo(insumo);
  return insumo.presentacion.precio / (insumo.presentacion.cantidad * (1 - insumo.merma));
}


export function cantidadBruta(neta: number, merma: number): number {
  asegurarNoNegativo(neta, 'Cantidad neta');
  if (merma < 0 || merma >= 1) {
    throw new ErrorDominio('INSUMO_INVALIDO', 'La merma debe cumplir 0 ≤ m < 1.');
  }
  return neta / (1 - merma);
}

export interface LineaMPD {
  readonly insumoId: Id;
  readonly nombre: string;
  readonly cantidad: number;
  readonly costo: number;
}

export interface DetalleMPD {
  readonly total: number;
  readonly lineas: readonly LineaMPD[];
}


export function calcularMPD(receta: Receta, insumos: ReadonlyMap<Id, Insumo>): DetalleMPD {
  const lineas = receta.ingredientes.map((ing): LineaMPD => {
    const insumo = insumos.get(ing.insumoId);
    if (!insumo) {
      throw new ErrorDominio('INSUMO_DESCONOCIDO', `La receta usa un insumo inexistente: ${ing.insumoId}.`);
    }
    asegurarNoNegativo(ing.cantidad, `Cantidad de ${insumo.nombre}`);
    return {
      insumoId: insumo.id,
      nombre: insumo.nombre,
      cantidad: ing.cantidad,
      costo: ing.cantidad * costoPorUnidadBase(insumo),
    };
  });
  return { total: sumaPrecisa(lineas.map((l) => l.costo)), lineas };
}


export function tasaMinutoMOD(config: ConfiguracionCostos): number {
  validarConfiguracion(config);
  return config.sueldoMensual / (60 * config.horasTrabajoMes);
}


export function minutosReceta(receta: Receta): number {
  return receta.minutosElaboracion + receta.minutosHorneado;
}

export function calcularMOD(receta: Receta, config: ConfiguracionCostos): number {
  validarReceta(receta);
  return tasaMinutoMOD(config) * minutosReceta(receta);
}

export function tasaMinutoCIF(config: ConfiguracionCostos): number {
  validarConfiguracion(config);
  const { luz, agua, gas } = config.servicios;
  return sumaPrecisa([luz, agua, gas]) / (60 * config.horasTrabajoMes);
}

export function calcularCIF(receta: Receta, config: ConfiguracionCostos): number {
  validarReceta(receta);
  return tasaMinutoCIF(config) * minutosReceta(receta);
}

export interface CostoReceta {
  readonly mpd: number;
  readonly mod: number;
  readonly cif: number;
  readonly total: number;
  readonly porciones: number;
  readonly unitario: number;
  readonly lineasMPD: readonly LineaMPD[];
}

export function calcularCostoReceta(
  receta: Receta,
  insumos: ReadonlyMap<Id, Insumo>,
  config: ConfiguracionCostos,
): CostoReceta {
  validarReceta(receta);
  const detalle = calcularMPD(receta, insumos);
  const mod = calcularMOD(receta, config);
  const cif = calcularCIF(receta, config);
  const total = sumaPrecisa([detalle.total, mod, cif]);
  return {
    mpd: detalle.total,
    mod,
    cif,
    total,
    porciones: receta.porciones,
    unitario: total / receta.porciones,
    lineasMPD: detalle.lineas,
  };
}


export interface Cotizacion {
  readonly recetaId: Id;
  readonly unidades: number;
  readonly costoUnitario: number;
  readonly precioUnitarioComercial: number;
  readonly precioTotal: number;
  readonly materiaPrima: number;
  readonly costosIndirectos: number;
  readonly manoDeObra: number;
  readonly redondeo: number;
  readonly ganancia: number;
}

export function cotizar(
  receta: Receta,
  insumos: ReadonlyMap<Id, Insumo>,
  config: ConfiguracionCostos,
  unidades: number,
  pasoComercial = 0.5,
): Cotizacion {
  if (!Number.isInteger(unidades) || unidades < 1) {
    throw new ErrorDominio('NUMERO_INVALIDO', 'Se debe cotizar al menos 1 unidad entera.');
  }
  const costo = calcularCostoReceta(receta, insumos, config);
  const factor = unidades / costo.porciones;
  const materiaPrima = redondear(costo.mpd * factor, 2);
  const costosIndirectos = redondear(costo.cif * factor, 2);
  const manoDeObra = redondear(costo.mod * factor, 2);
  const comercial = redondearAlAlza(costo.unitario, pasoComercial);
  const precioTotal = redondear(comercial * unidades, 2);
  const ganancia = redondear(precioTotal - materiaPrima - costosIndirectos, 2);
  return {
    recetaId: receta.id,
    unidades,
    costoUnitario: costo.unitario,
    precioUnitarioComercial: comercial,
    precioTotal,
    materiaPrima,
    costosIndirectos,
    manoDeObra,
    redondeo: redondear(ganancia - manoDeObra, 2),
    ganancia,
  };
}


export function validarNombre(nombre: string, que: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  if (limpio.length < 2 || limpio.length > 60) {
    throw new ErrorDominio('NOMBRE_INVALIDO', `El nombre ${que} debe tener entre 2 y 60 letras.`);
  }
  return limpio;
}
