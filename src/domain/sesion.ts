export interface UsuariaSesion {
  readonly uid: string;
  readonly correo: string | null;
  readonly nombre: string | null;
}

export type CodigoErrorSesion =
  | 'credenciales-invalidas'
  | 'correo-invalido'
  | 'correo-en-uso'
  | 'contrasena-debil'
  | 'demasiados-intentos'
  | 'sin-conexion'
  | 'cuenta-deshabilitada'
  | 'desconocido';

export const MENSAJES_SESION: Readonly<Record<CodigoErrorSesion, string>> = {
  'credenciales-invalidas': 'Correo o contraseña incorrectos.',
  'correo-invalido': 'El correo no tiene un formato válido.',
  'correo-en-uso': 'Ya existe una cuenta con este correo. Inicia sesión.',
  'contrasena-debil': 'Contraseña muy débil: usa al menos 8 caracteres con letras y números.',
  'demasiados-intentos': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  'sin-conexion': 'Sin internet. Conéctate para iniciar sesión.',
  'cuenta-deshabilitada': 'Esta cuenta está deshabilitada.',
  desconocido: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
};

export class ErrorSesion extends Error {
  readonly codigo: CodigoErrorSesion;

  constructor(codigo: CodigoErrorSesion) {
    super(MENSAJES_SESION[codigo]);
    this.name = 'ErrorSesion';
    this.codigo = codigo;
  }
}

export interface RepositorioSesion {
  iniciarSesion(correo: string, contrasena: string): Promise<UsuariaSesion>;
  registrar(correo: string, contrasena: string, nombre: string): Promise<UsuariaSesion>;
  enviarRecuperacion(correo: string): Promise<void>;
  cerrarSesion(): Promise<void>;
  observar(callback: (usuaria: UsuariaSesion | null) => void): () => void;
}
const DESDE_FIREBASE: Readonly<Record<string, CodigoErrorSesion>> = {
  'auth/invalid-credential': 'credenciales-invalidas',
  'auth/invalid-login-credentials': 'credenciales-invalidas',
  'auth/user-not-found': 'credenciales-invalidas',
  'auth/wrong-password': 'credenciales-invalidas',
  'auth/missing-password': 'credenciales-invalidas',
  'auth/invalid-email': 'correo-invalido',
  'auth/missing-email': 'correo-invalido',
  'auth/email-already-in-use': 'correo-en-uso',
  'auth/weak-password': 'contrasena-debil',
  'auth/password-does-not-meet-requirements': 'contrasena-debil',
  'auth/too-many-requests': 'demasiados-intentos',
  'auth/network-request-failed': 'sin-conexion',
  'auth/user-disabled': 'cuenta-deshabilitada',
};

export function codigoSesionDesdeFirebase(codigoFirebase: string): CodigoErrorSesion {
  return DESDE_FIREBASE[codigoFirebase] ?? 'desconocido';
}

export type CampoSesion = 'correo' | 'contrasena' | 'nombre';
export type ErroresSesion = Partial<Record<CampoSesion, string>>;

export const LARGO_MINIMO_CONTRASENA = 8;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function validarCorreo(correo: string): string | undefined {
  const v = normalizarCorreo(correo);
  if (v === '') return 'Ingresa tu correo.';
  if (!PATRON_CORREO.test(v)) return MENSAJES_SESION['correo-invalido'];
  return undefined;
}

export function validarIngreso(correo: string, contrasena: string): ErroresSesion {
  const errores: ErroresSesion = {};
  const eCorreo = validarCorreo(correo);
  if (eCorreo) errores.correo = eCorreo;
  if (contrasena === '') errores.contrasena = 'Ingresa tu contraseña.';
  return errores;
}

export function validarRegistro(correo: string, contrasena: string, nombre: string): ErroresSesion {
  const errores: ErroresSesion = {};
  if (nombre.trim().length < 2) errores.nombre = 'Ingresa tu nombre o el de tu emprendimiento.';
  const eCorreo = validarCorreo(correo);
  if (eCorreo) errores.correo = eCorreo;
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    errores.contrasena = `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  } else if (!/\p{L}/u.test(contrasena) || !/\d/.test(contrasena)) {
    errores.contrasena = 'La contraseña debe combinar letras y números.';
  }
  return errores;
}

export function hayErrores(errores: ErroresSesion): boolean {
  return Object.values(errores).some((m) => m !== undefined);
}
