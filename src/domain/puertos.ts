import type { Faltante, Insumo, Lote, PlanSalida, Resultado } from './tipos';

export type PlanificadorSalida = (
  insumoId: string,
  cantidad: number,
  lotesFEFO: readonly Lote[],
) => Resultado<PlanSalida, Faltante>;

export type ErrorSalida =
  | { readonly tipo: 'plan-invalido'; readonly detalle: string }
  | { readonly tipo: 'lote-no-encontrado'; readonly loteId: string }
  | {
      readonly tipo: 'stock-insuficiente';
      readonly loteId: string;
      readonly solicitado: number;
      readonly disponible: number;
    }
  | { readonly tipo: 'costo-desactualizado'; readonly loteId: string }
  | { readonly tipo: 'faltante'; readonly faltante: Faltante };

export interface SalidaAplicada {
  readonly operacionId: string;
  readonly plan: PlanSalida;
  readonly lotesActualizados: readonly Lote[];
}

export interface RepositorioInventario {
  registrarInsumo(insumo: Insumo): Promise<void>;
  registrarLote(lote: Lote): Promise<void>;
  obtenerLotesFEFO(insumoId: string): Promise<Lote[]>;

  aplicarPlanSalida(
    plan: PlanSalida,
    motivo: string,
  ): Promise<Resultado<SalidaAplicada, ErrorSalida>>;

  descontarFEFO(
    insumoId: string,
    cantidad: number,
    planificar: PlanificadorSalida,
    motivo: string,
  ): Promise<Resultado<SalidaAplicada, ErrorSalida>>;
}