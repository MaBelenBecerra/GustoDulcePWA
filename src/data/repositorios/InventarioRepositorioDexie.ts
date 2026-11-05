

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
  type Lote,
  type PlanSalida,
  type Resultado,
  type TomaLote,
} from '../../domain/tipos';
import type {
  ErrorSalida,
  PlanificadorSalida,
  RepositorioInventario,
  SalidaAplicada,
} from '../../domain/puertos';

export function casiIgual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export interface TomaAgrupada {
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly costo: number;
}

export function agruparTomas(tomas: readonly TomaLote[]): Map<string, TomaAgrupada> | null {
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

export function validarPlan(plan: PlanSalida): string | null {
  const Q = plan.cantidadSolicitada;
  if (!Number.isFinite(Q) || Q <= 0) return 'cantidadSolicitada debe ser > 0';
  if (plan.tomas.length === 0) return 'el plan no tiene tomas';
  for (const t of plan.tomas) {
    if (!t.loteId) return 'toma sin loteId';
    if (!Number.isFinite(t.cantidad) || t.cantidad <= 0)
      return `toma inválida en lote ${t.loteId}`;
  }
  const suma = plan.tomas.reduce((s, t) => s + t.cantidad, 0);
  if (!casiIgual(suma, Q)) return `las tomas suman ${suma}, se pidió ${Q}`;
  return null;
}

class AbortoSalida extends Error {

  readonly causa: ErrorSalida;
  constructor(causa: ErrorSalida) {
    super(`Salida abortada: ${causa.tipo}`);
    this.name = 'AbortoSalida';
    this.causa = causa;
  }
}

export class InventarioRepositorioDexie implements RepositorioInventario {
  async registrarInsumo(insumo: Insumo): Promise<void> {
    await db.insumos.put(aRegistro(insumo));
  }

  async registrarLote(lote: Lote): Promise<void> {
    await db.lotes_inventario.put(aRegistro(lote));
  }

  obtenerLotesFEFO(insumoId: string): Promise<Lote[]> {
    return obtenerLotesFEFO(insumoId);
  }

  aplicarPlanSalida(
    plan: PlanSalida,
    motivo: string,
  ): Promise<Resultado<SalidaAplicada, ErrorSalida>> {
    return this.enTransaccion(() => this.aplicar(plan, motivo));
  }

  descontarFEFO(
    insumoId: string,
    cantidad: number,
    planificar: PlanificadorSalida,
    motivo: string,
  ): Promise<Resultado<SalidaAplicada, ErrorSalida>> {
    return this.enTransaccion(async () => {

      const lotes = await obtenerLotesFEFO(insumoId);
      const resultado = planificar(insumoId, cantidad, lotes);
      if (!resultado.ok) throw new AbortoSalida({ tipo: 'faltante', faltante: resultado.error });
      return this.aplicar(resultado.valor, motivo);
    });
  }

  private async enTransaccion(
    trabajo: () => Promise<SalidaAplicada>,
  ): Promise<Resultado<SalidaAplicada, ErrorSalida>> {
    try {
      const salida = await db.transaction(
        'rw',
        db.lotes_inventario,
        db.movimientos_inventario,
        trabajo,
      );
      return exito(salida);
    } catch (e) {
      if (e instanceof AbortoSalida) return fallo(e.causa);

      throw e;
    }
  }

  private async aplicar(plan: PlanSalida, motivo: string): Promise<SalidaAplicada> {
    const motivoInvalido = validarPlan(plan);
    if (motivoInvalido) throw new AbortoSalida({ tipo: 'plan-invalido', detalle: motivoInvalido });

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
    for (const r of registros) if (r) porId.set(r.id, r);

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

      lotesNuevos.push(aRegistro<Lote>({ ...aDominio<Lote>(registro), cantidadDisponible }));
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
      lotesActualizados: lotesNuevos.map((r) => aDominio<Lote>(r)),
    };
  }
}

export const repositorioInventario = new InventarioRepositorioDexie();