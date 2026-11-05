/**
 * GustoDulce · Dominio · Costeo ABC (MPD, MOD, CIF) y precio sugerido.
 *
 * Funciones puras y deterministas. Ningún cálculo se delega a un modelo de
 * lenguaje: el módulo conversacional solo redacta a partir de estos números.
 *
 *   MPD:   C_MPD = Σ Q_i · P_i / (U_i · (1 − m_i))
 *   MOD:   T_min = Sueldo / (60 · H_mes)        ← H_mes lo configura la repostera
 *          C_MOD = T_min · (t_elaboración + t_horneado)
 *   CIF:   r     = (Luz + Agua + Gas) / (60 · H_mes)
 *          C_CIF = r · (t_elaboración + t_horneado)
 *   Total: C_u   = (C_MPD + C_MOD + C_CIF) / N
 *          P_v   = C_u / (1 − g),  0 ≤ g < 1
 */
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

/* ───────────── Validaciones ───────────── */

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

/* ───────────── MPD ───────────── */

/** Costo efectivo por unidad base, ya ajustado por merma: P / (U · (1 − m)). */
export function costoPorUnidadBase(insumo: Insumo): number {
  validarInsumo(insumo);
  return insumo.presentacion.precio / (insumo.presentacion.cantidad * (1 - insumo.merma));
}

/** Cantidad bruta que sale de la despensa para obtener `neta` utilizable: Q / (1 − m). */
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

/** Costo de materia prima a precios de referencia del catálogo (para cotizar). */
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

/* ───────────── MOD ───────────── */

/** Tarifa por minuto: Sueldo / (60 · horas reales al mes). */
export function tasaMinutoMOD(config: ConfiguracionCostos): number {
  validarConfiguracion(config);
  return config.sueldoMensual / (60 * config.horasTrabajoMes);
}

/** Minutos imputables a la receta (actividades de elaboración + horneado). */
export function minutosReceta(receta: Receta): number {
  return receta.minutosElaboracion + receta.minutosHorneado;
}

export function calcularMOD(receta: Receta, config: ConfiguracionCostos): number {
  validarReceta(receta);
  return tasaMinutoMOD(config) * minutosReceta(receta);
}

/* ───────────── CIF ───────────── */

/** Costo indirecto promedio por minuto: (Luz + Agua + Gas) / (60 · horas al mes). */
export function tasaMinutoCIF(config: ConfiguracionCostos): number {
  validarConfiguracion(config);
  const { luz, agua, gas } = config.servicios;
  return sumaPrecisa([luz, agua, gas]) / (60 * config.horasTrabajoMes);
}

export function calcularCIF(receta: Receta, config: ConfiguracionCostos): number {
  validarReceta(receta);
  return tasaMinutoCIF(config) * minutosReceta(receta);
}

/* ───────────── Consolidado ───────────── */

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

/* ───────────── Precio ───────────── */

/** P_v = C_u / (1 − g). El margen g es sobre el precio de venta (0 ≤ g < 1). */
export function precioSugerido(costoUnitario: number, margen: number): number {
  asegurarNoNegativo(costoUnitario, 'Costo unitario');
  asegurarFinito(margen, 'Margen');
  if (margen < 0 || margen >= 1) {
    throw new ErrorDominio('MARGEN_INVALIDO', 'El margen debe cumplir 0 ≤ g < 1.');
  }
  return costoUnitario / (1 - margen);
}

export interface Cotizacion {
  readonly recetaId: Id;
  readonly unidades: number;
  readonly margen: number;
  readonly costoUnitario: number;
  /** Precio exacto redondeado al centavo. */
  readonly precioUnitario: number;
  /** Precio redondeado hacia arriba al múltiplo comercial (por defecto Bs 0,50). */
  readonly precioUnitarioComercial: number;
  readonly precioTotal: number;
  readonly costoTotal: number;
  readonly gananciaTotal: number;
}

export function cotizar(
  receta: Receta,
  insumos: ReadonlyMap<Id, Insumo>,
  config: ConfiguracionCostos,
  unidades: number,
  margen: number,
  pasoComercial = 0.5,
): Cotizacion {
  if (!Number.isInteger(unidades) || unidades < 1) {
    throw new ErrorDominio('NUMERO_INVALIDO', 'Se debe cotizar al menos 1 unidad entera.');
  }
  const costo = calcularCostoReceta(receta, insumos, config);
  const exacto = precioSugerido(costo.unitario, margen);
  const comercial = redondearAlAlza(exacto, pasoComercial);
  const precioTotal = redondear(comercial * unidades, 2);
  const costoTotal = redondear(costo.unitario * unidades, 2);
  return {
    recetaId: receta.id,
    unidades,
    margen,
    costoUnitario: costo.unitario,
    precioUnitario: redondear(exacto, 2),
    precioUnitarioComercial: comercial,
    precioTotal,
    costoTotal,
    gananciaTotal: redondear(precioTotal - costoTotal, 2),
  };
}
