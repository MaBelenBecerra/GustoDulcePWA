








import { BaseLocal, RepositorioLocal } from '../infra/repositorio';
import { ServicioGustoDulce } from './servicio';
import { MotorSincronizacion } from './sincronizacion';

export const repositorio = new RepositorioLocal(new BaseLocal());
export const servicio = new ServicioGustoDulce(repositorio);

const configFirebase = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const respaldoConfigurado = Boolean(configFirebase.apiKey && configFirebase.projectId);

let motor: Promise<MotorSincronizacion | null> | null = null;





export function motorRespaldo(): Promise<MotorSincronizacion | null> {
  if (!respaldoConfigurado) return Promise.resolve(null);
  motor ??= (async () => {
    const [{ initializeApp }, { getAuth }, { RemotoFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('../infra/remoto-firestore'),
    ]);
    const app = initializeApp(configFirebase);
    const uid = getAuth(app).currentUser?.uid;
    if (!uid) return null; 
    return new MotorSincronizacion(repositorio, new RemotoFirestore(app, uid));
  })();
  return motor;
}
