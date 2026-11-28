import type { FirebaseApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import type { MetricasCuenta, Rol } from '../domain';

export interface PerfilPublico {
  readonly uid: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
  readonly metricas: MetricasCuenta;
  readonly ultimaActividad: number;
  readonly demo: boolean;
}

const PREFIJO_DEMO = 'demo-';

export class ServicioPerfiles {
  private readonly db;

  constructor(app: FirebaseApp) {
    this.db = getFirestore(app);
  }

  async publicar(perfil: Omit<PerfilPublico, 'ultimaActividad' | 'demo'>): Promise<void> {
    await setDoc(doc(this.db, 'perfiles', perfil.uid), {
      ...perfil,
      demo: false,
      ultimaActividad: serverTimestamp(),
    });
  }

  async listar(): Promise<PerfilPublico[]> {
    const snap = await getDocs(collection(this.db, 'perfiles'));
    return snap.docs.map((d) => {
      const datos = d.data();
      const ts = datos.ultimaActividad as Timestamp | null | undefined;
      return {
        uid: d.id,
        nombre: String(datos.nombre ?? 'Sin nombre'),
        correo: String(datos.correo ?? ''),
        rol: datos.rol === 'administradora' ? 'administradora' : 'repostera',
        metricas: datos.metricas as MetricasCuenta,
        ultimaActividad: ts ? ts.toMillis() : 0,
        demo: Boolean(datos.demo),
      };
    });
  }

  async crearDemo(perfiles: readonly Omit<PerfilPublico, 'demo'>[]): Promise<void> {
    const lote = writeBatch(this.db);
    for (const p of perfiles) {
      const uid = p.uid.startsWith(PREFIJO_DEMO) ? p.uid : `${PREFIJO_DEMO}${p.uid}`;
      lote.set(doc(this.db, 'perfiles', uid), {
        ...p,
        uid,
        demo: true,
        ultimaActividad: Timestamp.fromMillis(p.ultimaActividad),
      });
    }
    await lote.commit();
  }

  async borrarDemo(): Promise<number> {
    const todos = await this.listar();
    const demo = todos.filter((p) => p.demo && p.uid.startsWith(PREFIJO_DEMO));
    await Promise.all(demo.map((p) => deleteDoc(doc(this.db, 'perfiles', p.uid))));
    return demo.length;
  }
}
