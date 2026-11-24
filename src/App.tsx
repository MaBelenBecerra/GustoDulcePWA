import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Cake,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  ChevronUp,
  Clock,
  Flame,
  LogOut,
  Minus,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  calcularCostoReceta,
  cotizar,
  decimalesPorPaso,
  diasRestantes,
  fechaLocalISO,
  formatearBs,
  HORAS_MES_MAXIMO,
  limitar,
  redondear,
  resumenInsumo,
  semaforo,
  sumaPrecisa,
  tasaMinutoCIF,
  tasaMinutoMOD,
  textoParaEditar,
  validarEntradaNumerica,
} from './domain';
import type {
  ConfiguracionCostos,
  FechaISO,
  Id,
  Insumo,
  Lote,
  Receta,
  Semaforo,
  UnidadBase,
} from './domain';
import { crearSemilla } from './data/demo';
import { motorRespaldo, repositorio, respaldoConfigurado, servicio } from './aplicacion/contenedor';
import type { Estado } from './aplicacion/servicio';
import { useSesion } from './PuertaSesion';
import './App.css';



type Seccion = 'inventario' | 'recetas' | 'costos' | 'cotizador';

const SECCIONES: readonly { id: Seccion; titulo: string; corto: string; icono: typeof Package }[] = [
  { id: 'inventario', titulo: 'Mi Inventario', corto: 'Inventario', icono: Package },
  { id: 'costos', titulo: 'Costos Fijos y Horas', corto: 'Costos', icono: Wallet },
  { id: 'recetas', titulo: 'Mis Recetas', corto: 'Recetas', icono: BookOpen },
  { id: 'cotizador', titulo: 'Cotizador', corto: 'Cotización', icono: Calculator },
];

const formatoNumero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
const formatoFecha = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function formatearCantidad(valor: number, unidad: UnidadBase): string {
  if (unidad === 'g' && valor >= 1000) return `${formatoNumero.format(valor / 1000)} kg`;
  if (unidad === 'ml' && valor >= 1000) return `${formatoNumero.format(valor / 1000)} l`;
  if (unidad === 'u') return `${formatoNumero.format(Math.ceil(valor - 1e-9))} u`;
  return `${formatoNumero.format(redondear(valor, 0))} ${unidad}`;
}

function formatearFechaCorta(fecha: FechaISO): string {
  return formatoFecha.format(new Date(`${fecha}T00:00:00Z`));
}

function textoDiasRestantes(dias: number): string {
  if (dias < -1) return `venció hace ${-dias} días`;
  if (dias === -1) return 'venció ayer';
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vence en ${dias} días`;
}

function pasoPorUnidad(unidad: UnidadBase): number {
  return unidad === 'u' ? 1 : 10;
}


function useHoy(): FechaISO {
  const [hoy, setHoy] = useState<FechaISO>(() => fechaLocalISO(new Date()));
  useEffect(() => {
    const actualizar = () => setHoy(fechaLocalISO(new Date()));
    document.addEventListener('visibilitychange', actualizar);
    const intervalo = window.setInterval(actualizar, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', actualizar);
      window.clearInterval(intervalo);
    };
  }, []);
  return hoy;
}



interface PropsSelector {
  etiqueta: string;
  valor: number;
  onCambio: (valor: number) => void;
  min: number;
  max: number;
  paso: number;
  formato?: (valor: number) => string;
  ayuda?: string;
  
  unidad?: string;
  
  decimales?: number;
}







function SelectorNumerico({ etiqueta, valor, onCambio, min, max, paso, formato, ayuda, unidad, decimales }: PropsSelector) {
  const valorRef = useRef(valor);
  const temporizador = useRef<number | null>(null);
  const repeticiones = useRef(0);

  useEffect(() => {
    valorRef.current = valor;
  }, [valor]);

  const aplicar = useCallback(
    (direccion: 1 | -1) => {
      const factor = repeticiones.current > 20 ? 10 : repeticiones.current > 8 ? 5 : 1;
      const siguiente = limitar(redondear(valorRef.current + direccion * paso * factor, 4), min, max);
      if (siguiente !== valorRef.current) {
        valorRef.current = siguiente;
        onCambio(siguiente);
      }
    },
    [paso, min, max, onCambio],
  );

  const detener = useCallback(() => {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = null;
    repeticiones.current = 0;
  }, []);

  useEffect(() => detener, [detener]);

  const iniciar = (direccion: 1 | -1) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    detener();
    aplicar(direccion);
    const tic = () => {
      repeticiones.current += 1;
      aplicar(direccion);
      temporizador.current = window.setTimeout(tic, 90);
    };
    temporizador.current = window.setTimeout(tic, 450);
  };

  const propsBoton = (direccion: 1 | -1) => ({
    type: 'button' as const,
    onPointerDown: iniciar(direccion),
    onPointerUp: detener,
    onPointerCancel: detener,
    onLostPointerCapture: detener,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),

    onClick: (e: { detail: number }) => {
      if (e.detail === 0) aplicar(direccion);
    },
  });

  const texto = formato ? formato(valor) : formatoNumero.format(valor);

  
  const dec = decimales ?? decimalesPorPaso(paso);
  const idCampo = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [error, setError] = useState<string | null>(null);

  const abrirEdicion = () => {
    detener();
    
    
    flushSync(() => {
      setBorrador(textoParaEditar(valor, dec));
      setError(null);
      setEditando(true);
    });
    campo.current?.focus();
    campo.current?.select();
  };

  const confirmar = () => {
    const r = validarEntradaNumerica(borrador, { min, max, decimales: dec });
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    valorRef.current = r.valor;
    if (r.valor !== valor) onCambio(r.valor);
    setEditando(false);
    setError(null);
  };

  const cancelar = () => {
    setEditando(false);
    setError(null);
  };

  
  const sinPerderFoco = (e: ReactPointerEvent<HTMLButtonElement>) => e.preventDefault();

  if (editando) {
    return (
      <div role="group" aria-label={etiqueta} className="flex flex-col gap-2">
        <label htmlFor={idCampo} className="text-base font-semibold text-cafe-700">
          {etiqueta}
        </label>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onPointerDown={sinPerderFoco}
            onClick={cancelar}
            aria-label={`Cancelar y dejar ${texto}`}
            className="boton-tactil flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-rosa-400 bg-rosa-100 text-cafe-900 select-none"
          >
            <X size={30} strokeWidth={3} aria-hidden />
          </button>
          <input
            ref={campo}
            id={idCampo}
            type="text"
            inputMode={dec > 0 ? 'decimal' : 'numeric'}
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={borrador}
            onChange={(e) => {
              setBorrador(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmar();
              } else if (e.key === 'Escape') {
                cancelar();
              }
            }}
            onBlur={confirmar}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${idCampo}-ayuda`}
            className={`h-16 min-w-0 flex-1 appearance-none rounded-2xl border-2 bg-crema-50 px-2 text-center text-3xl font-extrabold text-cafe-900 tabular-nums focus:outline-none ${
              error ? 'border-rojo-texto' : 'border-cafe-700'
            }`}
          />
          <button
            type="button"
            onPointerDown={sinPerderFoco}
            onClick={confirmar}
            aria-label="Guardar cantidad"
            className="boton-tactil flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-rosa-400 bg-rosa-300 text-cafe-900 select-none"
          >
            <Check size={30} strokeWidth={3} aria-hidden />
          </button>
        </div>
        <span id={`${idCampo}-ayuda`} role={error ? 'alert' : undefined} className={`text-sm ${error ? 'font-semibold text-rojo-texto' : 'text-cafe-500'}`}>
          {error ?? `Escribe la cantidad${unidad ? ` en ${unidad}` : ''} y toca ✓`}
        </span>
      </div>
    );
  }

  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-2">
      <span className="text-base font-semibold text-cafe-700">{etiqueta}</span>
      <div className="flex items-center justify-between gap-3">
        <button
          {...propsBoton(-1)}
          aria-label={`Disminuir ${etiqueta}`}
          disabled={valor <= min}
          className="boton-tactil flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-rosa-400 bg-rosa-100 text-cafe-900 select-none disabled:opacity-35"
        >
          <Minus size={30} strokeWidth={3} aria-hidden />
        </button>
        <button
          type="button"
          onClick={abrirEdicion}
          aria-label={`${etiqueta}: ${texto}. Toca para escribir la cantidad`}
          className="boton-tactil flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed border-crema-200 px-1 py-1 text-cafe-900"
        >
          <output
            aria-live="polite"
            className={`max-w-full text-center leading-tight font-extrabold break-words tabular-nums ${
              texto.length <= 4 ? 'text-3xl' : texto.length <= 7 ? 'text-2xl' : texto.length <= 8 ? 'text-xl' : 'text-[clamp(1rem,5vw,1.25rem)]'
            }`}
          >
            {texto}
          </output>
          <span className="flex items-center gap-1 text-xs font-semibold text-cafe-500">
            <Pencil size={12} aria-hidden /> Escribir
          </span>
        </button>
        <button
          {...propsBoton(1)}
          aria-label={`Aumentar ${etiqueta}`}
          disabled={valor >= max}
          className="boton-tactil flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-rosa-400 bg-rosa-300 text-cafe-900 select-none disabled:opacity-35"
        >
          <Plus size={30} strokeWidth={3} aria-hidden />
        </button>
      </div>
      {ayuda && <span className="text-sm text-cafe-500">{ayuda}</span>}
    </div>
  );
}

function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border-2 border-crema-200 bg-crema-100 p-4 ${className}`}>{children}</section>;
}

function TituloSeccion({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xl font-extrabold text-cafe-900">{children}</h2>;
}

function BotonPrincipal({
  children,
  onClick,
  icono,
  variante = 'rosa',
}: {
  children: ReactNode;
  onClick: () => void;
  icono?: ReactNode;
  variante?: 'rosa' | 'suave';
}) {
  const estilos =
    variante === 'rosa'
      ? 'bg-rosa-300 border-rosa-400 text-cafe-900'
      : 'bg-crema-50 border-crema-200 text-cafe-700';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`boton-tactil flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 px-5 text-lg font-bold select-none ${estilos}`}
    >
      {icono}
      {children}
    </button>
  );
}

const ESTILO_SEMAFORO: Readonly<Record<Semaforo, { clase: string; texto: string }>> = {
  verde: { clase: 'bg-verde-fondo text-verde-texto border-verde-texto', texto: 'Óptimo' },
  amarillo: { clase: 'bg-amarillo-fondo text-amarillo-texto border-amarillo-texto', texto: 'Usar pronto' },
  rojo: { clase: 'bg-rojo-fondo text-rojo-texto border-rojo-texto', texto: 'Vencido' },
};

function ChipSemaforo({ estado }: { estado: Semaforo }) {
  const { clase, texto } = ESTILO_SEMAFORO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold ${clase}`}>
      <span aria-hidden className="size-2.5 rounded-full bg-current" />
      {texto}
    </span>
  );
}

function FilaMonto({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-1.5 ${fuerte ? 'text-xl font-extrabold text-cafe-900' : 'text-lg text-cafe-700'}`}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{formatearBs(valor)}</span>
    </div>
  );
}


function SelectorOpciones<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
}: {
  opciones: readonly { id: T; nombre: string }[];
  valor: T;
  onCambio: (id: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-col gap-3">
      {opciones.map((o) => {
        const activo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.id)}
            className={`boton-tactil min-h-14 rounded-2xl border-2 px-4 text-left text-lg font-bold ${
              activo ? 'border-cafe-700 bg-rosa-200 text-cafe-900' : 'border-crema-200 bg-crema-100 text-cafe-700'
            }`}
          >
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}



interface Aviso {
  tipo: 'exito' | 'error';
  texto: string;
}

function AvisoFlotante({ aviso, onCerrar }: { aviso: Aviso | null; onCerrar: () => void }) {
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(onCerrar, 7000);
    return () => window.clearTimeout(t);
  }, [aviso, onCerrar]);

  if (!aviso) return null;
  const exito = aviso.tipo === 'exito';
  return (
    <div
      role={exito ? 'status' : 'alert'}
      className={`fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-start gap-3 rounded-2xl border-2 p-4 shadow-lg ${
        exito ? 'border-verde-texto bg-verde-fondo text-verde-texto' : 'border-rojo-texto bg-rojo-fondo text-rojo-texto'
      }`}
    >
      {exito ? <CheckCircle2 className="mt-1 shrink-0" size={26} aria-hidden /> : <AlertTriangle className="mt-1 shrink-0" size={26} aria-hidden />}
      <p className="flex-1 text-lg font-semibold">{aviso.texto}</p>
      <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="boton-tactil flex size-12 shrink-0 items-center justify-center rounded-full">
        <X size={26} aria-hidden />
      </button>
    </div>
  );
}



interface PropsInventario {
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  hoy: FechaISO;
  mermaAcumulada: number;
  onRegistrarCompra: (insumoId: Id, presentaciones: number, precioPorPresentacion: number, diasVence: number) => void;
  onDarDeBaja: () => void;
}

function PantallaInventario({ insumos, lotes, hoy, mermaAcumulada, onRegistrarCompra, onDarDeBaja }: PropsInventario) {
  const [abierto, setAbierto] = useState<Id | null>(null);
  const [comprando, setComprando] = useState<Id | null>(null);

  const resumenes = useMemo(
    () => insumos.map((i) => ({ insumo: i, resumen: resumenInsumo(lotes, i.id, hoy) })),
    [insumos, lotes, hoy],
  );
  const valorVencido = sumaPrecisa(resumenes.map((r) => r.resumen.valorVencido));

  return (
    <div className="flex flex-col gap-4">
      {valorVencido > 0 && (
        <Tarjeta className="border-rojo-texto bg-rojo-fondo">
          <p className="mb-3 text-lg font-bold text-rojo-texto">
            Tienes {formatearBs(valorVencido)} en insumos vencidos. Retíralos de la despensa.
          </p>
          <BotonPrincipal onClick={onDarDeBaja} icono={<Trash2 size={24} aria-hidden />} variante="suave">
            Registrar como merma
          </BotonPrincipal>
        </Tarjeta>
      )}

      {mermaAcumulada > 0 && (
        <p className="px-1 text-base text-cafe-500">Merma acumulada por vencimientos: {formatearBs(mermaAcumulada)}</p>
      )}

      {resumenes.map(({ insumo, resumen }) => {
        const expandido = abierto === insumo.id;
        const lotesInsumo = lotes
          .filter((l) => l.insumoId === insumo.id && l.cantidadDisponible > 0)
          .sort((a, b) => diasRestantes(a.fechaVencimiento, hoy) - diasRestantes(b.fechaVencimiento, hoy));

        return (
          <Tarjeta key={insumo.id}>
            <button
              type="button"
              onClick={() => setAbierto(expandido ? null : insumo.id)}
              aria-expanded={expandido}
              className="boton-tactil flex min-h-14 w-full items-center gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold text-cafe-900">{insumo.nombre}</p>
                <p className="text-lg text-cafe-700 tabular-nums">
                  {formatearCantidad(resumen.disponible, insumo.unidad)} disponibles
                </p>
                {resumen.proximoVencimiento && (
                  <p className="text-base text-cafe-500">
                    Próximo lote {textoDiasRestantes(diasRestantes(resumen.proximoVencimiento, hoy))}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {resumen.semaforo ? <ChipSemaforo estado={resumen.semaforo} /> : <span className="text-base font-bold text-cafe-500">Sin stock</span>}
                {expandido ? <ChevronUp size={28} className="text-cafe-700" aria-hidden /> : <ChevronDown size={28} className="text-cafe-700" aria-hidden />}
              </div>
            </button>

            {expandido && (
              <div className="mt-4 flex flex-col gap-3 border-t-2 border-crema-200 pt-4">
                {lotesInsumo.length === 0 && <p className="text-lg text-cafe-500">No hay lotes en la despensa.</p>}
                {lotesInsumo.map((l, indice) => {
                  const dias = diasRestantes(l.fechaVencimiento, hoy);
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-3 rounded-2xl bg-crema-50 p-3">
                      <div>
                        <p className="text-lg font-bold text-cafe-900 tabular-nums">{formatearCantidad(l.cantidadDisponible, insumo.unidad)}</p>
                        <p className="text-base text-cafe-700">
                          {formatearFechaCorta(l.fechaVencimiento)} · {textoDiasRestantes(dias)}
                        </p>
                        {indice === 0 && dias >= 0 && <p className="text-sm font-semibold text-cafe-500">Se usa primero</p>}
                      </div>
                      <ChipSemaforo estado={semaforo(l.fechaVencimiento, hoy)} />
                    </div>
                  );
                })}

                {comprando === insumo.id ? (
                  <FormularioCompra
                    insumo={insumo}
                    onCancelar={() => setComprando(null)}
                    onGuardar={(presentaciones, precio, dias) => {
                      onRegistrarCompra(insumo.id, presentaciones, precio, dias);
                      setComprando(null);
                    }}
                  />
                ) : (
                  <BotonPrincipal onClick={() => setComprando(insumo.id)} icono={<PackagePlus size={24} aria-hidden />}>
                    Registrar compra
                  </BotonPrincipal>
                )}
              </div>
            )}
          </Tarjeta>
        );
      })}
    </div>
  );
}

function FormularioCompra({
  insumo,
  onGuardar,
  onCancelar,
}: {
  insumo: Insumo;
  onGuardar: (presentaciones: number, precioPorPresentacion: number, diasVence: number) => void;
  onCancelar: () => void;
}) {
  const [presentaciones, setPresentaciones] = useState(1);
  const [precio, setPrecio] = useState(insumo.presentacion.precio);
  const [dias, setDias] = useState(30);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border-2 border-rosa-300 bg-rosa-100 p-4">
      <SelectorNumerico
        etiqueta={`Presentaciones de ${formatearCantidad(insumo.presentacion.cantidad, insumo.unidad)}`}
        valor={presentaciones}
        onCambio={setPresentaciones}
        min={1}
        max={99}
        paso={1}
        unidad="presentaciones"
      />
      <SelectorNumerico
        etiqueta="Precio pagado por presentación"
        valor={precio}
        onCambio={setPrecio}
        min={0}
        max={5000}
        paso={0.5}
        formato={formatearBs}
        unidad="Bs"
        ayuda={`Total de la compra: ${formatearBs(precio * presentaciones)}`}
      />
      <SelectorNumerico
        etiqueta="Días hasta que vence"
        valor={dias}
        onCambio={setDias}
        min={0}
        max={730}
        paso={1}
        formato={(v) => `${v} días`}
        unidad="días"
      />
      <BotonPrincipal onClick={() => onGuardar(presentaciones, precio, dias)} icono={<CheckCircle2 size={24} aria-hidden />}>
        Guardar compra
      </BotonPrincipal>
      <BotonPrincipal onClick={onCancelar} variante="suave">
        Cancelar
      </BotonPrincipal>
    </div>
  );
}



interface PropsRecetas {
  recetas: readonly Receta[];
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  config: ConfiguracionCostos;
  hoy: FechaISO;
  onActualizar: (recetaId: Id, cambio: (r: Receta) => Receta) => void;
  onProducir: (recetaId: Id, veces: number) => void;
}

function PantallaRecetas({ recetas, insumos, lotes, config, hoy, onActualizar, onProducir }: PropsRecetas) {
  const [recetaId, setRecetaId] = useState<Id>(recetas[0]?.id ?? '');
  const [veces, setVeces] = useState(1);
  const receta = recetas.find((r) => r.id === recetaId);
  const mapaInsumos = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  if (!receta) return <p className="text-lg text-cafe-700">Aún no tienes recetas.</p>;

  const costo = calcularCostoReceta(receta, mapaInsumos, config);
  const cambiar = (cambio: (r: Receta) => Receta) => onActualizar(receta.id, cambio);

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <TituloSeccion>Elige una receta</TituloSeccion>
        <SelectorOpciones etiqueta="Receta" opciones={recetas} valor={recetaId} onCambio={setRecetaId} />
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Tiempos y rendimiento</TituloSeccion>
        <div className="flex flex-col gap-6">
          <SelectorNumerico
            etiqueta="Minutos de elaboración y decorado"
            valor={receta.minutosElaboracion}
            onCambio={(v) => cambiar((r) => ({ ...r, minutosElaboracion: v }))}
            min={0}
            max={600}
            paso={5}
            formato={(v) => `${v} min`}
            unidad="minutos"
          />
          <SelectorNumerico
            etiqueta="Minutos de horneado"
            valor={receta.minutosHorneado}
            onCambio={(v) => cambiar((r) => ({ ...r, minutosHorneado: v }))}
            min={0}
            max={600}
            paso={5}
            formato={(v) => `${v} min`}
            unidad="minutos"
          />
          <SelectorNumerico
            etiqueta="Porciones que rinde"
            valor={receta.porciones}
            onCambio={(v) => cambiar((r) => ({ ...r, porciones: v }))}
            min={1}
            max={200}
            paso={1}
            unidad="porciones"
          />
        </div>
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Ingredientes</TituloSeccion>
        <div className="flex flex-col gap-6">
          {receta.ingredientes.map((ing, indice) => {
            const insumo = mapaInsumos.get(ing.insumoId);
            if (!insumo) return null;
            const estado = resumenInsumo(lotes, insumo.id, hoy).semaforo;
            return (
              <div key={`${ing.insumoId}-${indice}`} className="flex flex-col gap-2">
                {estado === 'amarillo' && (
                  <span className="self-start">
                    <ChipSemaforo estado="amarillo" />
                  </span>
                )}
                <SelectorNumerico
                  etiqueta={insumo.nombre}
                  valor={ing.cantidad}
                  onCambio={(v) =>
                    cambiar((r) => ({
                      ...r,
                      ingredientes: r.ingredientes.map((x, i) => (i === indice ? { ...x, cantidad: v } : x)),
                    }))
                  }
                  min={0}
                  max={insumo.unidad === 'u' ? 60 : 10000}
                  paso={pasoPorUnidad(insumo.unidad)}
                  formato={(v) => formatearCantidad(v, insumo.unidad)}
                  unidad={insumo.unidad === 'u' ? 'unidades' : insumo.unidad}
                  decimales={insumo.unidad === 'u' ? 0 : 1}
                />
              </div>
            );
          })}
        </div>
      </Tarjeta>

      <Tarjeta className="bg-rosa-100 border-rosa-300">
        <TituloSeccion>Costo de esta receta</TituloSeccion>
        <FilaMonto etiqueta="Materia prima" valor={costo.mpd} />
        <FilaMonto etiqueta="Mi mano de obra" valor={costo.mod} />
        <FilaMonto etiqueta="Luz, agua y gas" valor={costo.cif} />
        <div className="my-2 border-t-2 border-rosa-300" />
        <FilaMonto etiqueta="Costo total" valor={costo.total} fuerte />
        <FilaMonto etiqueta="Costo por porción" valor={costo.unitario} fuerte />
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Producir</TituloSeccion>
        <div className="flex flex-col gap-5">
          <SelectorNumerico
            etiqueta="Veces que preparo la receta"
            valor={veces}
            onCambio={setVeces}
            min={1}
            max={20}
            paso={1}
            unidad="veces"
            ayuda={`Saldrán ${receta.porciones * veces} porciones`}
          />
          <BotonPrincipal onClick={() => onProducir(receta.id, veces)} icono={<Flame size={24} aria-hidden />}>
            Producir y descontar
          </BotonPrincipal>
        </div>
      </Tarjeta>
    </div>
  );
}



function PantallaCostos({
  config,
  onCambiar,
}: {
  config: ConfiguracionCostos;
  onCambiar: (cambio: (c: ConfiguracionCostos) => ConfiguracionCostos) => void;
}) {
  const tasaMOD = tasaMinutoMOD(config);
  const tasaCIF = tasaMinutoCIF(config);
  const horasSemana = redondear(config.horasTrabajoMes / (52 / 12), 1);
  const servicio = (clave: keyof ConfiguracionCostos['servicios']) => (v: number) =>
    onCambiar((c) => ({ ...c, servicios: { ...c.servicios, [clave]: v } }));

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <TituloSeccion>Mi mano de obra</TituloSeccion>
        <p className="mb-4 text-lg text-cafe-700">
          Sueldo de referencia: <strong className="text-cafe-900">{formatearBs(config.sueldoMensual)}</strong> al mes
          (salario mínimo nacional).
        </p>
        <SelectorNumerico
          etiqueta="Horas que trabajo al mes en repostería"
          valor={config.horasTrabajoMes}
          onCambio={(v) => onCambiar((c) => ({ ...c, horasTrabajoMes: v }))}
          min={1}
          max={Math.min(300, HORAS_MES_MAXIMO)}
          paso={1}
          formato={(v) => `${v} h`}
          unidad="horas"
          ayuda={`Aproximadamente ${formatoNumero.format(horasSemana)} horas por semana`}
        />
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-rosa-100 p-4">
          <Clock size={30} className="shrink-0 text-cafe-700" aria-hidden />
          <p className="text-lg text-cafe-900">
            Cada minuto de tu trabajo vale <strong>{formatearBs(tasaMOD)}</strong>
          </p>
        </div>
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Servicios del mes</TituloSeccion>
        <div className="flex flex-col gap-6">
          <SelectorNumerico etiqueta="Luz" valor={config.servicios.luz} onCambio={servicio('luz')} min={0} max={3000} paso={5} formato={formatearBs} unidad="Bs" decimales={2} />
          <SelectorNumerico etiqueta="Agua" valor={config.servicios.agua} onCambio={servicio('agua')} min={0} max={3000} paso={5} formato={formatearBs} unidad="Bs" decimales={2} />
          <SelectorNumerico etiqueta="Gas (garrafas o red)" valor={config.servicios.gas} onCambio={servicio('gas')} min={0} max={3000} paso={5} formato={formatearBs} unidad="Bs" decimales={2} />
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-rosa-100 p-4">
          <Flame size={30} className="shrink-0 text-cafe-700" aria-hidden />
          <p className="text-lg text-cafe-900">
            Cada minuto en la cocina consume <strong>{formatearBs(tasaCIF)}</strong> en servicios
          </p>
        </div>
      </Tarjeta>
    </div>
  );
}



function PantallaCotizador({
  recetas,
  insumos,
  config,
}: {
  recetas: readonly Receta[];
  insumos: readonly Insumo[];
  config: ConfiguracionCostos;
}) {
  const [recetaId, setRecetaId] = useState<Id>(recetas[0]?.id ?? '');
  const [porciones, setPorciones] = useState<number>(recetas[0]?.porciones ?? 1);
  const [margen, setMargen] = useState(30);
  const mapaInsumos = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const receta = recetas.find((r) => r.id === recetaId);

  if (!receta) return <p className="text-lg text-cafe-700">Aún no tienes recetas para cotizar.</p>;

  const q = cotizar(receta, mapaInsumos, config, porciones, margen / 100);

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <TituloSeccion>¿Qué te pidieron?</TituloSeccion>
        <SelectorOpciones
          etiqueta="Producto"
          opciones={recetas}
          valor={recetaId}
          onCambio={(id) => {
            setRecetaId(id);
            const elegida = recetas.find((r) => r.id === id);
            if (elegida) setPorciones(elegida.porciones);
          }}
        />
      </Tarjeta>

      <Tarjeta>
        <div className="flex flex-col gap-6">
          <SelectorNumerico etiqueta="Porciones" valor={porciones} onCambio={setPorciones} min={1} max={500} paso={1} unidad="porciones" />
          <SelectorNumerico
            etiqueta="Mi ganancia sobre el precio"
            valor={margen}
            onCambio={setMargen}
            min={0}
            max={90}
            paso={5}
            formato={(v) => `${v} %`}
            unidad="%"
          />
        </div>
      </Tarjeta>

      <Tarjeta className="border-cafe-700 bg-rosa-200">
        <p className="text-lg font-semibold text-cafe-700">Precio para tu cliente</p>
        <p className="text-5xl font-black text-cafe-900 tabular-nums">{formatearBs(q.precioTotal)}</p>
        <p className="mt-1 text-lg text-cafe-700">{formatearBs(q.precioUnitarioComercial)} por porción</p>
        <div className="my-3 border-t-2 border-rosa-400" />
        <FilaMonto etiqueta="Mi costo" valor={q.costoTotal} />
        <FilaMonto etiqueta="Mi ganancia" valor={q.gananciaTotal} fuerte />
        <p className="mt-2 text-sm text-cafe-500">Precio redondeado hacia arriba a Bs 0,50. El cliente no ve tus costos.</p>
      </Tarjeta>
    </div>
  );
}



function BarraInferior({ actual, onIr }: { actual: Seccion; onIr: (s: Seccion) => void }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-crema-200 bg-crema-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-3 px-1 py-2">
        {SECCIONES.map(({ id, corto, icono: Icono }) => {
          const activo = id === actual;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={() => onIr(id)}
                aria-current={activo ? 'page' : undefined}
                className={`boton-tactil flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 px-0 text-[clamp(0.75rem,3.75vw,0.875rem)] font-bold ${
                  activo ? 'border-cafe-700 bg-rosa-200 text-cafe-900' : 'border-transparent text-cafe-700'
                }`}
              >
                <Icono size={28} strokeWidth={activo ? 2.5 : 2} aria-hidden />
                <span className="max-w-full truncate leading-none">{corto}</span>
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
      className={`boton-tactil flex h-14 min-w-14 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 px-3 font-bold ${
        armado ? 'border-rojo-texto bg-rojo-fondo text-rojo-texto' : 'border-crema-200 bg-crema-100 text-cafe-700'
      }`}
    >
      <LogOut size={24} aria-hidden />
      {armado && <span>¿Salir?</span>}
    </button>
  );
}

export default function App() {
  const hoy = useHoy();
  const { usuaria, cerrarSesion } = useSesion();
  const uid = usuaria?.uid ?? null;
  const [seccion, setSeccion] = useState<Seccion>('inventario');
  const [estado, setEstado] = useState<Estado | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const cerrarAviso = useCallback(() => setAviso(null), []);
  const mostrarError = useCallback(
    (e: unknown, porDefecto: string) => setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : porDefecto }),
    [],
  );


  const refrescar = useCallback(async () => {
    setEstado(await servicio.estado());
    setPendientes(await repositorio.contarPendientes());
    const motor = await motorRespaldo(uid);
    if (motor && navigator.onLine) {
      try {
        await motor.sincronizar();
        setEstado(await servicio.estado());
        setPendientes(await repositorio.contarPendientes());
      } catch {

      }
    }
  }, [uid]);


  useEffect(() => {
    (async () => {
      if (await servicio.estaVacio()) await servicio.sembrar(crearSemilla(fechaLocalISO(new Date())));
      await refrescar();
    })().catch((e) => mostrarError(e, 'No se pudo abrir la base de datos del teléfono.'));
    const alVolverLaRed = () => void refrescar();
    window.addEventListener('online', alVolverLaRed);
    return () => window.removeEventListener('online', alVolverLaRed);
  }, [refrescar, mostrarError]);

  const mapaInsumos = useMemo(() => new Map((estado?.insumos ?? []).map((i) => [i.id, i])), [estado]);








  const irA = (s: Seccion) => {
    setSeccion(s);
    window.scrollTo({ top: 0 });
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

  const cambiarConfig = async (cambio: (c: ConfiguracionCostos) => ConfiguracionCostos) => {
    if (!estado) return;
    const nueva = cambio(estado.config);
    setEstado((e) => (e ? { ...e, config: nueva } : e));
    try {
      await servicio.guardarConfiguracion(nueva);
      setPendientes(await repositorio.contarPendientes());
    } catch (e) {
      mostrarError(e, 'No se pudo guardar la configuración.');
      await refrescar();
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
  const { insumos, lotes, recetas, config } = estado;
  const mermaAcumulada = estado.proyeccion.valorMerma;

  const actual = SECCIONES.find((s) => s.id === seccion) ?? SECCIONES[0]!;

  return (
    <div className="min-h-dvh bg-crema-50 text-cafe-900">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-crema-200 bg-crema-50/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-cafe-500 uppercase">
            <Cake size={16} aria-hidden /> GustoDulce
          </p>
          <h1 className="truncate text-2xl font-black text-cafe-900">{actual.titulo}</h1>
        </div>
        <span
          role="status"
          aria-label={
            respaldoConfigurado && pendientes > 0
              ? `Guardado en el teléfono. ${pendientes} cambios esperan respaldo en la nube.`
              : 'Todo guardado en el teléfono'
          }
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full border-2 border-crema-200 bg-crema-100 px-2.5 py-1.5 text-sm font-bold text-cafe-700"
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
        {seccion === 'inventario' && (
          <PantallaInventario
            insumos={insumos}
            lotes={lotes}
            hoy={hoy}
            mermaAcumulada={mermaAcumulada}
            onRegistrarCompra={registrar}
            onDarDeBaja={darDeBaja}
          />
        )}
        {seccion === 'recetas' && (
          <PantallaRecetas
            recetas={recetas}
            insumos={insumos}
            lotes={lotes}
            config={config}
            hoy={hoy}
            onActualizar={actualizarReceta}
            onProducir={producirReceta}
          />
        )}
        {seccion === 'costos' && <PantallaCostos config={config} onCambiar={cambiarConfig} />}
        {seccion === 'cotizador' && <PantallaCotizador recetas={recetas} insumos={insumos} config={config} />}
      </main>

      <BarraInferior actual={seccion} onIr={irA} />
      <AvisoFlotante aviso={aviso} onCerrar={cerrarAviso} />
    </div>
  );
}
