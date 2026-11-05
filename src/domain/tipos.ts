export type Id = string;

export type FechaISO = string;
export type UnidadBase = 'g' | 'ml' | 'u';

export interface Presentacion {
  readonly cantidad: number;
  readonly precio: number;
}

export interface Insumo {
  readonly id: Id;
  readonly nombre: string;
  readonly unidad: UnidadBase;
  readonly presentacion: Presentacion;
  readonly merma: number;
}

export interface Lote {
  readonly id: Id;
  readonly insumoId: Id;
  readonly cantidadInicial: number;
  readonly cantidadDisponible: number;
  readonly costoUnitario: number;
  readonly fechaIngreso: FechaISO;
  readonly fechaVencimiento: FechaISO;
}

export type LoteInventario = Lote;

export interface IngredienteReceta {
  readonly insumoId: Id;
  readonly cantidad: number;
}

export interface Receta {
  readonly id: Id;
  readonly nombre: string;
  readonly porciones: number;
  readonly ingredientes: readonly IngredienteReceta[];
  readonly minutosElaboracion: number;
  readonly minutosHorneado: number;
}

export interface ServiciosMensuales {
  readonly luz: number;
  readonly agua: number;
  readonly gas: number;
}

export interface ConfiguracionCostos {
  readonly sueldoMensual: number;
  readonly horasTrabajoMes: number;
  readonly servicios: ServiciosMensuales;
}

export type Configuracion = ConfiguracionCostos;

export type Semaforo = 'verde' | 'amarillo' | 'rojo';

export type Resultado<T, E> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

export const exito = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor });
export const fallo = <E>(error: E): Resultado<never, E> => ({ ok: false, error });

export type CodigoError =
  | 'NUMERO_INVALIDO'
  | 'FECHA_INVALIDA'
  | 'CONFIGURACION_INVALIDA'
  | 'MARGEN_INVALIDO'
  | 'INSUMO_INVALIDO'
  | 'INSUMO_DESCONOCIDO'
  | 'RECETA_INVALIDA'
  | 'LOTE_INVALIDO';

export class ErrorDominio extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
  }
}
export const SUELDO_MINIMO_BS = 3300;
export const HORAS_MES_MAXIMO = 744;
export const UMBRAL_AMARILLO_DIAS = 7;
