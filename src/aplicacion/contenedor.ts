import type { FirebaseApp } from 'firebase/app';
import { listaAdministradoras } from '../domain';
import type { RepositorioSesion } from '../domain';
import { BaseLocal, RepositorioLocal } from '../infra/repositorio';
import type { ServicioPerfiles } from '../infra/perfiles-firestore';
import { ServicioGustoDulce } from './servicio';
import { MotorSincronizacion } from './sincronizacion';

export interface Espacio {
  readonly clave: string;
  readonly repositorio: RepositorioLocal;
  readonly servicio: ServicioGustoDulce;
}

let espacioActual: Espacio | null = null;

export function espacio(uid: string | null): Espacio {
  const clave = uid ? `gustodulce-${uid}` : 'gustodulce';
  if (espacioActual?.clave !== clave) {
    espacioActual?.repositorio.db.close();
    const repositorio = new RepositorioLocal(new BaseLocal(clave));
    espacioActual = { clave, repositorio, servicio: new ServicioGustoDulce(repositorio) };
  }
  return espacioActual;
}

const configFirebase = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const respaldoConfigurado = Boolean(configFirebase.apiKey && configFirebase.projectId);

export const ADMINISTRADORAS = listaAdministradoras(import.meta.env.VITE_ADMIN_EMAILS as string | undefined);

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
    const { repositorio } = espacio(uid);
    motor = {
      uid,
      promesa: Promise.all([obtenerAppFirebase(), import('../infra/remoto-firestore')]).then(
        ([app, { RemotoFirestore }]) => new MotorSincronizacion(repositorio, new RemotoFirestore(app, uid)),
      ),
    };
  }
  return motor.promesa;
}

let perfiles: Promise<ServicioPerfiles> | null = null;

export function servicioPerfiles(): Promise<ServicioPerfiles> | null {
  if (!respaldoConfigurado) return null;
  perfiles ??= Promise.all([obtenerAppFirebase(), import('../infra/perfiles-firestore')]).then(
    ([app, { ServicioPerfiles: Servicio }]) => new Servicio(app),
  );
  perfiles.catch(() => (perfiles = null));
  return perfiles;
}
