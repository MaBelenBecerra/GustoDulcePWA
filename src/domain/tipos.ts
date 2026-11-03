/**
 * tipos.ts — Entidades y objetos de valor del dominio GustoDulce.
 * Sin dependencias de React, del navegador ni de persistencia.
 */

/** Fecha civil en formato YYYY-MM-DD (sin hora ni zona horaria). */
export type FechaISO = `${number}-${number}-${number}`;

/** Unidad base de consumo. Toda cantidad del dominio se expresa en ella. */
export type UnidadBase = 'g' | 'ml' | 'unidad';

export type Semaforo = 'verde' | 'amarillo' | 'rojo';

/** Resultado explícito: el dominio no lanza por reglas de negocio esperadas. */
export type Resultado<T, E> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

export const exito = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor });
export const fallo = <E>(error: E): Resultado<never, E> => ({ ok: false, error });

// ─────────────────────────── Inventario ───────────────────────────

export interface Insumo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: UnidadBase;
  /** Factor de merma de proceso m_i (0 ≤ m < 1). Ej.: 0.12 = 12 % de cáscara/desperdicio. */
  readonly merma: number;
}

/** Lote de compra de un insumo, con su propio costo y vencimiento. */
export interface Lote {
  readonly id: string;
  readonly insumoId: string;
  readonly cantidadInicial: number;
  /** q_j — cantidad todavía disponible, en unidad base. */
  readonly cantidadDisponible: number;
  /** c_j — costo en Bs por unidad base (Bs/g, Bs/ml o Bs/unidad). */
  readonly costoUnitario: number;
  readonly fechaIngreso: FechaISO;
  /** f_j */
  readonly fechaVencimiento: FechaISO;
}

/** Porción de un lote tomada por una salida (x_j). */
export interface TomaLote {
  readonly loteId: string;
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly costo: number;
}

export interface PlanSalida {
  readonly insumoId: string;
  readonly cantidadSolicitada: number;
  readonly tomas: readonly TomaLote[];
  readonly costoTotal: number;
}

export interface Faltante {
  readonly insumoId: string;
  readonly requerido: number;
  readonly disponible: number;
  readonly faltante: number;
}

export interface BajaPorVencimiento {
  readonly loteId: string;
  readonly insumoId: string;
  readonly cantidad: number;
  readonly costo: number;
}

// ─────────────────────────── Recetas ───────────────────────────

export interface IngredienteReceta {
  readonly insumoId: string;
  /** Cantidad NETA que entra en la receta (antes de merma), en unidad base. */
  readonly cantidad: number;
}

export interface Receta {
  readonly id: string;
  readonly nombre: string;
  /** N — unidades/porciones que rinde una elaboración completa. */
  readonly rendimiento: number;
  readonly ingredientes: readonly IngredienteReceta[];
  /** Minutos de trabajo manual (preparación + decorado), ingresados por la usuaria. */
  readonly minutosElaboracion: number;
  /** Minutos de horno, ingresados por la usuaria. */
  readonly minutosHorneado: number;
}

// ─────────────────────────── Costos fijos ───────────────────────────

export type TipoServicio = 'luz' | 'agua' | 'gas';

/** Sobre qué minutos de la receta se prorratea un servicio. */
export type BaseProrrateo = 'total' | 'horneado';

export interface ServicioFijo {
  readonly id: string;
  readonly tipo: TipoServicio;
  readonly nombre: string;
  /** Monto mensual de la factura, en Bs. */
  readonly montoMensual: number;
  readonly aplicaA: BaseProrrateo;
}

/** Parámetros de la jornada para MOD y para el prorrateo de CIF. */
export interface ConfigLaboral {
  readonly salarioMensual: number;
  readonly diasLaborablesMes: number;
  readonly horasPorDia: number;
}

// ─────────────────────────── Costeo ───────────────────────────

export type OrigenCostoMPD = 'stock' | 'stock+referencia' | 'referencia' | 'sin-precio';

export interface LineaMPD {
  readonly insumoId: string;
  readonly nombre: string;
  readonly cantidadNeta: number;
  /** Q / (1 − m): lo que realmente sale de despensa. */
  readonly cantidadBruta: number;
  readonly costo: number;
  readonly origen: OrigenCostoMPD;
}

export interface DesgloseMPD {
  readonly total: number;
  readonly lineas: readonly LineaMPD[];
}

export interface LineaCIF {
  readonly servicioId: string;
  readonly nombre: string;
  readonly tasaPorMinuto: number;
  readonly minutos: number;
  readonly costo: number;
}

export interface DesgloseCIF {
  readonly total: number;
  readonly lineas: readonly LineaCIF[];
}

export interface Cotizacion {
  readonly recetaId: string;
  readonly unidades: number;
  readonly margen: number;
  /** Costos de UNA elaboración completa de la receta (rinde N). */
  readonly mpd: DesgloseMPD;
  readonly mod: number;
  readonly cif: DesgloseCIF;
  readonly costoReceta: number;
  /** C_u = (MPD + MOD + CIF) / N */
  readonly costoUnitario: number;
  /** P_v = C_u / (1 − g), redondeado a centavos. */
  readonly precioUnitario: number;
  /** precioUnitario × unidades, redondeado a centavos. */
  readonly precioTotal: number;
  readonly gananciaTotal: number;
  readonly advertencias: readonly string[];
}
