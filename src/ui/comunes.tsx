import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { InputHTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, Minus, Pencil, Plus, Search, X } from 'lucide-react';
import {
  decimalesPorPaso,
  fechaLocalISO,
  formatearBs,
  limitar,
  redondear,
  textoParaEditar,
  validarEntradaNumerica,
} from '../domain';
import type { FechaISO, Id, Receta, Semaforo, UnidadBase } from '../domain';

export const formatoNumero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
export const formatoFecha = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatearCantidad(valor: number, unidad: UnidadBase): string {
  if (unidad === 'g' && valor >= 1000) return `${formatoNumero.format(valor / 1000)} kg`;
  if (unidad === 'ml' && valor >= 1000) return `${formatoNumero.format(valor / 1000)} l`;
  if (unidad === 'u') return `${formatoNumero.format(Math.ceil(valor - 1e-9))} u`;
  return `${formatoNumero.format(redondear(valor, 0))} ${unidad}`;
}

export function formatearFechaCorta(fecha: FechaISO): string {
  return formatoFecha.format(new Date(`${fecha}T00:00:00Z`));
}

export function textoDiasRestantes(dias: number): string {
  if (dias < -1) return `venció hace ${-dias} días`;
  if (dias === -1) return 'venció ayer';
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vence en ${dias} días`;
}

export function pasoPorUnidad(unidad: UnidadBase): number {
  return unidad === 'u' ? 1 : 10;
}


export function useHoy(): FechaISO {
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



export interface PropsSelector {
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







export function SelectorNumerico({ etiqueta, valor, onCambio, min, max, paso, formato, ayuda, unidad, decimales }: PropsSelector) {
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
            className={`max-w-full text-center leading-tight font-extrabold wrap-break-word tabular-nums ${
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

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border-2 border-crema-200 bg-crema-100 p-4 ${className}`}>{children}</section>;
}

export function TituloSeccion({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xl font-extrabold text-cafe-900">{children}</h2>;
}

export function BotonPrincipal({
  children,
  onClick,
  icono,
  variante = 'rosa',
  deshabilitado = false,
}: {
  children: ReactNode;
  onClick: () => void;
  icono?: ReactNode;
  variante?: 'rosa' | 'suave' | 'peligro';
  deshabilitado?: boolean;
}) {
  const estilos =
    variante === 'rosa'
      ? 'bg-rosa-300 border-rosa-400 text-cafe-900'
      : variante === 'peligro'
        ? 'bg-rojo-fondo border-rojo-texto text-rojo-texto'
        : 'bg-crema-50 border-crema-200 text-cafe-700';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`boton-tactil flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 px-5 text-center text-lg font-bold select-none disabled:opacity-45 ${estilos}`}
    >
      {icono}
      {children}
    </button>
  );
}

export const ESTILO_SEMAFORO: Readonly<Record<Semaforo, { clase: string; texto: string }>> = {
  verde: { clase: 'bg-verde-fondo text-verde-texto border-verde-texto', texto: 'Óptimo' },
  amarillo: { clase: 'bg-amarillo-fondo text-amarillo-texto border-amarillo-texto', texto: 'Usar pronto' },
  rojo: { clase: 'bg-rojo-fondo text-rojo-texto border-rojo-texto', texto: 'Vencido' },
};

export function ChipSemaforo({ estado }: { estado: Semaforo }) {
  const { clase, texto } = ESTILO_SEMAFORO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold ${clase}`}>
      <span aria-hidden className="size-2.5 rounded-full bg-current" />
      {texto}
    </span>
  );
}

export function FilaMonto({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? 'text-xl font-extrabold text-cafe-900' : 'text-lg text-cafe-700'}`}>
      <span className="min-w-0">{etiqueta}</span>
      <span className="shrink-0 tabular-nums">{formatearBs(valor)}</span>
    </div>
  );
}


export function SelectorOpciones<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  horizontal = false,
}: {
  opciones: readonly { id: T; nombre: string }[];
  valor: T;
  onCambio: (id: T) => void;
  etiqueta: string;
  horizontal?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={horizontal ? 'grid grid-cols-3 gap-3' : 'flex flex-col gap-3'}>
      {opciones.map((o) => {
        const activo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.id)}
            className={`boton-tactil min-h-14 rounded-2xl border-2 font-bold ${horizontal ? 'px-1 text-center text-[clamp(0.8rem,3.9vw,1.05rem)] leading-tight' : 'px-4 text-left text-lg'} ${
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



export interface Aviso {
  tipo: 'exito' | 'error';
  texto: string;
}

export function AvisoFlotante({ aviso, onCerrar }: { aviso: Aviso | null; onCerrar: () => void }) {
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


interface PropsCampoTexto extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id' | 'onChange' | 'value'> {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  error?: string | undefined;
  ayuda?: string;
}

export function CampoTexto({ etiqueta, valor, onCambio, error, ayuda, ...resto }: PropsCampoTexto) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold text-cafe-700">
        {etiqueta}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? `${id}-ayuda` : undefined}
        className={`h-14 w-full appearance-none rounded-2xl border-2 bg-crema-50 px-4 text-lg text-cafe-900 placeholder:text-cafe-500 focus:border-cafe-700 focus:outline-none ${
          error ? 'border-rojo-texto' : 'border-crema-200'
        }`}
        {...resto}
      />
      {(error || ayuda) && (
        <p id={`${id}-ayuda`} className={`text-sm ${error ? 'font-semibold text-rojo-texto' : 'text-cafe-500'}`}>
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}

export function CampoBusqueda({ valor, onCambio, etiqueta }: { valor: string; onCambio: (v: string) => void; etiqueta: string }) {
  return (
    <div className="relative">
      <Search size={22} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-cafe-500" aria-hidden />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={etiqueta}
        aria-label={etiqueta}
        className="h-14 w-full appearance-none rounded-2xl border-2 border-crema-200 bg-crema-50 pr-4 pl-12 text-lg text-cafe-900 placeholder:text-cafe-500 focus:border-cafe-700 focus:outline-none"
      />
    </div>
  );
}

export const normalizarBusqueda = (texto: string) =>
  texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function SelectorReceta({
  destacadas,
  otras,
  valor,
  onCambio,
  etiqueta,
}: {
  destacadas: readonly Receta[];
  otras: readonly Receta[];
  valor: Id;
  onCambio: (id: Id) => void;
  etiqueta: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const elegidaEnOtras = otras.find((r) => r.id === valor);
  const visibles = filtro ? otras.filter((r) => normalizarBusqueda(r.nombre).includes(normalizarBusqueda(filtro))) : otras;

  const boton = (r: Receta, grande: boolean) => {
    const activo = r.id === valor;
    return (
      <button
        key={r.id}
        type="button"
        role="radio"
        aria-checked={activo}
        onClick={() => {
          onCambio(r.id);
          if (!grande) setAbierto(false);
        }}
        className={`boton-tactil min-h-14 rounded-2xl border-2 px-4 py-2 text-left font-bold ${grande ? 'text-lg' : 'text-base'} ${
          activo ? 'border-cafe-700 bg-rosa-200 text-cafe-900' : 'border-crema-200 bg-crema-50 text-cafe-700'
        }`}
      >
        {r.nombre}
      </button>
    );
  };

  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-col gap-3">
      {destacadas.length > 0 && <p className="text-sm font-semibold text-cafe-500">Las que más usas</p>}
      {destacadas.map((r) => boton(r, true))}
      {otras.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setAbierto((a) => !a)}
            aria-expanded={abierto}
            className={`boton-tactil flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 text-left text-lg font-bold ${
              elegidaEnOtras ? 'border-cafe-700 bg-rosa-200 text-cafe-900' : 'border-dashed border-cafe-500 bg-crema-100 text-cafe-700'
            }`}
          >
            <span className="min-w-0 flex-1">
              {elegidaEnOtras ? elegidaEnOtras.nombre : `Otras recetas (${otras.length})`}
              {elegidaEnOtras && <span className="block text-sm font-semibold text-cafe-500">Toca para elegir otra</span>}
            </span>
            {abierto ? <ChevronUp size={26} aria-hidden /> : <ChevronDown size={26} aria-hidden />}
          </button>
          {abierto && (
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-crema-200 bg-crema-100 p-3">
              {otras.length > 6 && <CampoBusqueda valor={filtro} onCambio={setFiltro} etiqueta="Buscar receta" />}
              {visibles.map((r) => boton(r, false))}
              {visibles.length === 0 && <p className="p-2 text-base text-cafe-500">No hay recetas con ese nombre.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PieAviso({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-cafe-500">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
