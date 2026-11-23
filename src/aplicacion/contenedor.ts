import type { FirebaseApp } from 'firebase/app';
import type { RepositorioSesion } from '../domain';
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

let appFirebase: Promise<FirebaseApp> | null = null;
function obtenerAppFirebase(): Promise<FirebaseApp> {
  appFirebase ??= import('firebase/app').then(({ getApp, getApps, initializeApp }) =>
    getApps().length > 0 ? getApp() : initializeApp(configFirebase),
  );
  return appFirebase;
}

let sesion: Promise<RepositorioSesion> | null = null;

export function repositorioSesion(): Promise<RepositorioSesion> | null {
  if (!respaldoConfigurado) return null;
  sesion ??= Promise.all([obtenerAppFirebase(), import('../infra/sesion-firebase')]).then(([app, { SesionFirebase }]) =>
    SesionFirebase.crear(app),
  );
  sesion.catch(() => (sesion = null));
  return sesion;
}

let motor: { uid: string; promesa: Promise<MotorSincronizacion> } | null = null;

export function motorRespaldo(uid: string | null): Promise<MotorSincronizacion | null> {
  if (!respaldoConfigurado || !uid) return Promise.resolve(null);
  if (motor?.uid !== uid) {
    motor = {
      uid,
      promesa: Promise.all([obtenerAppFirebase(), import('../infra/remoto-firestore')]).then(
        ([app, { RemotoFirestore }]) => new MotorSincronizacion(repositorio, new RemotoFirestore(app, uid)),
      ),
    };
  }
  return motor.promesa;
}
