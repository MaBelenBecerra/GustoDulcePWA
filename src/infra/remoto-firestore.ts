import type { FirebaseApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Documento, Movimiento } from '../domain';
import type { Paquete, RemotoSync } from '../aplicacion/sincronizacion';

const LOTE_MAXIMO = 450; 

export class RemotoFirestore implements RemotoSync {
  private readonly db;
  private readonly uid: string;

  constructor(app: FirebaseApp, uid: string) {
    this.db = getFirestore(app);
    this.uid = uid;
  }

  async enviar(origen: string, paquete: Paquete): Promise<void> {
    const movs = collection(this.db, 'respaldos', this.uid, 'movimientos');
    for (let i = 0; i < paquete.movimientos.length; i += LOTE_MAXIMO) {
      const lote = writeBatch(this.db);
      for (const m of paquete.movimientos.slice(i, i + LOTE_MAXIMO)) {
        lote.set(doc(movs, m.id), { datos: m, origen, recibidoEn: serverTimestamp() });
      }
      await lote.commit();
    }

    const docs = collection(this.db, 'respaldos', this.uid, 'documentos');
    for (const d of paquete.documentos) {
      const ref = doc(docs, `${d.coleccion}__${d.id}`);
      await runTransaction(this.db, async (tx) => {
        const actual = await tx.get(ref);
        const previo = actual.exists() ? (actual.data().datos as Documento) : null;
        const gana =
          !previo || d.version > previo.version || (d.version === previo.version && d.dispositivoId > previo.dispositivoId);
        if (gana) tx.set(ref, { datos: d, origen, recibidoEn: serverTimestamp() });
      });
    }
  }

  async recibir(cursor: string | null): Promise<{ paquete: Paquete; cursor: string | null }> {
    const desde = Timestamp.fromMillis(cursor === null ? 0 : Number(cursor));
    const consulta = (nombre: string) =>
      getDocs(
        query(
          collection(this.db, 'respaldos', this.uid, nombre),
          where('recibidoEn', '>=', desde),
          orderBy('recibidoEn'),
        ),
      );
    const [movs, docs] = await Promise.all([consulta('movimientos'), consulta('documentos')]);
    let maximo = desde.toMillis();
    const leer = <T,>(snap: Awaited<ReturnType<typeof consulta>>): T[] =>
      snap.docs.map((s) => {
        const datos = s.data();
        const ts = datos.recibidoEn as Timestamp | null;
        if (ts) maximo = Math.max(maximo, ts.toMillis());
        return datos.datos as T;
      });
    return {
      paquete: { movimientos: leer<Movimiento>(movs), documentos: leer<Documento>(docs) },
      cursor: String(maximo),
    };
  }
}
