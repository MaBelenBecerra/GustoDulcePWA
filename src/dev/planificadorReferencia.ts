/**
 * planificadorReferencia.ts — SOLO para el panel de prueba y los tests del repositorio.
 *
 * ⚠ TEMPORAL: en producción el plan lo calcula TU función FEFO de src/domain/.
 * Cuando conectes el flujo real, reemplaza los usos de `planificadorReferencia`
 * por tu función de dominio (o un adaptador de una línea si su firma difiere).
 */

import { exito, fallo, type TomaLote } from '../domain/tipos';
import type { PlanificadorSalida } from '../domain/puertos';

export const planificadorReferencia: PlanificadorSalida = (insumoId, cantidad, lotesFEFO) => {
  const disponible = lotesFEFO.reduce((s, l) => s + l.cantidadDisponible, 0);
  if (disponible < cantidad) {
    return fallo({ insumoId, requerido: cantidad, disponible, faltante: cantidad - disponible });
  }

  const tomas: TomaLote[] = [];
  let pendiente = cantidad;
  for (const lote of lotesFEFO) {
    if (pendiente <= 1e-9) break;
    // x_j = min(q_j, Q − Σ tomado)
    const x = Math.min(lote.cantidadDisponible, pendiente);
    if (x <= 0) continue;
    tomas.push({ loteId: lote.id, cantidad: x, costoUnitario: lote.costoUnitario, costo: x * lote.costoUnitario });
    pendiente -= x;
  }

  return exito({
    insumoId,
    cantidadSolicitada: cantidad,
    tomas,
    costoTotal: tomas.reduce((s, t) => s + t.costo, 0),
  });
};