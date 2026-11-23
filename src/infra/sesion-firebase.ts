import { FirebaseError } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import { codigoSesionDesdeFirebase, ErrorSesion, normalizarCorreo } from '../domain';
import type { RepositorioSesion, UsuariaSesion } from '../domain';

export class SesionFirebase implements RepositorioSesion {
  private readonly auth: Auth;

  constructor(auth: Auth) {
    this.auth = auth;
  }

  static crear(app: FirebaseApp): SesionFirebase {
    let auth: Auth;
    try {
      auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    } catch {
      auth = getAuth(app);
    }
    auth.languageCode = 'es';
    return new SesionFirebase(auth);
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<UsuariaSesion> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, normalizarCorreo(correo), contrasena);
      return aUsuaria(cred.user);
    } catch (e) {
      throw aErrorSesion(e);
    }
  }

  async registrar(correo: string, contrasena: string, nombre: string): Promise<UsuariaSesion> {
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, normalizarCorreo(correo), contrasena);
      const limpio = nombre.trim();
      await updateProfile(cred.user, { displayName: limpio });
      return { ...aUsuaria(cred.user), nombre: limpio };
    } catch (e) {
      throw aErrorSesion(e);
    }
  }

  async enviarRecuperacion(correo: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, normalizarCorreo(correo));
    } catch (e) {
      if (e instanceof FirebaseError && e.code === 'auth/user-not-found') return;
      throw aErrorSesion(e);
    }
  }

  async cerrarSesion(): Promise<void> {
    await signOut(this.auth);
  }

  observar(callback: (usuaria: UsuariaSesion | null) => void): () => void {
    return onAuthStateChanged(this.auth, (u) => callback(u ? aUsuaria(u) : null));
  }
}

function aUsuaria(u: User): UsuariaSesion {
  return { uid: u.uid, correo: u.email, nombre: u.displayName };
}

function aErrorSesion(e: unknown): ErrorSesion {
  return new ErrorSesion(codigoSesionDesdeFirebase(e instanceof FirebaseError ? e.code : ''));
}
