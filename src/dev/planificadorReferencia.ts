

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