import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, ShieldCheck, Trash2, Users, WifiOff } from 'lucide-react';
import { formatearBs } from '../domain';
import type { PerfilPublico, ServicioPerfiles } from '../infra/perfiles-firestore';
import { crearPerfilesDemo } from '../data/datos-prueba';
import { BotonPrincipal, CampoBusqueda, formatoNumero, normalizarBusqueda, Tarjeta, TituloSeccion } from './comunes';

const DIA_MS = 86_400_000;
const formatoHora = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' });

function hace(ms: number, ahora: number): string {
  if (!ms) return 'sin sincronizar';
  const dias = Math.floor((ahora - ms) / DIA_MS);
  if (dias <= 0) return `hoy, ${formatoHora.format(ms)}`;
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-crema-50 p-3">
      <p className="text-2xl font-black text-cafe-900 tabular-nums">{valor}</p>
      <p className="text-sm font-semibold text-cafe-500">{etiqueta}</p>
    </div>
  );
}

export function PantallaPanel({
  obtenerServicio,
  cargandoPrueba,
  onCargarPrueba,
  onAviso,
}: {
  obtenerServicio: () => Promise<ServicioPerfiles> | null;
  cargandoPrueba: boolean;
  onCargarPrueba: () => void;
  onAviso: (tipo: 'exito' | 'error', texto: string) => void;
}) {
  const [perfiles, setPerfiles] = useState<PerfilPublico[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const promesa = obtenerServicio();
    if (!promesa) return setError('El respaldo en la nube no está configurado (.env.local).');
    if (!navigator.onLine) return setError('Sin internet. El panel necesita conexión para ver a las reposteras.');
    setOcupado(true);
    try {
      const lista = await (await promesa).listar();
      setPerfiles(lista.sort((a, b) => b.ultimaActividad - a.ultimaActividad));
      setAhora(Date.now());
      setError(null);
    } catch {
      setError('No se pudo leer el panel. Revisa que publicaste las reglas nuevas de Firestore.');
    } finally {
      setOcupado(false);
    }
  }, [obtenerServicio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const conServicio = async (accion: (s: ServicioPerfiles) => Promise<string>) => {
    const promesa = obtenerServicio();
    if (!promesa) return;
    setOcupado(true);
    try {
      onAviso('exito', await accion(await promesa));
      await cargar();
    } catch {
      onAviso('error', 'No se pudo completar. Revisa tu conexión y las reglas de Firestore.');
    } finally {
      setOcupado(false);
    }
  };

  const reales = (perfiles ?? []).filter((p) => !p.demo);
  const todos = perfiles ?? [];
  const activas = todos.filter((p) => ahora - p.ultimaActividad <= 7 * DIA_MS).length;
  const suma = (f: (p: PerfilPublico) => number) => todos.reduce((t, p) => t + (f(p) || 0), 0);
  const visibles = filtro
    ? todos.filter((p) => normalizarBusqueda(`${p.nombre} ${p.correo}`).includes(normalizarBusqueda(filtro)))
    : todos;

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="border-cafe-700 bg-rosa-200">
        <p className="flex items-center gap-2 text-lg font-bold text-cafe-900">
          <ShieldCheck size={24} aria-hidden /> Rol: administradora
        </p>
        <p className="mt-1 text-base text-cafe-700">
          Ves métricas agregadas de cada repostera. Sus recetas, precios y clientas siguen siendo privados.
        </p>
      </Tarjeta>

      {error && (
        <Tarjeta className="border-rojo-texto bg-rojo-fondo">
          <p className="flex items-start gap-2 text-lg font-semibold text-rojo-texto">
            <WifiOff size={24} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </p>
        </Tarjeta>
      )}

      {perfiles && (
        <Tarjeta>
          <TituloSeccion>Resumen</TituloSeccion>
          <div className="grid grid-cols-2 gap-3">
            <Dato etiqueta={`Cuentas (${reales.length} reales)`} valor={String(todos.length)} />
            <Dato etiqueta="Activas en 7 días" valor={String(activas)} />
            <Dato etiqueta="Recetas" valor={formatoNumero.format(suma((p) => p.metricas?.recetas))} />
            <Dato etiqueta="Cotizaciones" valor={formatoNumero.format(suma((p) => p.metricas?.cotizaciones))} />
            <Dato etiqueta="Producciones" valor={formatoNumero.format(suma((p) => p.metricas?.producciones))} />
            <Dato etiqueta="Registros totales" valor={formatoNumero.format(suma((p) => p.metricas?.registros))} />
          </div>
          <p className="mt-3 text-base text-cafe-700">
            Monto cotizado en total: <strong>{formatearBs(suma((p) => p.metricas?.montoCotizado))}</strong>
          </p>
        </Tarjeta>
      )}

      <BotonPrincipal onClick={() => void cargar()} variante="suave" icono={<RefreshCw size={22} aria-hidden />} deshabilitado={ocupado}>
        {ocupado ? 'Actualizando…' : 'Actualizar'}
      </BotonPrincipal>

      {todos.length > 5 && <CampoBusqueda valor={filtro} onCambio={setFiltro} etiqueta="Buscar repostera" />}

      {visibles.map((p) => {
        const m = p.metricas;
        const activa = ahora - p.ultimaActividad <= 7 * DIA_MS;
        return (
          <Tarjeta key={p.uid}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold wrap-break-word text-cafe-900">{p.nombre}</p>
                <p className="text-base break-all text-cafe-700">{p.correo}</p>
                <p className="text-sm text-cafe-500">Última actividad: {hace(p.ultimaActividad, ahora)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {p.demo && <span className="rounded-full border-2 border-cafe-500 px-2.5 py-0.5 text-sm font-bold text-cafe-500">Demo</span>}
                {p.rol === 'administradora' && <span className="rounded-full border-2 border-cafe-700 bg-rosa-200 px-2.5 py-0.5 text-sm font-bold text-cafe-900">Admin</span>}
                <span
                  className={`rounded-full border-2 px-2.5 py-0.5 text-sm font-bold ${
                    activa ? 'border-verde-texto bg-verde-fondo text-verde-texto' : 'border-amarillo-texto bg-amarillo-fondo text-amarillo-texto'
                  }`}
                >
                  {activa ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            </div>
            {m && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Dato etiqueta="Insumos" valor={String(m.insumos)} />
                <Dato etiqueta="Recetas" valor={String(m.recetas)} />
                <Dato etiqueta="Cotiz." valor={String(m.cotizaciones)} />
                <Dato etiqueta="Producc." valor={String(m.producciones)} />
                <Dato etiqueta="Por vencer" valor={String(m.insumosPorVencer)} />
                <Dato etiqueta="Registros" valor={String(m.registros)} />
              </div>
            )}
            {m && (
              <p className="mt-2 text-sm text-cafe-700">
                Inventario: {formatearBs(m.valorInventario)} · Merma: {formatearBs(m.mermaAcumulada)} · Cotizado: {formatearBs(m.montoCotizado)}
              </p>
            )}
          </Tarjeta>
        );
      })}

      {perfiles && todos.length === 0 && (
        <p className="px-1 text-lg text-cafe-500">Aún no hay reposteras sincronizadas. Aparecen aquí cuando usan la app con internet.</p>
      )}

      <Tarjeta>
        <TituloSeccion>Datos para pruebas</TituloSeccion>
        <div className="flex flex-col gap-3">
          <BotonPrincipal onClick={onCargarPrueba} variante="suave" icono={<Database size={22} aria-hidden />} deshabilitado={cargandoPrueba}>
            {cargandoPrueba ? 'Cargando…' : 'Cargar ≈290 registros en mi cuenta'}
          </BotonPrincipal>
          <BotonPrincipal
            onClick={() =>
              void conServicio(async (s) => {
                await s.crearDemo(crearPerfilesDemo(Date.now()));
                return 'Se crearon 6 reposteras de demostración (marcadas como "Demo").';
              })
            }
            variante="suave"
            icono={<Users size={22} aria-hidden />}
            deshabilitado={ocupado}
          >
            Crear 6 reposteras demo
          </BotonPrincipal>
          {todos.some((p) => p.demo) && (
            <BotonPrincipal
              onClick={() => void conServicio(async (s) => `Se borraron ${await s.borrarDemo()} cuentas demo.`)}
              variante="suave"
              icono={<Trash2 size={22} aria-hidden />}
              deshabilitado={ocupado}
            >
              Borrar reposteras demo
            </BotonPrincipal>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
