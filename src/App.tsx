/**
 * App.tsx — Capa de presentación de GustoDulce.
 *
 * Reglas de esta capa:
 *  - NO calcula costos ni mueve stock: todo pasa por `./domain` (motor determinista).
 *  - UI "Sucia-Friendly": cero inputs de texto para cantidades; solo selectores
 *    numéricos con botones circulares de 64 px (≥ 48 dp) separados 12 dp, con
 *    pulsación sostenida para avanzar rápido sin repetir toques.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanelPruebaFEFO } from './dev/PanelPruebaFEFO';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Droplets,
  Flame,
  Lightbulb,
  Menu,
  Minus,
  Package,
  PackagePlus,
  Plus,
  Receipt,
  Share2,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import './App.css';
import {
  CONFIG_LABORAL_POR_DEFECTO,
  acotar,
  costoPorUnidadBase,
  cotizar,
  crearLote,
  darDeBajaVencidos,
  diasRestantes,
  disponibleUtilizable,
  estrategiaFEFO,
  fechaLocalDe,
  minutosLaborablesMes,
  necesidadesReceta,
  producir,
  redondear,
  resumirInsumo,
  semaforoCaducidad,
  sumarDias,
  tasaMinutoCIF,
  tasaMinutoMOD,
  tasaMinutoServicio,
  type FechaISO,
  type Insumo,
  type Lote,
  type Receta,
  type Semaforo,
  type ServicioFijo,
  type TipoServicio,
  type UnidadBase,
} from './domain';
import { INSUMOS_DEMO, RECETAS_DEMO, SERVICIOS_DEMO, crearLotesDemo } from './data/demo';

// ═══════════════════════════ Formato (solo presentación) ═══════════════════════════

const fmtNum = (v: number, dec = 2) =>
  v.toLocaleString('es-BO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtBs = (v: number) => `Bs. ${fmtNum(v, 2)}`;

function fmtCantidad(v: number, unidad: UnidadBase): string {
  if (unidad === 'unidad') return `${fmtNum(v, Number.isInteger(v) ? 0 : 1)} u.`;
  if (v >= 1000) return `${fmtNum(v / 1000, 2)} ${unidad === 'g' ? 'kg' : 'l'}`;
  return `${fmtNum(v, Number.isInteger(v) ? 0 : 1)} ${unidad}`;
}

function fmtFecha(f: FechaISO): string {
  const [a, m, d] = f.split('-');
  return `${d}/${m}/${a}`;
}

// ═══════════════════════════ Componentes base ═══════════════════════════

type Vista = 'inventario' | 'recetas' | 'servicios' | 'cotizador';

const VISTAS: readonly { id: Vista; titulo: string; icono: LucideIcon }[] = [
  { id: 'inventario', titulo: 'Mi Inventario', icono: Package },
  { id: 'recetas', titulo: 'Mis Recetas', icono: BookOpen },
  { id: 'servicios', titulo: 'Costos Fijos (Servicios)', icono: Receipt },
  { id: 'cotizador', titulo: 'Cotizador', icono: Calculator },
];

const ESTILO_SEMAFORO: Record<Semaforo, { clase: string; texto: string }> = {
  verde: { clase: 'bg-emerald-200 text-emerald-950 border-emerald-400', texto: 'Óptimo' },
  amarillo: { clase: 'bg-amber-200 text-amber-950 border-amber-500', texto: 'Usar pronto' },
  rojo: { clase: 'bg-red-300 text-red-950 border-red-500', texto: 'Vencido' },
};

function InsigniaSemaforo({ estado, detalle }: { estado: Semaforo; detalle?: string }) {
  const e = ESTILO_SEMAFORO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold ${e.clase}`}>
      <span className="size-2.5 rounded-full bg-current" aria-hidden />
      {detalle ?? e.texto}
    </span>
  );
}

function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border-2 border-amber-200 bg-amber-50 p-4 ${className}`}>{children}</section>;
}

function BotonPrimario({
  children,
  onClick,
  icono: Icono,
  deshabilitado = false,
  variante = 'rosa',
}: {
  children: ReactNode;
  onClick: () => void;
  icono?: LucideIcon;
  deshabilitado?: boolean;
  variante?: 'rosa' | 'suave';
}) {
  const colores =
    variante === 'rosa'
      ? 'bg-rose-300 text-amber-950 border-rose-400 active:bg-rose-400'
      : 'bg-rose-100 text-amber-900 border-rose-200 active:bg-rose-200';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`btn-tactil flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 px-5 text-lg font-extrabold disabled:opacity-40 ${colores}`}
    >
      {Icono && <Icono className="size-7 shrink-0" strokeWidth={2.5} />}
      {children}
    </button>
  );
}

/** Botón de opción grande (chips de selección: insumo, receta…). */
function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`btn-tactil min-h-14 rounded-2xl border-2 px-4 py-2 text-left text-base font-bold ${
        activa ? 'border-rose-500 bg-rose-300 text-amber-950' : 'border-amber-200 bg-stone-100 text-stone-800 active:bg-rose-100'
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────── Selector Numérico Incremental (único mecanismo de entrada numérica) ───────────────

interface PropsSelector {
  etiqueta: string;
  valor: number;
  onCambio: (v: number) => void;
  min?: number;
  max?: number;
  paso?: number;
  decimales?: number;
  formato?: (v: number) => string;
  icono?: LucideIcon;
  ayuda?: string;
}

function SelectorNumerico({
  etiqueta,
  valor,
  onCambio,
  min = 0,
  max = 100_000,
  paso = 1,
  decimales = 0,
  formato = (v) => fmtNum(v, decimales),
  icono: Icono,
  ayuda,
}: PropsSelector) {
  // Refs para que la repetición por pulsación sostenida lea siempre el valor vigente.
  const valorRef = useRef(valor);
  const onCambioRef = useRef(onCambio);
  useEffect(() => {
    valorRef.current = valor;
    onCambioRef.current = onCambio;
  });
  const timers = useRef<{ espera?: ReturnType<typeof setTimeout>; repite?: ReturnType<typeof setInterval> }>({});

  const detener = useCallback(() => {
    clearTimeout(timers.current.espera);
    clearInterval(timers.current.repite);
    timers.current = {};
  }, []);
  useEffect(() => detener, [detener]);

  const avanzar = useCallback(
    (dir: 1 | -1) => {
      const siguiente = redondear(acotar(valorRef.current + dir * paso, min, max), decimales);
      if (siguiente === valorRef.current) return detener();
      valorRef.current = siguiente;
      onCambioRef.current(siguiente);
      navigator.vibrate?.(8);
    },
    [paso, min, max, decimales, detener],
  );

  const iniciar = (dir: 1 | -1) => {
    detener();
    avanzar(dir);
    timers.current.espera = setTimeout(() => {
      timers.current.repite = setInterval(() => avanzar(dir), 90);
    }, 450);
  };

  const boton = (dir: 1 | -1) => {
    const Ico = dir === 1 ? Plus : Minus;
    const enLimite = dir === 1 ? valor >= max : valor <= min;
    return (
      <button
        type="button"
        aria-label={`${dir === 1 ? 'Aumentar' : 'Disminuir'} ${etiqueta}`}
        disabled={enLimite}
        onPointerDown={(e) => {
          e.preventDefault();
          iniciar(dir);
        }}
        onPointerUp={detener}
        onPointerLeave={detener}
        onPointerCancel={detener}
        onContextMenu={(e) => e.preventDefault()}
        // Teclado / lector de pantalla: click sin puntero (detail === 0).
        onClick={(e) => e.detail === 0 && avanzar(dir)}
        className="btn-tactil grid size-16 shrink-0 select-none place-items-center rounded-full border-2 border-rose-400 bg-rose-300 text-amber-950 shadow-sm active:bg-rose-400 disabled:opacity-30"
      >
        <Ico className="size-8" strokeWidth={3} />
      </button>
    );
  };

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-stone-100 p-3">
      <div className="mb-2 flex items-center gap-2 text-base font-bold text-amber-900">
        {Icono && <Icono className="size-5" />}
        {etiqueta}
      </div>
      <div className="flex items-center gap-3">
        {boton(-1)}
        <output aria-live="polite" className="min-w-0 flex-1 text-center text-3xl font-black tabular-nums text-stone-800">
          {formato(valor)}
        </output>
        {boton(1)}
      </div>
      {ayuda && <p className="mt-2 text-center text-sm text-stone-600">{ayuda}</p>}
    </div>
  );
}

// ═══════════════════════════ Vista: Mi Inventario ═══════════════════════════

function VistaInventario({
  insumos,
  lotes,
  hoy,
  onAgregarLote,
  onDarDeBaja,
}: {
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  hoy: FechaISO;
  onAgregarLote: (l: Lote) => void;
  onDarDeBaja: () => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(false);
  const [insumoId, setInsumoId] = useState(insumos[0]?.id ?? '');
  const [cantidad, setCantidad] = useState(1000);
  const [precio, setPrecio] = useState(10);
  const [diasVence, setDiasVence] = useState(30);

  const insumoSel = insumos.find((i) => i.id === insumoId);
  const unidad = insumoSel?.unidad ?? 'g';
  const pasoCantidad = unidad === 'unidad' ? 1 : 50;

  const alertas = useMemo(() => {
    let rojos = 0;
    let amarillos = 0;
    let costoVencido = 0;
    for (const l of lotes) {
      if (l.cantidadDisponible <= 0) continue;
      const s = semaforoCaducidad(l.fechaVencimiento, hoy);
      if (s === 'rojo') {
        rojos++;
        costoVencido += l.cantidadDisponible * l.costoUnitario;
      } else if (s === 'amarillo') amarillos++;
    }
    return { rojos, amarillos, costoVencido };
  }, [lotes, hoy]);

  const guardarLote = () => {
    if (!insumoSel) return;
    onAgregarLote(
      crearLote({
        id: `L-${insumoSel.id}-${Date.now().toString(36)}`,
        insumoId: insumoSel.id,
        cantidad,
        costoUnitario: costoPorUnidadBase(precio, cantidad),
        fechaIngreso: hoy,
        fechaVencimiento: sumarDias(hoy, diasVence),
      }),
    );
    setFormulario(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Tarjeta className="!p-3 text-center">
          <p className="text-4xl font-black text-amber-700">{alertas.amarillos}</p>
          <p className="text-sm font-bold text-stone-700">lotes por vencer (≤ 7 días)</p>
        </Tarjeta>
        <Tarjeta className="!p-3 text-center">
          <p className="text-4xl font-black text-red-700">{alertas.rojos}</p>
          <p className="text-sm font-bold text-stone-700">lotes vencidos</p>
        </Tarjeta>
      </div>

      {alertas.rojos > 0 && (
        <BotonPrimario icono={Trash2} variante="suave" onClick={onDarDeBaja}>
          Dar de baja vencidos ({fmtBs(alertas.costoVencido)})
        </BotonPrimario>
      )}

      <BotonPrimario icono={formulario ? X : PackagePlus} onClick={() => setFormulario((f) => !f)}>
        {formulario ? 'Cancelar' : 'Registrar compra (nuevo lote)'}
      </BotonPrimario>

      {formulario && (
        <Tarjeta className="space-y-3">
          <p className="text-lg font-extrabold text-amber-900">¿Qué compraste?</p>
          <div className="grid grid-cols-2 gap-3">
            {insumos.map((i) => (
              <Opcion
                key={i.id}
                activa={i.id === insumoId}
                onClick={() => {
                  setInsumoId(i.id);
                  setCantidad(i.unidad === 'unidad' ? 30 : 1000);
                }}
              >
                {i.nombre}
              </Opcion>
            ))}
          </div>
          <SelectorNumerico
            etiqueta="Cantidad comprada"
            valor={cantidad}
            onCambio={setCantidad}
            min={pasoCantidad}
            max={50_000}
            paso={pasoCantidad}
            formato={(v) => fmtCantidad(v, unidad)}
          />
          <SelectorNumerico
            etiqueta="Precio pagado"
            valor={precio}
            onCambio={setPrecio}
            min={0}
            max={5_000}
            paso={0.5}
            decimales={2}
            formato={fmtBs}
            ayuda={`Costo por ${unidad === 'unidad' ? 'unidad' : unidad}: ${fmtBs(costoPorUnidadBase(precio, cantidad))}${
              unidad === 'unidad' ? '' : ` · por kg/l: ${fmtBs(costoPorUnidadBase(precio, cantidad) * 1000)}`
            }`}
          />
          <SelectorNumerico
            etiqueta="Vence en"
            valor={diasVence}
            onCambio={setDiasVence}
            min={0}
            max={730}
            formato={(v) => `${v} día${v === 1 ? '' : 's'}`}
            ayuda={`Fecha de vencimiento: ${fmtFecha(sumarDias(hoy, diasVence))}`}
          />
          <BotonPrimario icono={CheckCircle2} onClick={guardarLote}>
            Guardar lote
          </BotonPrimario>
        </Tarjeta>
      )}

      <ul className="space-y-3">
        {insumos.map((insumo) => {
          const r = resumirInsumo(lotes, insumo.id, hoy);
          const propios = lotes.filter((l) => l.insumoId === insumo.id && l.cantidadDisponible > 0);
          // Orden de consumo FEFO primero; los vencidos al final.
          const enOrden = [...estrategiaFEFO.ordenar(propios, hoy), ...propios.filter((l) => diasRestantes(l.fechaVencimiento, hoy) < 0)];
          const expandido = abierto === insumo.id;
          return (
            <li key={insumo.id}>
              <Tarjeta className="!p-0">
                <button
                  type="button"
                  onClick={() => setAbierto(expandido ? null : insumo.id)}
                  aria-expanded={expandido}
                  className="btn-tactil flex min-h-20 w-full items-center gap-3 rounded-3xl p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-extrabold text-stone-800">{insumo.nombre}</p>
                    <p className="text-base font-semibold text-stone-600">
                      {fmtCantidad(r.disponibleUtil, insumo.unidad)} útiles · {fmtBs(r.valorStock)}
                    </p>
                  </div>
                  {r.semaforo ? <InsigniaSemaforo estado={r.semaforo} /> : <span className="text-sm font-bold text-stone-500">Sin stock</span>}
                  <ChevronDown className={`size-6 shrink-0 text-amber-900 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                </button>
                {expandido && (
                  <ol className="space-y-2 border-t-2 border-amber-200 p-4">
                    {enOrden.length === 0 && <li className="text-stone-600">No hay lotes con existencias.</li>}
                    {enOrden.map((l, idx) => {
                      const d = diasRestantes(l.fechaVencimiento, hoy);
                      const s = semaforoCaducidad(l.fechaVencimiento, hoy);
                      return (
                        <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-stone-100 p-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-200 text-sm font-black text-amber-950">
                            {s === 'rojo' ? '—' : idx + 1}
                          </span>
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="font-bold text-stone-800">
                              {fmtCantidad(l.cantidadDisponible, insumo.unidad)} de {fmtCantidad(l.cantidadInicial, insumo.unidad)}
                            </p>
                            <p className="text-stone-600">
                              Vence {fmtFecha(l.fechaVencimiento)} · {fmtBs(l.costoUnitario * (insumo.unidad === 'unidad' ? 1 : 1000))}/
                              {insumo.unidad === 'unidad' ? 'u.' : insumo.unidad === 'g' ? 'kg' : 'l'}
                            </p>
                          </div>
                          <InsigniaSemaforo
                            estado={s}
                            detalle={d < 0 ? `Hace ${-d} d` : d === 0 ? 'Hoy' : `${d} d`}
                          />
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Tarjeta>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ═══════════════════════════ Vista: Mis Recetas ═══════════════════════════

function VistaRecetas({
  insumos,
  lotes,
  recetas,
  hoy,
  onActualizarReceta,
  onProducir,
}: {
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  recetas: readonly Receta[];
  hoy: FechaISO;
  onActualizarReceta: (r: Receta) => void;
  onProducir: (r: Receta, factor: number) => void;
}) {
  const [recetaId, setRecetaId] = useState(recetas[0]?.id ?? '');
  const [factor, setFactor] = useState(1);
  const receta = recetas.find((r) => r.id === recetaId);
  const porId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  const necesidades = useMemo(
    () => (receta ? [...necesidadesReceta(receta, insumos, factor)] : []),
    [receta, insumos, factor],
  );
  const alcanza = necesidades.every(([id, q]) => disponibleUtilizable(lotes, id, hoy) + 1e-9 >= q);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {recetas.map((r) => (
          <Opcion key={r.id} activa={r.id === recetaId} onClick={() => setRecetaId(r.id)}>
            <span className="flex items-center gap-2">
              <ChefHat className="size-5 shrink-0" /> {r.nombre}
              <span className="ml-auto text-sm font-semibold">rinde {r.rendimiento}</span>
            </span>
          </Opcion>
        ))}
      </div>

      {receta && (
        <>
          <Tarjeta className="space-y-3">
            <p className="flex items-center gap-2 text-lg font-extrabold text-amber-900">
              <Clock className="size-6" /> Tiempos de la receta
            </p>
            <SelectorNumerico
              etiqueta="Elaboración y decorado"
              valor={receta.minutosElaboracion}
              onCambio={(v) => onActualizarReceta({ ...receta, minutosElaboracion: v })}
              max={600}
              paso={5}
              formato={(v) => `${v} min`}
            />
            <SelectorNumerico
              etiqueta="Horneado"
              icono={Flame}
              valor={receta.minutosHorneado}
              onCambio={(v) => onActualizarReceta({ ...receta, minutosHorneado: v })}
              max={600}
              paso={5}
              formato={(v) => `${v} min`}
            />
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <SelectorNumerico
              etiqueta="¿Cuántas veces la vas a preparar?"
              valor={factor}
              onCambio={setFactor}
              min={1}
              max={10}
              formato={(v) => `× ${v}  (${v * receta.rendimiento} u.)`}
            />
            <p className="text-lg font-extrabold text-amber-900">Ingredientes (incluye merma)</p>
            <ul className="space-y-2">
              {necesidades.map(([id, q]) => {
                const ins = porId.get(id);
                if (!ins) return null;
                const disp = disponibleUtilizable(lotes, id, hoy);
                const ok = disp + 1e-9 >= q;
                return (
                  <li
                    key={id}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${
                      ok ? 'border-amber-200 bg-stone-100' : 'border-red-400 bg-red-100'
                    }`}
                  >
                    {ok ? (
                      <CheckCircle2 className="size-6 shrink-0 text-emerald-700" />
                    ) : (
                      <AlertTriangle className="size-6 shrink-0 text-red-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-stone-800">{ins.nombre}</p>
                      <p className="text-sm text-stone-600">
                        Necesitas {fmtCantidad(q, ins.unidad)} · tienes {fmtCantidad(disp, ins.unidad)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <BotonPrimario icono={ChefHat} onClick={() => onProducir(receta, factor)}>
              {alcanza ? 'Producir y descontar stock' : 'Faltan insumos'}
            </BotonPrimario>
            <p className="text-center text-sm text-stone-600">
              Se descuenta por FEFO (primero lo que vence antes). Si falta un solo ingrediente, no se descuenta nada.
            </p>
          </Tarjeta>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════ Vista: Costos Fijos (Servicios) ═══════════════════════════

const ICONO_SERVICIO: Record<TipoServicio, LucideIcon> = { luz: Lightbulb, agua: Droplets, gas: Flame };

function VistaServicios({
  servicios,
  onCambiarMonto,
}: {
  servicios: readonly ServicioFijo[];
  onCambiarMonto: (id: string, monto: number) => void;
}) {
  const cfg = CONFIG_LABORAL_POR_DEFECTO;
  const tMOD = tasaMinutoMOD(cfg);
  const tCIF = tasaMinutoCIF(servicios, cfg);

  return (
    <div className="space-y-4">
      <Tarjeta className="space-y-2">
        <p className="text-lg font-extrabold text-amber-900">Tu mano de obra</p>
        <p className="text-base text-stone-700">
          Salario de referencia <b>{fmtBs(cfg.salarioMensual)}</b> al mes · {cfg.diasLaborablesMes} días × {cfg.horasPorDia} h ={' '}
          {fmtNum(minutosLaborablesMes(cfg), 0)} min
        </p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-2xl bg-rose-100 p-3 text-center">
            <p className="text-2xl font-black text-stone-800">{fmtBs(tMOD * 60)}</p>
            <p className="text-sm font-bold text-stone-600">por hora</p>
          </div>
          <div className="rounded-2xl bg-rose-100 p-3 text-center">
            <p className="text-2xl font-black text-stone-800">{fmtBs(tMOD)}</p>
            <p className="text-sm font-bold text-stone-600">por minuto</p>
          </div>
        </div>
      </Tarjeta>

      <p className="px-1 text-base font-bold text-stone-700">Monto mensual de tus facturas:</p>
      {servicios.map((s) => (
        <SelectorNumerico
          key={s.id}
          etiqueta={s.nombre}
          icono={ICONO_SERVICIO[s.tipo]}
          valor={s.montoMensual}
          onCambio={(v) => onCambiarMonto(s.id, v)}
          max={5_000}
          paso={5}
          formato={fmtBs}
          ayuda={`${fmtBs(tasaMinutoServicio(s, cfg))}/min · se cobra sobre ${
            s.aplicaA === 'horneado' ? 'minutos de horno' : 'todos los minutos de la receta'
          }`}
        />
      ))}

      <Tarjeta className="text-center">
        <p className="text-base font-bold text-stone-600">Costo indirecto combinado</p>
        <p className="text-3xl font-black text-stone-800">{fmtBs(tCIF * 60)} / hora</p>
        <p className="text-base text-stone-600">{fmtBs(tCIF)} por minuto de producción</p>
      </Tarjeta>
    </div>
  );
}

// ═══════════════════════════ Vista: Cotizador ═══════════════════════════

function VistaCotizador({
  insumos,
  lotes,
  recetas,
  servicios,
  hoy,
  onAviso,
}: {
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  recetas: readonly Receta[];
  servicios: readonly ServicioFijo[];
  hoy: FechaISO;
  onAviso: (a: Aviso) => void;
}) {
  const [recetaId, setRecetaId] = useState(recetas[0]?.id ?? '');
  const [unidades, setUnidades] = useState(12);
  const [margenPct, setMargenPct] = useState(35);
  const receta = recetas.find((r) => r.id === recetaId);

  const cot = useMemo(
    () => (receta ? cotizar({ receta, insumos, lotes, servicios, margen: margenPct / 100, unidades, hoy }) : null),
    [receta, insumos, lotes, servicios, margenPct, unidades, hoy],
  );

  /** Plantilla determinista (funciona offline). No expone el desglose interno de costos. */
  const compartir = async () => {
    if (!cot || !receta) return;
    const texto = [
      '🎂 *GustoDulce* — Cotización',
      `Producto: ${receta.nombre}`,
      `Cantidad: ${cot.unidades} u.`,
      `Precio unitario: ${fmtBs(cot.precioUnitario)}`,
      `*Total: ${fmtBs(cot.precioTotal)}*`,
      `Válida hasta el ${fmtFecha(sumarDias(hoy, 7))}.`,
    ].join('\n');
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') onAviso({ tipo: 'error', texto: 'No se pudo compartir la cotización.' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {recetas.map((r) => (
          <Opcion key={r.id} activa={r.id === recetaId} onClick={() => setRecetaId(r.id)}>
            {r.nombre}
          </Opcion>
        ))}
      </div>

      <SelectorNumerico
        etiqueta="Unidades del pedido"
        valor={unidades}
        onCambio={setUnidades}
        min={1}
        max={500}
        formato={(v) => `${v} u.`}
      />
      <SelectorNumerico
        etiqueta="Margen de ganancia"
        valor={margenPct}
        onCambio={setMargenPct}
        min={0}
        max={90}
        paso={5}
        formato={(v) => `${v} %`}
        ayuda="Porcentaje del precio de venta que queda como ganancia."
      />

      {cot && (
        <>
          <Tarjeta className="border-rose-300 bg-rose-100 text-center">
            <p className="text-base font-bold text-amber-900">Precio sugerido del pedido</p>
            <p className="text-5xl font-black tracking-tight text-stone-800">{fmtBs(cot.precioTotal)}</p>
            <p className="mt-1 text-lg font-bold text-stone-700">{fmtBs(cot.precioUnitario)} por unidad</p>
          </Tarjeta>

          <Tarjeta>
            <p className="mb-2 text-lg font-extrabold text-amber-900">Desglose interno (por unidad)</p>
            <dl className="divide-y-2 divide-amber-200 text-base">
              {(
                [
                  ['Materia prima (MPD)', cot.mpd.total],
                  ['Mano de obra (MOD)', cot.mod],
                  ['Servicios (CIF)', cot.cif.total],
                ] as const
              ).map(([n, v]) => (
                <div key={n} className="flex justify-between py-2">
                  <dt className="text-stone-700">{n}</dt>
                  <dd className="font-bold tabular-nums text-stone-800">{fmtBs(v / (receta?.rendimiento ?? 1))}</dd>
                </div>
              ))}
              <div className="flex justify-between py-2">
                <dt className="font-extrabold text-stone-800">Costo unitario</dt>
                <dd className="font-black tabular-nums text-stone-800">{fmtBs(cot.costoUnitario)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="font-extrabold text-emerald-800">Tu ganancia del pedido</dt>
                <dd className="font-black tabular-nums text-emerald-800">{fmtBs(cot.gananciaTotal)}</dd>
              </div>
            </dl>
          </Tarjeta>

          {cot.advertencias.length > 0 && (
            <Tarjeta className="border-amber-400 bg-amber-100">
              {cot.advertencias.map((a) => (
                <p key={a} className="flex gap-2 py-1 text-sm font-semibold text-amber-950">
                  <AlertTriangle className="size-5 shrink-0" /> {a}
                </p>
              ))}
            </Tarjeta>
          )}

          <BotonPrimario icono={Share2} onClick={compartir}>
            Enviar al cliente (WhatsApp)
          </BotonPrimario>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════ Raíz ═══════════════════════════

interface Aviso {
  tipo: 'ok' | 'error';
  texto: string;
}

export default function App() {
  // Fecha civil local fijada al montar. (En producción: recalcular al volver a primer plano.)
  const [hoy] = useState<FechaISO>(() => fechaLocalDe(new Date()));
  const [vista, setVista] = useState<Vista>('inventario');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [insumos] = useState<readonly Insumo[]>(INSUMOS_DEMO);
  const [lotes, setLotes] = useState<Lote[]>(() => crearLotesDemo(hoy));
  const [recetas, setRecetas] = useState<Receta[]>(() => [...RECETAS_DEMO]);
  const [servicios, setServicios] = useState<ServicioFijo[]>(() => [...SERVICIOS_DEMO]);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    if (!menuAbierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [menuAbierto]);

  const nombreInsumo = (id: string) => insumos.find((i) => i.id === id)?.nombre ?? id;
  const actual = VISTAS.find((v) => v.id === vista) ?? VISTAS[0]!;

  const manejarProduccion = (receta: Receta, factor: number) => {
    const r = producir(receta, insumos, lotes, hoy, factor);
    if (r.ok) {
      setLotes(r.valor.lotes);
      setAviso({ tipo: 'ok', texto: `${receta.nombre} ×${factor}: stock descontado (${fmtBs(r.valor.costoMPD)} en insumos).` });
    } else {
      setAviso({
        tipo: 'error',
        texto: `No se descontó nada. Falta: ${r.error.faltantes.map((f) => nombreInsumo(f.insumoId)).join(', ')}.`,
      });
    }
  };

  const manejarBaja = () => {
    const r = darDeBajaVencidos(lotes, hoy);
    setLotes(r.lotes);
    setAviso({ tipo: 'ok', texto: `${r.bajas.length} lote(s) dados de baja · merma de ${fmtBs(r.costoTotal)}.` });
  };

  return (
    <div className="min-h-dvh bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-rose-200 bg-rose-100 px-4 py-2">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
          className="btn-tactil grid size-14 place-items-center rounded-2xl bg-rose-300 text-amber-950 active:bg-rose-400"
        >
          <Menu className="size-8" strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wider text-rose-700">GustoDulce</p>
          <h1 className="truncate text-xl font-black text-amber-900">{actual.titulo}</h1>
        </div>
      </header>

      {menuAbierto && (
        <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal="true" aria-label="Menú principal">
          <nav className="flex w-80 max-w-[85vw] flex-col gap-3 bg-rose-50 p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-2xl font-black text-amber-900">GustoDulce</p>
              <button
                type="button"
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar menú"
                className="btn-tactil grid size-14 place-items-center rounded-2xl bg-rose-200 text-amber-950 active:bg-rose-300"
              >
                <X className="size-8" strokeWidth={2.5} />
              </button>
            </div>
            {VISTAS.map(({ id, titulo, icono: Icono }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setVista(id);
                  setMenuAbierto(false);
                }}
                aria-current={vista === id ? 'page' : undefined}
                className={`btn-tactil flex min-h-16 items-center gap-4 rounded-2xl border-2 px-4 text-left text-lg font-extrabold ${
                  vista === id ? 'border-rose-400 bg-rose-300 text-amber-950' : 'border-rose-200 bg-rose-100 text-amber-900 active:bg-rose-200'
                }`}
              >
                <Icono className="size-7 shrink-0" />
                {titulo}
              </button>
            ))}
            <p className="mt-auto text-sm text-stone-600">Hoy: {fmtFecha(hoy)}</p>
          </nav>
          <button type="button" aria-label="Cerrar menú" className="flex-1 bg-stone-900/40" onClick={() => setMenuAbierto(false)} />
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 pt-4 pb-28">
        {vista === 'inventario' && (
          <VistaInventario
            insumos={insumos}
            lotes={lotes}
            hoy={hoy}
            onAgregarLote={(l) => {
              setLotes((ls) => [...ls, l]);
              setAviso({ tipo: 'ok', texto: `Lote de ${nombreInsumo(l.insumoId)} registrado.` });
            }}
            onDarDeBaja={manejarBaja}
          />
        )}
        {vista === 'recetas' && (
          <VistaRecetas
            insumos={insumos}
            lotes={lotes}
            recetas={recetas}
            hoy={hoy}
            onActualizarReceta={(r) => setRecetas((rs) => rs.map((x) => (x.id === r.id ? r : x)))}
            onProducir={manejarProduccion}
          />
        )}
        {vista === 'servicios' && (
          <VistaServicios
            servicios={servicios}
            onCambiarMonto={(id, monto) => setServicios((ss) => ss.map((s) => (s.id === id ? { ...s, montoMensual: monto } : s)))}
          />
        )}
        {vista === 'cotizador' && (
          <VistaCotizador insumos={insumos} lotes={lotes} recetas={recetas} servicios={servicios} hoy={hoy} onAviso={setAviso} />
        )}
      </main>

      {aviso && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-2xl border-2 p-4 text-base font-bold shadow-xl ${
            aviso.tipo === 'ok' ? 'border-emerald-400 bg-emerald-100 text-emerald-950' : 'border-red-400 bg-red-100 text-red-950'
          }`}
        >
          {aviso.tipo === 'ok' ? <CheckCircle2 className="size-6 shrink-0" /> : <AlertTriangle className="size-6 shrink-0" />}
          <span className="flex-1">{aviso.texto}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(null)} className="btn-tactil -m-2 grid size-12 place-items-center rounded-xl">
            <X className="size-6" />
          </button>
        </div>
      )}
      {import.meta.env.DEV && <PanelPruebaFEFO />}
    </div>
  );
}
