













import Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import { fusionar, fusionarDocumentos } from '../domain';
import type { Documento, Movimiento } from '../domain';

export const PENDIENTE = 0;
export const SINCRONIZADO = 1;
type EstadoSync = typeof PENDIENTE | typeof SINCRONIZADO;

interface FilaMovimiento {
  id: string;
  lamport: number;
  estadoSync: EstadoSync;
  datos: Movimiento;
}

interface FilaDocumento {
  clave: string;
  coleccion: string;
  estadoSync: EstadoSync;
  datos: Documento;
}

interface FilaMeta {
  clave: string;
  valor: unknown;
}

export class BaseLocal extends Dexie {
  movimientos!: EntityTable<FilaMovimiento, 'id'>;
  documentos!: EntityTable<FilaDocumento, 'clave'>;
  meta!: EntityTable<FilaMeta, 'clave'>;

  constructor(nombre = 'gustodulce') {
    super(nombre);
    this.version(1).stores({
      movimientos: 'id, estadoSync, lamport',
      documentos: 'clave, coleccion, estadoSync',
      meta: 'clave',
    });
  }
}

export const claveDocumento = (d: Pick<Documento, 'coleccion' | 'id'>): string => `${d.coleccion}/${d.id}`;


export interface Vista {
  readonly movimientos: readonly Movimiento[];
  readonly documentos: readonly Documento[];
  
  readonly lamport: number;
  readonly dispositivoId: string;
}


export interface Efectos<T> {
  readonly movimientos?: readonly Movimiento[];
  readonly documentos?: readonly Documento[];
  readonly resultado: T;
}

export class RepositorioLocal {
  readonly db: BaseLocal;
  private readonly generarId: () => string;

  constructor(db: BaseLocal, generarId: () => string = () => crypto.randomUUID()) {
    this.db = db;
    this.generarId = generarId;
  }

  
  async dispositivoId(): Promise<string> {
    return this.db.transaction('rw', this.db.meta, async () => {
      const fila = await this.db.meta.get('dispositivoId');
      if (fila) return fila.valor as string;
      const id = `dev-${this.generarId()}`;
      await this.db.meta.put({ clave: 'dispositivoId', valor: id });
      return id;
    });
  }

  async leerMeta<T>(clave: string, porDefecto: T): Promise<T> {
    const fila = await this.db.meta.get(clave);
    return fila ? (fila.valor as T) : porDefecto;
  }

  async guardarMeta(clave: string, valor: unknown): Promise<void> {
    await this.db.meta.put({ clave, valor });
  }

  async leerTodo(): Promise<{ movimientos: Movimiento[]; documentos: Documento[] }> {
    const [movs, docs] = await Promise.all([this.db.movimientos.toArray(), this.db.documentos.toArray()]);
    return { movimientos: movs.map((f) => f.datos), documentos: docs.map((f) => f.datos) };
  }

  




  async ejecutarAtomico<T>(decidir: (vista: Vista) => Efectos<T>): Promise<T> {
    const dispositivoId = await this.dispositivoId();
    const { movimientos, documentos, meta } = this.db;
    return this.db.transaction('rw', movimientos, documentos, meta, async () => {
      const [movs, docs, reloj] = await Promise.all([
        movimientos.toArray(),
        documentos.toArray(),
        meta.get('lamport'),
      ]);
      const lamport = ((reloj?.valor as number | undefined) ?? 0) + 1;
      const efectos = decidir({
        movimientos: movs.map((f) => f.datos),
        documentos: docs.map((f) => f.datos),
        lamport,
        dispositivoId,
      });
      const nuevosMovs = efectos.movimientos ?? [];
      const nuevosDocs = efectos.documentos ?? [];
      if (nuevosMovs.length > 0) {
        await movimientos.bulkAdd(
          nuevosMovs.map((m) => ({ id: m.id, lamport: m.lamport, estadoSync: PENDIENTE, datos: m })),
        );
      }
      if (nuevosDocs.length > 0) {
        await documentos.bulkPut(
          nuevosDocs.map((d) => ({ clave: claveDocumento(d), coleccion: d.coleccion, estadoSync: PENDIENTE, datos: d })),
        );
      }
      if (nuevosMovs.length > 0 || nuevosDocs.length > 0) await meta.put({ clave: 'lamport', valor: lamport });
      return efectos.resultado;
    });
  }

  

  async pendientes(): Promise<{ movimientos: Movimiento[]; documentos: Documento[] }> {
    const [movs, docs] = await Promise.all([
      this.db.movimientos.where('estadoSync').equals(PENDIENTE).toArray(),
      this.db.documentos.where('estadoSync').equals(PENDIENTE).toArray(),
    ]);
    return { movimientos: movs.map((f) => f.datos), documentos: docs.map((f) => f.datos) };
  }

  async contarPendientes(): Promise<number> {
    const [a, b] = await Promise.all([
      this.db.movimientos.where('estadoSync').equals(PENDIENTE).count(),
      this.db.documentos.where('estadoSync').equals(PENDIENTE).count(),
    ]);
    return a + b;
  }

  async marcarSincronizados(movimientoIds: readonly string[], documentos: readonly Documento[]): Promise<void> {
    await this.db.transaction('rw', this.db.movimientos, this.db.documentos, async () => {
      await this.db.movimientos.where('id').anyOf([...movimientoIds]).modify({ estadoSync: SINCRONIZADO });
      for (const d of documentos) {
        const fila = await this.db.documentos.get(claveDocumento(d));
        
        if (fila && fila.datos.version === d.version && fila.datos.dispositivoId === d.dispositivoId) {
          await this.db.documentos.update(fila.clave, { estadoSync: SINCRONIZADO });
        }
      }
    });
  }

  



  async aplicarRemotos(
    remotosMovs: readonly Movimiento[],
    remotosDocs: readonly Documento[],
    cursor: string | null,
  ): Promise<{ nuevos: number; divergentes: string[]; documentosActualizados: number }> {
    const { movimientos, documentos, meta } = this.db;
    return this.db.transaction('rw', movimientos, documentos, meta, async () => {
      const locales = (await movimientos.toArray()).map((f) => f.datos);
      const fusion = fusionar(locales, remotosMovs);
      const porId = new Map(remotosMovs.map((m) => [m.id, m]));
      const nuevos = fusion.nuevos.map((id) => porId.get(id)!);
      if (nuevos.length > 0) {
        await movimientos.bulkAdd(
          nuevos.map((m) => ({ id: m.id, lamport: m.lamport, estadoSync: SINCRONIZADO, datos: m })),
        );
      }

      const docsLocales = (await documentos.toArray()).map((f) => f.datos);
      const { actualizados } = fusionarDocumentos(docsLocales, remotosDocs);
      if (actualizados.length > 0) {
        await documentos.bulkPut(
          actualizados.map((d) => ({ clave: claveDocumento(d), coleccion: d.coleccion, estadoSync: SINCRONIZADO, datos: d })),
        );
      }

      const maximoRemoto = Math.max(0, ...remotosMovs.map((m) => m.lamport), ...remotosDocs.map((d) => d.version));
      const local = ((await meta.get('lamport'))?.valor as number | undefined) ?? 0;
      await meta.put({ clave: 'lamport', valor: Math.max(local, maximoRemoto) });
      await meta.put({ clave: 'cursorRemoto', valor: cursor });
      return { nuevos: nuevos.length, divergentes: fusion.divergentes, documentosActualizados: actualizados.length };
    });
  }
}
