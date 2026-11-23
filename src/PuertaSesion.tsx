import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Cake, CloudOff } from 'lucide-react';
import type { RepositorioSesion, UsuariaSesion } from './domain';
import { repositorioSesion, respaldoConfigurado } from './aplicacion/contenedor';
import { PantallaAcceso } from './PantallaAcceso';
import './App.css';

type Estado =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'solo-local' }
  | { readonly tipo: 'error-carga' }
  | { readonly tipo: 'anonima' }
  | { readonly tipo: 'activa'; readonly usuaria: UsuariaSesion };

interface ValorSesion {
  readonly usuaria: UsuariaSesion | null;
  readonly cerrarSesion: () => Promise<void>;
}

const ContextoSesion = createContext<ValorSesion>({ usuaria: null, cerrarSesion: async () => {} });

export function useSesion(): ValorSesion {
  return useContext(ContextoSesion);
}

function Abriendo() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center bg-crema-50 text-xl font-bold text-cafe-700">
      <Cake className="mr-3" aria-hidden /> Abriendo tu cocina…
    </div>
  );
}

export function PuertaSesion({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<RepositorioSesion | null>(null);
  const [estado, setEstado] = useState<Estado>(() => (respaldoConfigurado ? { tipo: 'cargando' } : { tipo: 'solo-local' }));
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const promesa = repositorioSesion();
    if (!promesa) return;
    let vigente = true;
    let desuscribir: (() => void) | null = null;
    promesa
      .then((r) => {
        if (!vigente) return;
        setRepo(r);
        desuscribir = r.observar((u) =>
          setEstado((previo) =>
            u
              ? { tipo: 'activa', usuaria: previo.tipo === 'activa' && previo.usuaria.uid === u.uid ? { ...u, nombre: u.nombre ?? previo.usuaria.nombre } : u }
              : { tipo: 'anonima' },
          ),
        );
      })
      .catch(() => vigente && setEstado({ tipo: 'error-carga' }));
    return () => {
      vigente = false;
      desuscribir?.();
    };
  }, [intento]);

  const cerrarSesion = useCallback(async () => {
    await repo?.cerrarSesion();
  }, [repo]);

  const valor = useMemo<ValorSesion>(
    () => ({ usuaria: estado.tipo === 'activa' ? estado.usuaria : null, cerrarSesion }),
    [estado, cerrarSesion],
  );

  if (estado.tipo === 'cargando') return <Abriendo />;

  if (estado.tipo === 'error-carga') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-crema-50 px-6 text-center text-cafe-900">
        <CloudOff size={40} className="text-cafe-700" aria-hidden />
        <p className="text-xl font-bold">No se pudo preparar el inicio de sesión. Revisa tu conexión.</p>
        <button
          type="button"
          onClick={() => {
            setEstado({ tipo: 'cargando' });
            setIntento((n) => n + 1);
          }}
          className="boton-tactil min-h-16 w-full max-w-sm rounded-2xl border-2 border-rosa-400 bg-rosa-300 px-5 text-lg font-bold text-cafe-900"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (estado.tipo === 'anonima' && repo) {
    return <PantallaAcceso repositorio={repo} onIngreso={(usuaria) => setEstado({ tipo: 'activa', usuaria })} />;
  }

  const clave = estado.tipo === 'activa' ? estado.usuaria.uid : 'local';
  return (
    <ContextoSesion.Provider value={valor}>
      <Fragment key={clave}>{children}</Fragment>
    </ContextoSesion.Provider>
  );
}
