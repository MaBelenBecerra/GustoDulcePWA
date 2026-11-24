import type { Id } from './tipos';

export type Coleccion = 'insumos' | 'recetas' | 'configuracion';

export interface Documento<T = unknown> {
  readonly coleccion: Coleccion;
  readonly id: Id;
  readonly datos: T;
  readonly version: number;
  readonly dispositivoId: Id;
  readonly actualizadoEn: string;
}


export function gana(a: Documento, b: Documento): boolean {
  if (a.version !== b.version) return a.version > b.version;
  return a.dispositivoId > b.dispositivoId;
}


export function fusionarDocumentos(
  locales: readonly Documento[],
  remotos: readonly Documento[],
): { documentos: Documento[]; actualizados: Documento[] } {
  const clave = (d: Documento) => `${d.coleccion}/${d.id}`;
  const mapa = new Map(locales.map((d) => [clave(d), d]));
  const actualizados: Documento[] = [];
  for (const r of remotos) {
    const actual = mapa.get(clave(r));
    if (!actual || gana(r, actual)) {
      mapa.set(clave(r), r);
      actualizados.push(r);
    }
  }
  return { documentos: [...mapa.values()], actualizados };
}
