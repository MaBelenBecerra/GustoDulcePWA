import { useEffect, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { AlertTriangle, Cake, CheckCircle2, Eye, EyeOff, WifiOff } from 'lucide-react';
import { ErrorSesion, hayErrores, MENSAJES_SESION, validarCorreo, validarIngreso, validarRegistro } from './domain';
import type { CampoSesion, ErroresSesion, RepositorioSesion, UsuariaSesion } from './domain';
import './App.css';

type Modo = 'entrar' | 'registro' | 'recuperar';

const TEXTOS: Readonly<Record<Modo, { titulo: string; boton: string; ocupado: string }>> = {
  entrar: { titulo: 'Inicia sesión', boton: 'Entrar', ocupado: 'Entrando…' },
  registro: { titulo: 'Crea tu cuenta', boton: 'Crear cuenta', ocupado: 'Creando…' },
  recuperar: { titulo: 'Recupera tu contraseña', boton: 'Enviar enlace', ocupado: 'Enviando…' },
};

export const MENSAJE_RECUPERACION =
  'Si el correo está registrado, te enviamos un enlace para cambiar la contraseña. Revisa también Spam.';

function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);
  return enLinea;
}

interface PropsCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  id: string;
  etiqueta: string;
  error: string | undefined;
}

function Campo({ id, etiqueta, error, type = 'text', ...resto }: PropsCampo) {
  const esContrasena = type === 'password';
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold text-cafe-700">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          type={esContrasena && visible ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-14 w-full appearance-none rounded-2xl border-2 bg-crema-50 px-4 text-lg text-cafe-900 placeholder:text-cafe-500 focus:border-cafe-700 focus:outline-none ${
            esContrasena ? 'pr-16' : ''
          } ${error ? 'border-rojo-texto' : 'border-crema-200'}`}
          {...resto}
        />
        {esContrasena && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            className="boton-tactil absolute top-1 right-1 flex size-12 items-center justify-center rounded-xl text-cafe-700"
          >
            {visible ? <EyeOff size={26} aria-hidden /> : <Eye size={26} aria-hidden />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-base font-semibold text-rojo-texto">
          {error}
        </p>
      )}
    </div>
  );
}

export function PantallaAcceso({
  repositorio,
  onIngreso,
}: {
  repositorio: RepositorioSesion;
  onIngreso: (usuaria: UsuariaSesion) => void;
}) {
  const enLinea = useEnLinea();
  const [modo, setModo] = useState<Modo>('entrar');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<ErroresSesion>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cambiarModo = (siguiente: Modo) => {
    setModo(siguiente);
    setErrores({});
    setMensaje(null);
    setContrasena('');
  };

  const limpiarError = (campo: CampoSesion) => setErrores(({ [campo]: _quitado, ...resto }) => resto);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (ocupado) return;
    setMensaje(null);

    const nuevos: ErroresSesion =
      modo === 'entrar'
        ? validarIngreso(correo, contrasena)
        : modo === 'registro'
          ? validarRegistro(correo, contrasena, nombre)
          : (() => {
              const error = validarCorreo(correo);
              return error ? { correo: error } : {};
            })();
    setErrores(nuevos);
    if (hayErrores(nuevos)) {
      const primero = (['nombre', 'correo', 'contrasena'] as const).find((c) => nuevos[c]);
      if (primero) document.getElementById(`acceso-${primero}`)?.focus();
      return;
    }
    if (!navigator.onLine) {
      setMensaje({ tipo: 'error', texto: MENSAJES_SESION['sin-conexion'] });
      return;
    }

    setOcupado(true);
    try {
      if (modo === 'recuperar') {
        await repositorio.enviarRecuperacion(correo);
        cambiarModo('entrar');
        setMensaje({ tipo: 'exito', texto: MENSAJE_RECUPERACION });
        return;
      }
      const usuaria =
        modo === 'entrar'
          ? await repositorio.iniciarSesion(correo, contrasena)
          : await repositorio.registrar(correo, contrasena, nombre);
      onIngreso(usuaria);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error instanceof ErrorSesion ? error.message : MENSAJES_SESION.desconocido });
    } finally {
      setOcupado(false);
    }
  };

  const { titulo, boton, ocupado: textoOcupado } = TEXTOS[modo];
  const enlace =
    'boton-tactil min-h-14 w-full rounded-2xl border-2 border-crema-200 bg-crema-50 px-5 text-lg font-bold text-cafe-700';

  return (
    <div className="min-h-dvh bg-crema-50 text-cafe-900">
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-20 items-center justify-center rounded-full border-2 border-rosa-400 bg-rosa-200 text-cafe-900">
            <Cake size={40} strokeWidth={2.2} aria-hidden />
          </span>
          <h1 className="text-4xl font-black text-cafe-900">GustoDulce</h1>
          <p className="text-lg text-cafe-500">Costos, recetas e inventario de tu repostería</p>
        </header>

        {!enLinea && (
          <p
            role="status"
            className="flex items-start gap-3 rounded-2xl border-2 border-amarillo-texto bg-amarillo-fondo p-4 text-base font-semibold text-amarillo-texto"
          >
            <WifiOff className="mt-0.5 shrink-0" size={22} aria-hidden />
            Estás sin internet. Para entrar la primera vez necesitas conexión; después la app funciona sin red.
          </p>
        )}

        <form
          noValidate
          onSubmit={enviar}
          aria-labelledby="acceso-titulo"
          className="flex flex-col gap-5 rounded-3xl border-2 border-crema-200 bg-crema-100 p-4"
        >
          <h2 id="acceso-titulo" className="text-xl font-extrabold text-cafe-900">
            {titulo}
          </h2>

          {modo === 'registro' && (
            <Campo
              id="acceso-nombre"
              etiqueta="Tu nombre o el de tu emprendimiento"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                limpiarError('nombre');
              }}
              error={errores.nombre}
            />
          )}

          <Campo
            id="acceso-correo"
            etiqueta="Correo electrónico"
            type="email"
            inputMode="email"
            autoComplete={modo === 'registro' ? 'email' : 'username'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint={modo === 'recuperar' ? 'send' : 'next'}
            placeholder="tucorreo@gmail.com"
            value={correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              limpiarError('correo');
            }}
            error={errores.correo}
          />

          {modo !== 'recuperar' && (
            <Campo
              id="acceso-contrasena"
              etiqueta="Contraseña"
              type="password"
              autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={contrasena}
              onChange={(e) => {
                setContrasena(e.target.value);
                limpiarError('contrasena');
              }}
              error={errores.contrasena}
            />
          )}

          {mensaje && (
            <p
              role={mensaje.tipo === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-base font-semibold ${
                mensaje.tipo === 'error'
                  ? 'border-rojo-texto bg-rojo-fondo text-rojo-texto'
                  : 'border-verde-texto bg-verde-fondo text-verde-texto'
              }`}
            >
              {mensaje.tipo === 'error' ? (
                <AlertTriangle className="mt-0.5 shrink-0" size={22} aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 shrink-0" size={22} aria-hidden />
              )}
              {mensaje.texto}
            </p>
          )}

          <button
            type="submit"
            disabled={ocupado}
            aria-busy={ocupado || undefined}
            className="boton-tactil flex min-h-16 w-full items-center justify-center rounded-2xl border-2 border-rosa-400 bg-rosa-300 px-5 text-lg font-bold text-cafe-900 select-none disabled:opacity-60"
          >
            {ocupado ? textoOcupado : boton}
          </button>
        </form>

        <div className="flex flex-col gap-3">
          {modo === 'entrar' ? (
            <>
              <button type="button" onClick={() => cambiarModo('recuperar')} className={enlace}>
                ¿Olvidaste tu contraseña?
              </button>
              <button type="button" onClick={() => cambiarModo('registro')} className={enlace}>
                ¿No tienes cuenta? Regístrate
              </button>
            </>
          ) : (
            <button type="button" onClick={() => cambiarModo('entrar')} className={enlace}>
              Volver a iniciar sesión
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
