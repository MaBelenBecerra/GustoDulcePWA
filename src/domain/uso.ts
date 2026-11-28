import type { Movimiento } from './movimientos';
import type { CotizacionGuardada, Id, Receta } from './tipos';

export function usoPorReceta(
  movimientos: readonly Movimiento[],
  cotizaciones: readonly CotizacionGuardada[],
): Map<Id, number> {
  const producciones = new Map<Id, Set<Id>>();
  for (const m of movimientos) {
    if (m.tipo !== 'CONSUMO') continue;
    const set = producciones.get(m.recetaId) ?? new Set<Id>();
    set.add(m.produccionId);
    producciones.set(m.recetaId, set);
  }
  const uso = new Map<Id, number>();
  for (const [recetaId, set] of producciones) uso.set(recetaId, set.size);
  for (const c of cotizaciones) uso.set(c.recetaId, (uso.get(c.recetaId) ?? 0) + 1);
  return uso;
}

export function recetasPorUso(recetas: readonly Receta[], uso: ReadonlyMap<Id, number>): Receta[] {
  return recetas
    .filter((r) => !r.archivada)
    .sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
}

export function dividirDestacadas(
  ordenadas: readonly Receta[],
  cantidad = 2,
): { destacadas: Receta[]; otras: Receta[] } {
  return { destacadas: ordenadas.slice(0, cantidad), otras: ordenadas.slice(cantidad) };
}
