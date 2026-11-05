import Dexie, { type EntityTable } from 'dexie';
import type {
  ConfigLaboral,
  Insumo,
  Lote,
  Receta,
  ServicioFijo,
} from '../domain/tipos';

export interface MetaSync {
  readonly actualizadoEn: number;
  readonly pendienteSync: 0 | 1;
  readonly eliminado: 0 | 1;
}

export type InsumoRegistro = Insumo & MetaSync;
export type LoteRegistro = Lote & MetaSync;
export type RecetaRegistro = Receta & MetaSync;
export type ServicioFijoRegistro = ServicioFijo & MetaSync;

export const ID_CONFIG_LABORAL = 'actual' as const;
export type ConfigLaboralRegistro = ConfigLaboral &
  MetaSync & { readonly id: typeof ID_CONFIG_LABORAL };

export type TipoMovimiento = 'salida' | 'baja-vencimiento';

export interface MovimientoRegistro extends MetaSync {
  readonly id: string;
  readonly operacionId: string;
  readonly tipo: TipoMovimiento;
  readonly insumoId: string;
  readonly loteId: string;
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly costo: number;
  readonly fecha: number;
  readonly motivo: string;
}

export const db = new Dexie('GustoDulceDB') as Dexie & {
  insumos: EntityTable<InsumoRegistro, 'id'>;
  lotes_inventario: EntityTable<LoteRegistro, 'id'>;
  recetas: EntityTable<RecetaRegistro, 'id'>;
  servicios_fijos: EntityTable<ServicioFijoRegistro, 'id'>;
  config_laboral: EntityTable<ConfigLaboralRegistro, 'id'>;
  movimientos_inventario: EntityTable<MovimientoRegistro, 'id'>;
};

db.version(1).stores({
  insumos: 'id, nombre, pendienteSync, eliminado',
  lotes_inventario:
    'id, insumoId, fechaVencimiento, [insumoId+fechaVencimiento], pendienteSync, eliminado',
  recetas: 'id, nombre, pendienteSync, eliminado',
  servicios_fijos: 'id, tipo, pendienteSync, eliminado',
  config_laboral: 'id, pendienteSync',
});

db.version(2).stores({
  movimientos_inventario: 'id, operacionId, insumoId, loteId, fecha, pendienteSync',
});

export function aRegistro<T extends object>(entidad: T): T & MetaSync {
  return { ...entidad, actualizadoEn: Date.now(), pendienteSync: 1, eliminado: 0 };
}

export function aDominio<T extends object>(registro: T & MetaSync): T {
  const { actualizadoEn: _a, pendienteSync: _p, eliminado: _e, ...entidad } = registro;
  return entidad as T;
}

export async function obtenerLotesFEFO(insumoId: string): Promise<Lote[]> {
  const registros = await db.lotes_inventario
    .where('[insumoId+fechaVencimiento]')
    .between([insumoId, Dexie.minKey], [insumoId, Dexie.maxKey])
    .filter((l) => l.eliminado === 0 && l.cantidadDisponible > 0)
    .toArray();
  return registros.map((r) => aDominio<Lote>(r));
}

export async function solicitarAlmacenamientoPersistente(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}