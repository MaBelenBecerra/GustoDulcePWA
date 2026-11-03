// src/data/db.ts
// Capa de persistencia local (IndexedDB vía Dexie 4) — fuente de verdad offline.
// Firestore actúa solo como réplica remota; la app nunca espera a la red para leer/escribir.
//
// Los registros son las MISMAS entidades de src/domain/tipos.ts más metadatos de
// sincronización. El dominio no sabe que existen; el repositorio los quita al leer.

import Dexie, { type EntityTable } from 'dexie';
import type {
  ConfigLaboral,
  Insumo,
  Lote,
  Receta,
  ServicioFijo,
} from '../domain/tipos';

/* ------------------------------------------------------------------ */
/* Metadatos de sincronización                                         */
/* ------------------------------------------------------------------ */

/**
 * IndexedDB NO indexa booleanos, por eso se usan 0 | 1.
 * `eliminado` = borrado lógico (tombstone): sin él, un borrado local
 * nunca llegaría a Firestore y el registro "resucitaría" al sincronizar.
 */
export interface MetaSync {
  readonly actualizadoEn: number; // epoch ms — last-write-wins
  readonly pendienteSync: 0 | 1;  // 1 = cambio local aún no subido
  readonly eliminado: 0 | 1;      // 1 = borrado lógico
}

/* ------------------------------------------------------------------ */
/* Registros persistidos = entidad de dominio + MetaSync               */
/* ------------------------------------------------------------------ */

export type InsumoRegistro = Insumo & MetaSync;
export type LoteRegistro = Lote & MetaSync;
export type RecetaRegistro = Receta & MetaSync;
export type ServicioFijoRegistro = ServicioFijo & MetaSync;

/** ConfigLaboral no tiene id en el dominio: se guarda como documento único. */
export const ID_CONFIG_LABORAL = 'actual' as const;
export type ConfigLaboralRegistro = ConfigLaboral &
  MetaSync & { readonly id: typeof ID_CONFIG_LABORAL };

/* ------------------------------------------------------------------ */
/* Base de datos                                                       */
/* ------------------------------------------------------------------ */

export const db = new Dexie('GustoDulceDB') as Dexie & {
  insumos: EntityTable<InsumoRegistro, 'id'>;
  lotes_inventario: EntityTable<LoteRegistro, 'id'>;
  recetas: EntityTable<RecetaRegistro, 'id'>;
  servicios_fijos: EntityTable<ServicioFijoRegistro, 'id'>;
  config_laboral: EntityTable<ConfigLaboralRegistro, 'id'>;
};

/**
 * Solo se declaran los campos que se CONSULTAN; el resto se guarda igual.
 * - `id` sin '++': UUID generado por la app (crypto.randomUUID), seguro entre dispositivos.
 * - `[insumoId+fechaVencimiento]`: índice compuesto que entrega la cola FEFO ya ordenada.
 *   FechaISO 'YYYY-MM-DD' ordena lexicográficamente igual que cronológicamente.
 * - `receta.ingredientes` no se indexa (array de objetos).
 *
 * REGLA: una vez desplegada, la versión 1 no se toca. Cambios de esquema →
 * db.version(2).stores({...}).upgrade(tx => ...).
 */
db.version(1).stores({
  insumos: 'id, nombre, pendienteSync, eliminado',
  lotes_inventario:
    'id, insumoId, fechaVencimiento, [insumoId+fechaVencimiento], pendienteSync, eliminado',
  recetas: 'id, nombre, pendienteSync, eliminado',
  servicios_fijos: 'id, tipo, pendienteSync, eliminado',
  config_laboral: 'id, pendienteSync',
});

/* ------------------------------------------------------------------ */
/* Conversión registro ⇄ dominio                                       */
/* ------------------------------------------------------------------ */

/** Sella una entidad de dominio como modificada localmente, lista para put(). */
export function aRegistro<T extends object>(entidad: T): T & MetaSync {
  return { ...entidad, actualizadoEn: Date.now(), pendienteSync: 1, eliminado: 0 };
}

/** Devuelve la entidad de dominio pura (sin metadatos de sync). */
export function aDominio<T extends object>(registro: T & MetaSync): T {
  const { actualizadoEn: _a, pendienteSync: _p, eliminado: _e, ...entidad } = registro;
  return entidad as T;
}

/* ------------------------------------------------------------------ */
/* Consultas de apoyo                                                  */
/* ------------------------------------------------------------------ */

/**
 * Cola FEFO de un insumo: lotes vivos con stock, ordenados por vencimiento ascendente.
 * Incluye lotes ya vencidos (rojo): el dominio decide si darlos de baja o excluirlos.
 */
export async function obtenerLotesFEFO(insumoId: string): Promise<Lote[]> {
  const registros = await db.lotes_inventario
    .where('[insumoId+fechaVencimiento]')
    .between([insumoId, Dexie.minKey], [insumoId, Dexie.maxKey])
    .filter((l) => l.eliminado === 0 && l.cantidadDisponible > 0)
    .toArray();
  return registros.map((r) => aDominio<Lote>(r));
}

/**
 * Pide al navegador almacenamiento persistente para que el SO no borre
 * IndexedDB por falta de espacio (crítico en Android de gama baja e iOS).
 * Llamar una vez al iniciar la app.
 */
export async function solicitarAlmacenamientoPersistente(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}