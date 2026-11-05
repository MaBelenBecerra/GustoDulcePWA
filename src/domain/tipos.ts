/**
 * GustoDulce · Dominio · Entidades y objetos de valor.
 *
 * Este módulo NO depende de React, del navegador ni de ninguna librería.
 * Todas las cantidades se expresan en la unidad base del insumo (g, ml o u)
 * y todos los montos en Bolivianos (Bs).
 */

/** Identificador opaco de entidades. */
export type Id = string;

/** Fecha de calendario en formato ISO 'YYYY-MM-DD' (sin hora ni zona). */
export type FechaISO = string;

/** Unidad base de consumo: gramos, mililitros o unidades enteras (huevos, cajas…). */
export type UnidadBase = 'g' | 'ml' | 'u';

/** Presentación de compra de referencia (lo que se compra en el mercado). */
export interface Presentacion {
  /** Contenido de la presentación en unidad base (ej. 1000 g). */
  readonly cantidad: number;
  /** Precio de referencia de la presentación en Bs. */
  readonly precio: number;
}

/** Materia prima del catálogo de la repostera. */
export interface Insumo {
  readonly id: Id;
  readonly nombre: string;
  readonly unidad: UnidadBase;
  readonly presentacion: Presentacion;
  /** Factor de merma m, con 0 ≤ m < 1 (ej. cáscara de huevo, harina que queda en el bol). */
  readonly merma: number;
}

/**
 * Lote físico de un insumo en la despensa.
 * El motor FEFO consume primero el lote con vencimiento más próximo.
 */
export interface Lote {
  readonly id: Id;
  readonly insumoId: Id;
  /** Cantidad comprada originalmente (unidad base). */
  readonly cantidadInicial: number;
  /** Cantidad aún disponible (unidad base). */
  readonly cantidadDisponible: number;
  /** Costo real de adquisición por unidad base (Bs/g, Bs/ml o Bs/u). */
  readonly costoUnitario: number;
  readonly fechaIngreso: FechaISO;
  readonly fechaVencimiento: FechaISO;
}

/** Consumo neto de un insumo dentro de una receta (unidad base). */
export interface IngredienteReceta {
  readonly insumoId: Id;
  readonly cantidad: number;
}

/** Ficha técnica de un producto. Los minutos se ingresan a mano (sin cronómetro). */
export interface Receta {
  readonly id: Id;
  readonly nombre: string;
  /** Rendimiento N: unidades/porciones que salen de una preparación. */
  readonly porciones: number;
  readonly ingredientes: readonly IngredienteReceta[];
  /** Actividad ABC 1: preparación, armado y decorado (minutos). */
  readonly minutosElaboracion: number;
  /** Actividad ABC 2: horneado (minutos). */
  readonly minutosHorneado: number;
}

/** Montos mensuales de servicios básicos en Bs (los configura la repostera). */
export interface ServiciosMensuales {
  readonly luz: number;
  readonly agua: number;
  readonly gas: number;
}

/** Parámetros de costeo configurables desde "Costos Fijos y Horas". */
export interface ConfiguracionCostos {
  /** Sueldo de referencia en Bs/mes (por defecto, el salario mínimo nacional). */
  readonly sueldoMensual: number;
  /** Horas reales trabajadas al mes. Sin presunción de jornada de 8 h. */
  readonly horasTrabajoMes: number;
  readonly servicios: ServiciosMensuales;
}

/** Semáforo de caducidad de un lote. */
export type Semaforo = 'verde' | 'amarillo' | 'rojo';

/** Resultado explícito para fallos de negocio esperables (sin excepciones). */
export type Resultado<T, E> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

export const exito = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor });
export const fallo = <E>(error: E): Resultado<never, E> => ({ ok: false, error });

/** Códigos de error por datos inválidos (violación de invariantes). */
export type CodigoError =
  | 'NUMERO_INVALIDO'
  | 'FECHA_INVALIDA'
  | 'CONFIGURACION_INVALIDA'
  | 'MARGEN_INVALIDO'
  | 'INSUMO_INVALIDO'
  | 'INSUMO_DESCONOCIDO'
  | 'RECETA_INVALIDA'
  | 'LOTE_INVALIDO';

/** Error lanzado cuando una entrada viola una invariante del dominio. */
export class ErrorDominio extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
  }
}

/* ───────────── Constantes del dominio ───────────── */

/** Salario mínimo nacional de referencia (Bs/mes). */
export const SUELDO_MINIMO_BS = 3300;

/** Máximo físico de horas en un mes (31 días × 24 h). */
export const HORAS_MES_MAXIMO = 744;

/** Días restantes hasta los cuales un lote se marca en amarillo. */
export const UMBRAL_AMARILLO_DIAS = 7;
