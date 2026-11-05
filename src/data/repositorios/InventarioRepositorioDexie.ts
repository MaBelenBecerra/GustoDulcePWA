import {
  db,
  aDominio,
  aRegistro,
  obtenerLotesFEFO,
  type LoteRegistro,
  type MovimientoRegistro,
} from '../db';
import {
  exito,
  fallo,
  type Insumo,
  type LoteInventario,
  type Resultado,
} from '../../domain/tipos';

export interface TomaInventario {
  readonly loteId: string;
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly costo: number;
}

export interface PlanInventario {
  readonly insumoId: string;
  readonly cantidadSolicitada: number;
  readonly tomas: readonly TomaInventario[];
  readonly costoTotal: number;
}

export interface FaltanteInventario {
  readonly insumoId: string;
  readonly requerido: number;
  readonly disponible: number;
  readonly faltante: number;
}

export type ErrorInventario =
  | { readonly tipo: 'faltante'; readonly faltante: FaltanteInventario }
  | { readonly tipo: 'stock-insuficiente'; readonly loteId: string; readonly solicitado: number; readonly disponible: number }
  | { readonly tipo: 'lote-no-encontrado'; readonly loteId: string }
  | { readonly tipo: 'costo-desactualizado'; readonly loteId: string }
  | { readonly tipo: 'plan-invalido'; readonly detalle: string };

export type PlanificadorInventario = (
  insumoId: string,
  cantidad: number,
  lotesFEFO: readonly LoteInventario[],
) => Resultado<PlanInventario, FaltanteInventario>;

export interface SalidaInventarioAplicada {
  readonly operacionId: string;
  readonly plan: PlanInventario;
  readonly lotesActualizados: readonly LoteInventario[];
}

export function casiIgual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export interface TomaAgrupada {
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly costo: number;
}

export function agruparTomas(tomas: readonly TomaInventario[]): Map<string, TomaAgrupada> | null {
  const mapa = new Map<string, TomaAgrupada>();
  for (const t of tomas) {
    const previa = mapa.get(t.loteId);
    if (previa && previa.costoUnitario !== t.costoUnitario) return null;
    mapa.set(t.loteId, {
      cantidad: (previa?.cantidad ?? 0) + t.cantidad,
      costoUnitario: t.costoUnitario,
      costo: (previa?.costo ?? 0) + t.costo,
    });
  }
  return mapa;
}

export function validarPlan(plan: PlanInventario): string | null {
  const cantidad = plan.cantidadSolicitada;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 'cantidadSolicitada debe ser > 0';
  if (plan.tomas.length === 0) return 'el plan no tiene tomas';
  for (const toma of plan.tomas) {
    if (!toma.loteId) return 'toma sin loteId';
    if (!Number.isFinite(toma.cantidad) || toma.cantidad <= 0) {
      return `toma inválida en lote ${toma.loteId}`;
    }
  }
  const suma = plan.tomas.reduce((total, toma) => total + toma.cantidad, 0);
  if (!casiIgual(suma, cantidad)) return `las tomas suman ${suma}, se pidió ${cantidad}`;
  return null;
}

class AbortoSalida extends Error {
  constructor(readonly causa: ErrorInventario) {
    super(`Salida abortada: ${causa.tipo}`);
    this.name = 'AbortoSalida';
  }
}

export class InventarioRepositorioDexie {
  async registrarInsumo(insumo: Insumo): Promise<void> {
    await db.insumos.put(aRegistro(insumo));
  }

  async registrarLote(lote: LoteInventario): Promise<void> {
    await db.lotes_inventario.put(aRegistro(lote));
  }

  obtenerLotesFEFO(insumoId: string): Promise<LoteInventario[]> {
    return obtenerLotesFEFO(insumoId);
  }

  aplicarPlanSalida(
    plan: PlanInventario,
    motivo: string,
  ): Promise<Resultado<SalidaInventarioAplicada, ErrorInventario>> {
    return this.enTransaccion(() => this.aplicar(plan, motivo));
  }

  descontarFEFO(
    insumoId: string,
    cantidad: number,
    planificar: PlanificadorInventario,
    motivo: string,
  ): Promise<Resultado<SalidaInventarioAplicada, ErrorInventario>> {
    return this.enTransaccion(async () => {
      const lotes = await obtenerLotesFEFO(insumoId);
      const resultado = planificar(insumoId, cantidad, lotes);
      if (!resultado.ok) throw new AbortoSalida({ tipo: 'faltante', faltante: resultado.error });
      return this.aplicar(resultado.valor, motivo);
    });
  }

  private async enTransaccion(
    trabajo: () => Promise<SalidaInventarioAplicada>,
  ): Promise<Resultado<SalidaInventarioAplicada, ErrorInventario>> {
    try {
      const salida = await db.transaction(
        'rw',
        db.lotes_inventario,
        db.movimientos_inventario,
        trabajo,
      );
      return exito(salida);
    } catch (error) {
      if (error instanceof AbortoSalida) return fallo(error.causa);
      throw error;
    }
  }

  private async aplicar(plan: PlanInventario, motivo: string): Promise<SalidaInventarioAplicada> {
    const motivoInvalido = validarPlan(plan);
    if (motivoInvalido) {
      throw new AbortoSalida({ tipo: 'plan-invalido', detalle: motivoInvalido });
    }

    const tomas = agruparTomas(plan.tomas);
    if (!tomas) {
      throw new AbortoSalida({
        tipo: 'plan-invalido',
        detalle: 'un mismo lote aparece con costos unitarios distintos',
      });
    }

    const pares = [...tomas.entries()];
    const registros = await db.lotes_inventario.bulkGet(pares.map(([loteId]) => loteId));
    const porId = new Map<string, LoteRegistro>();
    for (const registro of registros) if (registro) porId.set(registro.id, registro);

    const operacionId = crypto.randomUUID();
    const fecha = Date.now();
    const lotesNuevos: LoteRegistro[] = [];
    const movimientos: MovimientoRegistro[] = [];

    for (const [loteId, toma] of pares) {
      const registro = porId.get(loteId);
      if (!registro || registro.eliminado === 1) {
        throw new AbortoSalida({ tipo: 'lote-no-encontrado', loteId });
      }
      if (registro.insumoId !== plan.insumoId) {
        throw new AbortoSalida({
          tipo: 'plan-invalido',
          detalle: `el lote ${loteId} no pertenece al insumo ${plan.insumoId}`,
        });
      }
      if (!casiIgual(registro.costoUnitario, toma.costoUnitario)) {
        throw new AbortoSalida({ tipo: 'costo-desactualizado', loteId });
      }

      const restante = registro.cantidadDisponible - toma.cantidad;
      if (restante < 0 && !casiIgual(registro.cantidadDisponible, toma.cantidad)) {
        throw new AbortoSalida({
          tipo: 'stock-insuficiente',
          loteId,
          solicitado: toma.cantidad,
          disponible: registro.cantidadDisponible,
        });
      }

      const cantidadDisponible = casiIgual(restante, 0) || restante < 0 ? 0 : restante;
      lotesNuevos.push(
        aRegistro<LoteInventario>({ ...aDominio<LoteInventario>(registro), cantidadDisponible }),
      );
      movimientos.push(
        aRegistro({
          id: crypto.randomUUID(),
          operacionId,
          tipo: 'salida' as const,
          insumoId: plan.insumoId,
          loteId,
          cantidad: toma.cantidad,
          costoUnitario: toma.costoUnitario,
          costo: toma.costo,
          fecha,
          motivo,
        }),
      );
    }

    await db.lotes_inventario.bulkPut(lotesNuevos);
    await db.movimientos_inventario.bulkAdd(movimientos);

    return {
      operacionId,
      plan,
      lotesActualizados: lotesNuevos.map((registro) => aDominio<LoteInventario>(registro)),
    };
  }
}

export const repositorioInventario = new InventarioRepositorioDexie();
