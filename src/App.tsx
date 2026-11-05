import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Cake,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Menu,
  Minus,
  Package,
  PackagePlus,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  calcularCostoReceta,
  cotizar,
  darDeBajaVencidos,
  diasRestantes,
  fechaLocalISO,
  formatearBs,
  HORAS_MES_MAXIMO,
  limitar,
  producir,
  redondear,
  registrarCompra,
  resumenInsumo,
  semaforo,
  sumaPrecisa,
  sumarDias,
  tasaMinutoCIF,
  tasaMinutoMOD,
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
import { CONFIGURACION_DEMO, crearLotesDemo, INSUMOS_DEMO, RECETAS_DEMO } from './data/demo';
import './App.css';

type Seccion = 'inventario' | 'recetas' | 'costos' | 'cotizador';

const SECCIONES: readonly { id: Seccion; titulo: string; icono: typeof Package }[] = [
  { id: 'inventario', titulo: 'Mi Inventario', icono: Package },
  { id: 'recetas', titulo: 'Mis Recetas', icono: BookOpen },
  { id: 'costos', titulo: 'Costos Fijos y Horas', icono: Wallet },
  { id: 'cotizador', titulo: 'Cotizador', icono: Calculator },
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

function nuevoId(prefijo: string): Id {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefijo}-${aleatorio}`;
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
}

/**
 * Selector Numérico Incremental "Sucia-Friendly".
 * - Botones circulares de 64×64 px separados 12 px (≥ 48 dp exigidos).
 * - Mantener presionado repite y acelera (útil para 120 horas o 45 días).
 * - Sin teclado del sistema. Accesible por teclado vía Enter/Espacio.
 */
function SelectorNumerico({ etiqueta, valor, onCambio, min, max, paso, formato, ayuda }: PropsSelector) {
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
        <output aria-live="polite" className="min-w-0 flex-1 text-center text-3xl font-extrabold text-cafe-900 tabular-nums">
          {texto}
        </output>
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
      className={`fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-lg items-start gap-3 rounded-2xl border-2 p-4 shadow-lg ${
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
        <p className="px-1 text-base text-cafe-500">Merma registrada en esta sesión: {formatearBs(mermaAcumulada)}</p>
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
      />
      <SelectorNumerico
        etiqueta="Precio pagado por presentación"
        valor={precio}
        onCambio={setPrecio}
        min={0}
        max={5000}
        paso={0.5}
        formato={formatearBs}
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
          />
          <SelectorNumerico
            etiqueta="Minutos de horneado"
            valor={receta.minutosHorneado}
            onCambio={(v) => cambiar((r) => ({ ...r, minutosHorneado: v }))}
            min={0}
            max={600}
            paso={5}
            formato={(v) => `${v} min`}
          />
          <SelectorNumerico
            etiqueta="Porciones que rinde"
            valor={receta.porciones}
            onCambio={(v) => cambiar((r) => ({ ...r, porciones: v }))}
            min={1}
            max={200}
            paso={1}
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
          <SelectorNumerico etiqueta="Luz" valor={config.servicios.luz} onCambio={servicio('luz')} min={0} max={3000} paso={5} formato={formatearBs} />
          <SelectorNumerico etiqueta="Agua" valor={config.servicios.agua} onCambio={servicio('agua')} min={0} max={3000} paso={5} formato={formatearBs} />
          <SelectorNumerico etiqueta="Gas (garrafas o red)" valor={config.servicios.gas} onCambio={servicio('gas')} min={0} max={3000} paso={5} formato={formatearBs} />
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
          <SelectorNumerico etiqueta="Porciones" valor={porciones} onCambio={setPorciones} min={1} max={500} paso={1} />
          <SelectorNumerico
            etiqueta="Mi ganancia sobre el precio"
            valor={margen}
            onCambio={setMargen}
            min={0}
            max={90}
            paso={5}
            formato={(v) => `${v} %`}
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

export default function App() {
  const hoy = useHoy();
  const [seccion, setSeccion] = useState<Seccion>('inventario');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [insumos, setInsumos] = useState<readonly Insumo[]>(INSUMOS_DEMO);
  const [lotes, setLotes] = useState<readonly Lote[]>(() => crearLotesDemo(fechaLocalISO(new Date())));
  const [recetas, setRecetas] = useState<readonly Receta[]>(RECETAS_DEMO);
  const [config, setConfig] = useState<ConfiguracionCostos>(CONFIGURACION_DEMO);
  const [mermaAcumulada, setMermaAcumulada] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const cerrarAviso = useCallback(() => setAviso(null), []);
  const mapaInsumos = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  useEffect(() => {
    if (!menuAbierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [menuAbierto]);

  const irA = (s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    window.scrollTo({ top: 0 });
  };

  const registrar = (insumoId: Id, presentaciones: number, precioPorPresentacion: number, diasVence: number) => {
    const insumo = mapaInsumos.get(insumoId);
    if (!insumo) return;
    try {
      const lote = registrarCompra(insumo, {
        id: nuevoId(`L-${insumoId}`),
        presentaciones,
        precioPagado: precioPorPresentacion * presentaciones,
        fechaIngreso: hoy,
        fechaVencimiento: sumarDias(hoy, diasVence),
      });
      setLotes((ls) => [...ls, lote]);
      setInsumos((is) =>
        is.map((i) => (i.id === insumoId ? { ...i, presentacion: { ...i.presentacion, precio: precioPorPresentacion } } : i)),
      );
      setAviso({ tipo: 'exito', texto: `Compra de ${insumo.nombre} guardada. Tus recetas ya usan el nuevo precio.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la compra.' });
    }
  };

  const darDeBaja = () => {
    const resultado = darDeBajaVencidos(lotes, hoy);
    if (resultado.mermas.length === 0) return;
    setLotes(resultado.lotes);
    setMermaAcumulada((m) => m + resultado.valorTotal);
    setAviso({ tipo: 'exito', texto: `Merma registrada: ${formatearBs(resultado.valorTotal)}.` });
  };

  const actualizarReceta = (recetaId: Id, cambio: (r: Receta) => Receta) =>
    setRecetas((rs) => rs.map((r) => (r.id === recetaId ? cambio(r) : r)));

  const producirReceta = (recetaId: Id, veces: number) => {
    const receta = recetas.find((r) => r.id === recetaId);
    if (!receta) return;
    const resultado = producir({ lotes, receta, insumos: mapaInsumos, veces, hoy });
    if (resultado.ok) {
      setLotes(resultado.valor.lotes);
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

  const actual = SECCIONES.find((s) => s.id === seccion) ?? SECCIONES[0]!;

  return (
    <div className="min-h-dvh bg-crema-50 text-cafe-900">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-crema-200 bg-crema-50/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
          aria-controls="menu-principal"
          className="boton-tactil flex size-14 items-center justify-center rounded-2xl border-2 border-rosa-400 bg-rosa-200 text-cafe-900"
        >
          <Menu size={30} strokeWidth={2.5} aria-hidden />
        </button>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-cafe-500 uppercase">
            <Cake size={16} aria-hidden /> GustoDulce
          </p>
          <h1 className="truncate text-2xl font-black text-cafe-900">{actual.titulo}</h1>
        </div>
      </header>

      {menuAbierto && (
        <div className="fixed inset-0 z-30 flex">
          <nav id="menu-principal" aria-label="Menú principal" className="flex w-[82%] max-w-sm flex-col gap-3 bg-crema-100 p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-2xl font-black text-cafe-900">
                <Cake size={28} aria-hidden /> GustoDulce
              </span>
              <button
                type="button"
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar menú"
                className="boton-tactil flex size-14 items-center justify-center rounded-2xl text-cafe-900"
              >
                <X size={30} aria-hidden />
              </button>
            </div>
            {SECCIONES.map(({ id, titulo, icono: Icono }) => {
              const activo = id === seccion;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => irA(id)}
                  aria-current={activo ? 'page' : undefined}
                  className={`boton-tactil flex min-h-16 items-center gap-4 rounded-2xl border-2 px-4 text-left text-lg font-bold ${
                    activo ? 'border-cafe-700 bg-rosa-200 text-cafe-900' : 'border-transparent bg-crema-50 text-cafe-700'
                  }`}
                >
                  <Icono size={28} aria-hidden />
                  {titulo}
                </button>
              );
            })}
          </nav>
          <button type="button" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} className="flex-1 bg-cafe-900/40" />
        </div>
      )}

      <main className="mx-auto max-w-lg px-4 pt-4 pb-32">
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
        {seccion === 'costos' && <PantallaCostos config={config} onCambiar={setConfig} />}
        {seccion === 'cotizador' && <PantallaCotizador recetas={recetas} insumos={insumos} config={config} />}
      </main>

      <AvisoFlotante aviso={aviso} onCerrar={cerrarAviso} />
    </div>
  );
}
