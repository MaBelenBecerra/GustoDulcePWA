import { describe, expect, it } from 'vitest';
import {
  codigoSesionDesdeFirebase,
  ErrorSesion,
  hayErrores,
  MENSAJES_SESION,
  normalizarCorreo,
  validarCorreo,
  validarIngreso,
  validarRegistro,
} from '../index';
import type { CodigoErrorSesion } from '../index';

describe('normalizarCorreo', () => {
  it('quita espacios y pasa a minúsculas (autocapitalización del teclado móvil)', () => {
    expect(normalizarCorreo('  Belen@Gmail.COM ')).toBe('belen@gmail.com');
  });
});

describe('validarCorreo', () => {
  it.each(['', '   '])('vacío %j → pide el correo', (c) => {
    expect(validarCorreo(c)).toBe('Ingresa tu correo.');
  });

  it.each(['belen', 'belen@', 'belen@gmail', 'belen @gmail.com', '@gmail.com', 'a@b.c'])(
    'formato inválido: %s',
    (c) => expect(validarCorreo(c)).toBe(MENSAJES_SESION['correo-invalido']),
  );

  it.each(['belen@gmail.com', ' Belen@Hotmail.com ', 'dulces.belen@empresa.com.bo'])('válido: %s', (c) => {
    expect(validarCorreo(c)).toBeUndefined();
  });
});

describe('validarIngreso', () => {
  it('sin errores con datos completos', () => {
    expect(hayErrores(validarIngreso('belen@gmail.com', 'x'))).toBe(false);
  });

  it('reporta ambos campos vacíos', () => {
    expect(validarIngreso('', '')).toEqual({ correo: 'Ingresa tu correo.', contrasena: 'Ingresa tu contraseña.' });
  });

  it('no exige largo mínimo al entrar (la regla aplica al registrar)', () => {
    expect(validarIngreso('a@b.co', '123').contrasena).toBeUndefined();
  });
});

describe('validarRegistro', () => {
  const correo = 'belen@gmail.com';
  const nombre = 'Dulces Belén';

  it('acepta un registro válido', () => {
    expect(hayErrores(validarRegistro(correo, 'torta2026', nombre))).toBe(false);
  });

  it('rechaza un nombre de 1 letra aunque tenga espacios', () => {
    expect(validarRegistro(correo, 'torta2026', '  B ').nombre).toBeDefined();
  });

  it('límite de largo: 7 caracteres se rechaza, 8 se acepta', () => {
    expect(validarRegistro(correo, 'abc1234', nombre).contrasena).toMatch(/al menos 8/);
    expect(validarRegistro(correo, 'abcd1234', nombre).contrasena).toBeUndefined();
  });

  it.each(['soloLetras', '12345678'])('exige letras y números: %s', (p) => {
    expect(validarRegistro(correo, p, nombre).contrasena).toBe('La contraseña debe combinar letras y números.');
  });

  it('acepta letras con tilde y ñ', () => {
    expect(validarRegistro(correo, 'ñandú2026', nombre).contrasena).toBeUndefined();
  });
});

describe('codigoSesionDesdeFirebase', () => {
  it.each([
    ['auth/invalid-credential', 'credenciales-invalidas'],
    ['auth/user-not-found', 'credenciales-invalidas'],
    ['auth/wrong-password', 'credenciales-invalidas'],
    ['auth/invalid-email', 'correo-invalido'],
    ['auth/email-already-in-use', 'correo-en-uso'],
    ['auth/weak-password', 'contrasena-debil'],
    ['auth/too-many-requests', 'demasiados-intentos'],
    ['auth/network-request-failed', 'sin-conexion'],
    ['auth/user-disabled', 'cuenta-deshabilitada'],
  ] as const)('%s → %s', (f, esperado) => {
    expect(codigoSesionDesdeFirebase(f)).toBe(esperado);
  });

  it('correo inexistente y contraseña errónea son indistinguibles (no revela cuentas)', () => {
    expect(codigoSesionDesdeFirebase('auth/user-not-found')).toBe(codigoSesionDesdeFirebase('auth/wrong-password'));
  });

  it.each(['', 'auth/algo-nuevo', 'permission-denied'])('desconocido %j → desconocido', (c) => {
    expect(codigoSesionDesdeFirebase(c)).toBe('desconocido');
  });
});

describe('ErrorSesion', () => {
  it('lleva el código y el mensaje en español', () => {
    for (const c of Object.keys(MENSAJES_SESION) as CodigoErrorSesion[]) {
      const e = new ErrorSesion(c);
      expect(e.codigo).toBe(c);
      expect(e.message).toBe(MENSAJES_SESION[c]);
      expect(e).toBeInstanceOf(Error);
    }
  });
});
