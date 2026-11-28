import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Cake, Calculator, CloudOff, ListChecks, LogOut, Package, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { calcularMetricas, formatearBs, recetasPorUso, rolDe, usoPorReceta } from './domain';
import type { ConfiguracionCostos, CotizacionGuardada, Id, Receta } from './domain';
import { crearDatosPrueba } from './data/datos-prueba';
import { ADMINISTRADORAS, espacio, motorRespaldo, respaldoConfigurado, servicioPerfiles } from './aplicacion/contenedor';
import type { DatosInsumoNuevo, DatosRecetaNueva, Estado } from './aplicacion/servicio';
import { useSesion } from './PuertaSesion';
import { AvisoFlotante, formatearCantidad, useHoy } from './ui/comunes';
import type { Aviso } from './ui/comunes';
import { PantallaBienvenida, contarPasos } from './ui/PantallaBienvenida';
import type { EstadoPasos } from './ui/PantallaBienvenida';
import { PantallaCostos } from './ui/PantallaCostos';
import { PantallaCotizador } from './ui/PantallaCotizador';
import { PantallaInventario } from './ui/PantallaInventario';
import { PantallaPanel } from './ui/PantallaPanel';
import { PantallaRecetas } from './ui/PantallaRecetas';
import './App.css';

type Seccion = 'inicio' | 'inventario' | 'costos' | 'recetas' | 'cotizador' | 'panel';

const SECCIONES: readonly { id: Seccion; titulo: string; corto: string; icono: typeof Package; soloAdmin?: boolean }[] = [
  { id: 'inventario', titulo: 'Mi inventario', corto: 'Inventario', icono: Package },
  { id: 'costos', titulo: 'Costos fijos y horas', corto: 'Costos', icono: Wallet },
  { id: 'recetas', titulo: 'Mis recetas', corto: 'Recetas', icono: BookOpen },
  { id: 'cotizador', titulo: 'Cotizador', corto: 'Cotización', icono: Calculator },
  { id: 'panel', titulo: 'Panel de reposteras', corto: 'Panel', icono: ShieldCheck, soloAdmin: true },
];

const TITULO_INICIO = 'Primeros pasos';
const META_BIENVENIDA = 'bienvenidaCerrada';

function BarraInferior({ actual, onIr, admin }: { actual: Seccion; onIr: (s: Seccion) => void; admin: boolean }) {
  const visibles = SECCIONES.filter((s) => admin || !s.soloAdmin);
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-crema-200 bg-crema-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className={`mx-auto grid max-w-lg gap-2 px-1 py-2 ${visibles.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {visibles.map(({ id, corto, icono: Icono }) => {
          const activo = id === actual;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={() => onIr(id)}
                aria-current={activo ? 'page' : undefined}
                className={`boton-tactil flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 px-0 font-bold ${
                  visibles.length === 5 ? 'text-[clamp(0.65rem,3.2vw,0.8rem)]' : 'text-[clamp(0.75rem,3.75vw,0.875rem)]'
                } ${activo ? 'border-cafe-700 bg-rosa-200 text-cafe-900' : 'border-transparent text-cafe-700'}`}
              >
                <Icono size={visibles.length === 5 ? 24 : 28} strokeWidth={activo ? 2.5 : 2} aria-hidden />
                <span className="max-w-full truncate leading-none">{visibles.length === 5 && id === 'cotizador' ? 'Cotizar' : corto}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BotonSalir({ onSalir }: { onSalir: () => void }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = window.setTimeout(() => setArmado(false), 3000);
    return () => window.clearTimeout(t);
  }, [armado]);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armado) return setArmado(true);
        setArmado(false);
        onSalir();
      }}
      aria-label={armado ? 'Toca otra vez para cerrar sesión' : 'Cerrar sesión'}
      className={`boton-tactil flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 px-2.5 font-bold ${
        armado ? 'border-rojo-texto bg-rojo-fondo text-rojo-texto' : 'border-crema-200 bg-crema-100 text-cafe-700'
      }`}
    >
      <LogOut size={22} aria-hidden />
      {armado && <span>¿Salir?</span>}
    </button>
  );
}

export default function App() {
  const hoy = useHoy();
  const { usuaria, cerrarSesion } = useSesion();
  const uid = usuaria?.uid ?? null;
  const { servicio, repositorio } = useMemo(() => espacio(uid), [uid]);
  const rol = rolDe(usuaria?.correo ?? null, ADMINISTRADORAS);
  const esAdmin = rol === 'administradora';

  const [seccion, setSeccion] = useState<Seccion>('inventario');
  const [estado, setEstado] = useState<Estado | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [bienvenidaCerrada, setBienvenidaCerrada] = useState(true);
  const [cargandoPrueba, setCargandoPrueba] = useState(false);

  const cerrarAviso = useCallback(() => setAviso(null), []);
  const mostrarError = useCallback(
    (e: unknown, porDefecto: string) => setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : porDefecto }),
    [],
  );

  const publicarPerfil = useCallback(
    async (e: Estado) => {
      if (!usuaria) return;
      const promesa = servicioPerfiles();
      if (!promesa) return;
      const metricas = calcularMetricas({ ...e, mermaAcumulada: e.proyeccion.valorMerma, hoy });
      await (await promesa).publicar({
        uid: usuaria.uid,
        nombre: usuaria.nombre ?? usuaria.correo ?? 'Repostera',
        correo: usuaria.correo ?? '',
        rol,
        metricas,
      });
    },
    [usuaria, rol, hoy],
  );

  const refrescar = useCallback(async (): Promise<Estado> => {
    let actual = await servicio.estado();
    setEstado(actual);
    setPendientes(await repositorio.contarPendientes());
    const motor = await motorRespaldo(uid);
    if (motor && navigator.onLine) {
      try {
        await motor.sincronizar();
        actual = await servicio.estado();
        setEstado(actual);
        setPendientes(await repositorio.contarPendientes());
        await publicarPerfil(actual);
      } catch {
      }
    }
    return actual;
  }, [servicio, repositorio, uid, publicarPerfil]);

  useEffect(() => {
    (async () => {
      const actual = await refrescar();
      const cerrada = await repositorio.leerMeta<boolean>(META_BIENVENIDA, false);
      setBienvenidaCerrada(cerrada);
      if (!cerrada && (actual.insumos.length === 0 || actual.recetas.filter((r) => !r.archivada).length === 0)) {
        setSeccion('inicio');
      }
    })().catch((e) => mostrarError(e, 'No se pudo abrir la base de datos del teléfono.'));
    const alVolverLaRed = () => void refrescar();
    window.addEventListener('online', alVolverLaRed);
    return () => window.removeEventListener('online', alVolverLaRed);
  }, []);

  const mapaInsumos = useMemo(() => new Map((estado?.insumos ?? []).map((i) => [i.id, i])), [estado]);
  const recetasOrdenadas = useMemo(
    () => (estado ? recetasPorUso(estado.recetas, usoPorReceta(estado.movimientos, estado.cotizaciones)) : []),
    [estado],
  );

  const irA = (s: Seccion) => {
    setSeccion(s);
    window.scrollTo({ top: 0 });
  };

  const terminarBienvenida = async () => {
    setBienvenidaCerrada(true);
    await repositorio.guardarMeta(META_BIENVENIDA, true);
    irA('inventario');
  };

  const registrar = async (insumoId: Id, presentaciones: number, precioPorPresentacion: number, diasVence: number) => {
    const insumo = mapaInsumos.get(insumoId);
    if (!insumo) return;
    try {
      await servicio.registrarCompra({ insumoId, presentaciones, precioPorPresentacion, diasVence, hoy });
      await refrescar();
      setAviso({ tipo: 'exito', texto: `Compra de ${insumo.nombre} guardada. Tus recetas ya usan el nuevo precio.` });
    } catch (e) {
      mostrarError(e, 'No se pudo guardar la compra.');
    }
  };

  const crearInsumo = async (datos: DatosInsumoNuevo): Promise<boolean> => {
    try {
      const insumo = await servicio.crearInsumo(datos);
      await refrescar();
      setAviso({
        tipo: 'exito',
        texto:
          datos.presentaciones > 0
            ? `${insumo.nombre} registrado con ${formatearCantidad(datos.presentaciones * datos.presentacionCantidad, datos.unidad)} en la despensa.`
            : `${insumo.nombre} registrado. Anota la compra cuando lo tengas.`,
      });
      return true;
    } catch (e) {
      mostrarError(e, 'No se pudo registrar el insumo.');
      return false;
    }
  };

  const darDeBaja = async () => {
    try {
      const valor = await servicio.darDeBaja(hoy);
      if (valor <= 0) return;
      await refrescar();
      setAviso({ tipo: 'exito', texto: `Merma registrada: ${formatearBs(valor)}.` });
    } catch (e) {
      mostrarError(e, 'No se pudo registrar la merma.');
    }
  };

  const actualizarReceta = async (recetaId: Id, cambio: (r: Receta) => Receta) => {
    const receta = estado?.recetas.find((r) => r.id === recetaId);
    if (!receta) return;
    const nueva = cambio(receta);
    setEstado((e) => (e ? { ...e, recetas: e.recetas.map((r) => (r.id === recetaId ? nueva : r)) } : e));
    try {
      await servicio.guardarReceta(nueva);
      setPendientes(await repositorio.contarPendientes());
    } catch (e) {
      mostrarError(e, 'No se pudo guardar la receta.');
      await refrescar();
    }
  };

  const crearReceta = async (datos: DatosRecetaNueva): Promise<Receta | null> => {
    try {
      const receta = await servicio.crearReceta(datos);
      await refrescar();
      setAviso({ tipo: 'exito', texto: `Receta "${receta.nombre}" guardada. Ya puedes cotizarla.` });
      return receta;
    } catch (e) {
      mostrarError(e, 'No se pudo guardar la receta.');
      return null;
    }
  };

  const archivarReceta = async (recetaId: Id) => {
    try {
      await servicio.archivarReceta(recetaId);
      await refrescar();
      setAviso({ tipo: 'exito', texto: 'Receta retirada. Su historial de producciones se conserva.' });
    } catch (e) {
      mostrarError(e, 'No se pudo retirar la receta.');
    }
  };

  const cambiarConfig = async (cambio: (c: ConfiguracionCostos) => ConfiguracionCostos) => {
    if (!estado) return;
    const nueva = cambio(estado.config);
    setEstado((e) => (e ? { ...e, config: nueva, configGuardada: true } : e));
    try {
      await servicio.guardarConfiguracion(nueva);
      setPendientes(await repositorio.contarPendientes());
    } catch (e) {
      mostrarError(e, 'No se pudo guardar la configuración.');
      await refrescar();
    }
  };

  const registrarCotizacion = async (datos: Omit<CotizacionGuardada, 'id'>) => {
    try {
      await servicio.registrarCotizacion(datos);
      await refrescar();
    } catch (e) {
      mostrarError(e, 'La cotización se envió, pero no se pudo guardar en el historial.');
    }
  };

  const cargarPrueba = async () => {
    setCargandoPrueba(true);
    try {
      const r = await servicio.cargarDatosPrueba(crearDatosPrueba(hoy), hoy);
      await refrescar();
      setAviso({
        tipo: 'exito',
        texto: `Se cargaron ${r.total} registros: ${r.insumos} insumos, ${r.recetas} recetas, ${r.lotes} compras, ${r.cotizaciones} cotizaciones y ${r.producciones} producciones.`,
      });
    } catch (e) {
      mostrarError(e, 'No se pudieron cargar los datos de prueba.');
    } finally {
      setCargandoPrueba(false);
    }
  };

  const producirReceta = async (recetaId: Id, veces: number) => {
    const receta = estado?.recetas.find((r) => r.id === recetaId);
    if (!receta) return;
    let resultado;
    try {
      resultado = await servicio.producir({ recetaId, veces, hoy });
    } catch (e) {
      mostrarError(e, 'No se pudo registrar la producción.');
      return;
    }
    if (resultado.ok) {
      await refrescar();
      setAviso({
        tipo: 'exito',
        texto: `¡Listo! ${resultado.valor.unidadesProducidas} porciones de ${receta.nombre}. Materia prima usada: ${formatearBs(resultado.valor.costoMPDReal)}.`,
      });
      return;
    }
    const { error } = resultado;
    if (error.tipo === 'INSUMO_DESCONOCIDO') {
      setAviso({ tipo: 'error', texto: 'La receta usa un insumo que ya no existe.' });
      return;
    }
    const detalle = error.faltantes
      .map((f) => {
        const insumo = mapaInsumos.get(f.insumoId);
        return insumo ? `${insumo.nombre} (faltan ${formatearCantidad(f.faltante, insumo.unidad)})` : f.insumoId;
      })
      .join(', ');
    setAviso({ tipo: 'error', texto: `No alcanza: ${detalle}. No se descontó nada.` });
  };

  if (!estado) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-crema-50 text-xl font-bold text-cafe-700">
        <Cake className="mr-3" aria-hidden /> Abriendo tu cocina…
      </div>
    );
  }

  const { insumos, lotes, config } = estado;
  const pasos: EstadoPasos = {
    costos: estado.configGuardada,
    inventario: insumos.length > 0,
    recetas: recetasOrdenadas.length > 0,
    cotizador: estado.cotizaciones.length > 0,
  };
  const hechos = contarPasos(pasos);
  const mostrarChipPasos = !bienvenidaCerrada && hechos < 4 && seccion !== 'inicio';
  const seccionValida: Seccion = seccion === 'panel' && !esAdmin ? 'inventario' : seccion;
  const titulo = seccionValida === 'inicio' ? TITULO_INICIO : (SECCIONES.find((s) => s.id === seccionValida)?.titulo ?? '');

  return (
    <div className="min-h-dvh bg-crema-50 text-cafe-900">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-crema-200 bg-crema-50/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-cafe-500 uppercase">
            <Cake size={16} aria-hidden /> GustoDulce
            {esAdmin && <span className="rounded-full bg-rosa-200 px-2 text-xs text-cafe-900 normal-case">Admin</span>}
          </p>
          <h1 className="text-[clamp(1.2rem,5.6vw,1.5rem)] leading-tight font-black text-balance text-cafe-900">{titulo}</h1>
        </div>
        {mostrarChipPasos && (
          <button
            type="button"
            onClick={() => irA('inicio')}
            aria-label={`Primeros pasos: ${hechos} de 4`}
            className="boton-tactil flex h-12 shrink-0 items-center gap-1 rounded-2xl border-2 border-rosa-400 bg-rosa-100 px-2.5 text-sm font-bold text-cafe-900"
          >
            <ListChecks size={20} aria-hidden /> {hechos}/4
          </button>
        )}
        <span
          role="status"
          aria-label={
            respaldoConfigurado && pendientes > 0
              ? `Guardado en el teléfono. ${pendientes} cambios esperan respaldo en la nube.`
              : 'Todo guardado en el teléfono'
          }
          className="flex h-12 shrink-0 items-center gap-1 rounded-full border-2 border-crema-200 bg-crema-100 px-2.5 text-sm font-bold text-cafe-700"
        >
          {respaldoConfigurado && pendientes > 0 ? (
            <>
              <CloudOff size={20} aria-hidden /> {pendientes}
            </>
          ) : (
            <Smartphone size={20} aria-hidden />
          )}
        </span>
        {usuaria && <BotonSalir onSalir={() => void cerrarSesion()} />}
      </header>

      <main className="mx-auto max-w-lg px-4 pt-4 pb-[calc(8rem+env(safe-area-inset-bottom))]">
        {seccionValida === 'inicio' && (
          <PantallaBienvenida
            nombre={usuaria?.nombre ?? null}
            pasos={pasos}
            esAdministradora={esAdmin}
            cargando={cargandoPrueba}
            onIr={irA}
            onCargarPrueba={() => void cargarPrueba()}
            onTerminar={() => void terminarBienvenida()}
          />
        )}
        {seccionValida === 'inventario' && (
          <PantallaInventario
            insumos={insumos}
            lotes={lotes}
            hoy={hoy}
            mermaAcumulada={estado.proyeccion.valorMerma}
            onRegistrarCompra={registrar}
            onCrearInsumo={crearInsumo}
            onDarDeBaja={darDeBaja}
          />
        )}
        {seccionValida === 'recetas' && (
          <PantallaRecetas
            recetas={recetasOrdenadas}
            insumos={insumos}
            lotes={lotes}
            config={config}
            hoy={hoy}
            onActualizar={actualizarReceta}
            onCrear={crearReceta}
            onArchivar={archivarReceta}
            onProducir={producirReceta}
            onIrInventario={() => irA('inventario')}
          />
        )}
        {seccionValida === 'costos' && <PantallaCostos config={config} guardada={estado.configGuardada} onCambiar={cambiarConfig} />}
        {seccionValida === 'cotizador' && (
          <PantallaCotizador
            recetas={recetasOrdenadas}
            insumos={insumos}
            config={config}
            negocio={usuaria?.nombre ?? 'GustoDulce'}
            hoy={hoy}
            onRegistrar={registrarCotizacion}
            onIrRecetas={() => irA('recetas')}
          />
        )}
        {seccionValida === 'panel' && esAdmin && (
          <PantallaPanel
            obtenerServicio={servicioPerfiles}
            cargandoPrueba={cargandoPrueba}
            onCargarPrueba={() => void cargarPrueba()}
            onAviso={(tipo, texto) => setAviso({ tipo, texto })}
          />
        )}
      </main>

      <BarraInferior actual={seccionValida} onIr={irA} admin={esAdmin} />
      <AvisoFlotante aviso={aviso} onCerrar={cerrarAviso} />
    </div>
  );
}
