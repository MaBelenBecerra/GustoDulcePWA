import { resumenInsumo } from './inventario';
import type { Movimiento } from './movimientos';
import { sumaPrecisa } from './numeros';
import type { CotizacionGuardada, FechaISO, Insumo, Lote, Receta } from './tipos';

export interface MetricasCuenta {
  readonly insumos: number;
  readonly recetas: number;
  readonly lotesActivos: number;
  readonly producciones: number;
  readonly cotizaciones: number;
  readonly montoCotizado: number;
  readonly valorInventario: number;
  readonly mermaAcumulada: number;
  readonly insumosPorVencer: number;
  readonly registros: number;
}

export function calcularMetricas(datos: {
  insumos: readonly Insumo[];
  recetas: readonly Receta[];
  lotes: readonly Lote[];
  movimientos: readonly Movimiento[];
  cotizaciones: readonly CotizacionGuardada[];
  mermaAcumulada: number;
  hoy: FechaISO;
}): MetricasCuenta {
  const { insumos, recetas, lotes, movimientos, cotizaciones, mermaAcumulada, hoy } = datos;
  const resumenes = insumos.map((i) => resumenInsumo(lotes, i.id, hoy));
  const producciones = new Set(movimientos.flatMap((m) => (m.tipo === 'CONSUMO' ? [m.produccionId] : [])));
  return {
    insumos: insumos.length,
    recetas: recetas.filter((r) => !r.archivada).length,
    lotesActivos: sumaPrecisa(resumenes.map((r) => r.lotesActivos)),
    producciones: producciones.size,
    cotizaciones: cotizaciones.length,
    montoCotizado: sumaPrecisa(cotizaciones.map((c) => c.precioTotal)),
    valorInventario: sumaPrecisa(resumenes.map((r) => r.valorDisponible)),
    mermaAcumulada,
    insumosPorVencer: resumenes.filter((r) => r.semaforo === 'amarillo').length,
    registros: insumos.length + recetas.length + cotizaciones.length + 1 + movimientos.length,
  };
}
