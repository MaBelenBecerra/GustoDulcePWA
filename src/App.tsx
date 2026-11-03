/**
 * GustoDulce — MVP PWA Offline-First
 * Motor ABC/TDABC + Control logístico FEFO/PEPS multilote + UI "Sucia-Friendly"
 *
 * Estructura del archivo (preparada para extraerse a capas de Clean Architecture):
 *   1. Dominio: tipos e interfaces
 *   2. Motor determinista: funciones puras (sin React, sin efectos, testeables)
 *   3. Datos semilla (catálogo referencial Santa Cruz, Bs.)
 *   4. Componentes táctiles reutilizables
 *   5. Pantallas (Costeo / Inventario)
 *   6. Componente raíz
 *
 * Estilos: Tailwind CSS v4. Los tokens de marca (dulce-*, semaforo-*) se
 * definen en index.css mediante @theme; no existe tailwind.config.js.
 *
 * REGLA: todo cálculo financiero es determinista. Ningún modelo de lenguaje
 * participa en la valuación de costos ni en la deducción de existencias.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
} from 'react';
import {
  Cake,
  Calculator,
  ChefHat,
  CircleCheck,
  CircleX,
  Clock,
  Flame,
  Minus,
  Package,
  Percent,
  Play,
  Plus,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './App.css';

/* =============================================================================
 * 1. DOMINIO — Tipos e interfaces
 * ============================================================================= */

type UnidadConsumo = 'g' | 'ml' | 'u';
type EstadoSemaforo = 'verde' | 'amarillo' | 'rojo';
type EstrategiaSalida = 'FEFO' | 'PEPS';
type Pantalla = 'costeo' | 'inventario';

/** Lote L_j de un insumo. Fechas en formato ISO de calendario (YYYY-MM-DD). */
interface Lote {
  readonly id: string;
  /** q_j: cantidad disponible en unidad de consumo (g, ml, u). */
  readonly cantidad: number;
  /** c_j: costo de adquisición por unidad de consumo (Bs). */
  readonly costoUnitario: number;
  readonly fechaIngreso: string;
  /** f_j */
  readonly fechaVencimiento: string;
}

interface Insumo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: UnidadConsumo;
  /** P_compra,i: precio de reposición vigente del empaque (Bs). */
  readonly precioCompra: number;
  /** U_compra,i: contenido del empaque en unidad de consumo. */
  readonly unidadesCompra: number;
  /** m_i: factor de merma, 0 ≤ m_i < 1. */
  readonly merma: number;
  readonly lotes: readonly Lote[];
}

interface LineaReceta {
  readonly insumoId: string;
  /** Q_i: cantidad neta (útil) requerida por tanda. */
  readonly cantidad: number;
}

interface Actividad {
  readonly id: string;
  readonly nombre: string;
  /** t_k: minutos de trabajo directo. */
  readonly minutos: number;
}

interface RecursoCIF {
  readonly id: string;
  readonly nombre: string;
  /** CM_j: costo mensual del recurso (Bs). */
  readonly costoMensual: number;
  /** H_j: horas mensuales de capacidad/uso del recurso. */
  readonly horasMensuales: number;
  /** u_j: minutos de uso en la receta. */
  readonly minutosUso: number;
}

interface Receta {
  readonly nombre: string;
  readonly lineas: readonly LineaReceta[];
  readonly actividades: readonly Actividad[];
  readonly recursos: readonly RecursoCIF[];
  /** S_h: salario base por hora (Bs). */
  readonly salarioHora: number;
  /** N: porciones por tanda. */
  readonly porciones: number;
  /** g: margen neto comercial, 0 ≤ g < 1. */
  readonly margen: number;
}

interface CronometroActivo {
  readonly actividadId: string;
  /** Marca de tiempo absoluta (ms epoch) del inicio de la medición. */
  readonly inicio: number;
}

interface DesgloseCosto {
  readonly mpd: number;
  readonly mod: number;
  readonly cif: number;
  readonly total: number;
  readonly unitario: number;
  readonly precioSugeridoUnitario: number;
  readonly precioSugeridoTotal: number;
  readonly gananciaTotal: number;
}

interface ConsumoLote {
  readonly loteId: string;
  readonly cantidad: number;
  readonly costo: number;
}

interface ResultadoDeduccion {
  readonly lotes: Lote[];
  readonly consumos: ConsumoLote[];
  /** C_salida = Σ x_j · c_j */
  readonly costoSalida: number;
  /** Cantidad que no pudo cubrirse con lotes vigentes (0 si hubo stock suficiente). */
  readonly faltante: number;
}

interface DetalleProduccion {
  readonly insumoId: string;
  readonly nombre: string;
  readonly unidad: UnidadConsumo;
  readonly requerido: number;
  readonly costo: number;
  readonly faltante: number;
  readonly consumos: ConsumoLote[];
}

interface PlanProduccion {
  readonly factible: boolean;
  readonly insumos: Insumo[];
  readonly detalle: DetalleProduccion[];
  readonly costoTotal: number;
  readonly tandas: number;
  readonly estrategia: EstrategiaSalida;
}

/* =============================================================================
 * 2. MOTOR DETERMINISTA — Funciones puras
 * ============================================================================= */

const UMBRAL_AMARILLO_DIAS = 7;
const MARGEN_MAXIMO = 0.9;
const EPS = 1e-9;
const MS_POR_DIA = 86_400_000;

/** Redondeo half-up estable frente a errores de coma flotante. */
function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** Bs por unidad útil de consumo: P / (U · (1 − m)). */
function costoPorUnidadUtil(insumo: Insumo): number {
  if (insumo.unidadesCompra <= 0) {
    throw new RangeError(`Unidad de compra inválida en "${insumo.nombre}".`);
  }
  if (insumo.merma < 0 || insumo.merma >= 1) {
    throw new RangeError(`Merma fuera de rango [0, 1) en "${insumo.nombre}".`);
  }
  return insumo.precioCompra / (insumo.unidadesCompra * (1 - insumo.merma));
}

/** C_MPD = Σ Q_i · P_i / (U_i · (1 − m_i)) */
function calcularMPD(
  lineas: readonly LineaReceta[],
  insumos: ReadonlyMap<string, Insumo>,
): number {
  let total = 0;
  for (const linea of lineas) {
    const insumo = insumos.get(linea.insumoId);
    if (!insumo || linea.cantidad <= 0) continue;
    total += linea.cantidad * costoPorUnidadUtil(insumo);
  }
  return total;
}

/** C_MOD = Σ t_k · (S_h / 60) */
function calcularMOD(actividades: readonly Actividad[], salarioHora: number): number {
  const tasaMinutaria = Math.max(0, salarioHora) / 60;
  return actividades.reduce((acc, a) => acc + Math.max(0, a.minutos) * tasaMinutaria, 0);
}

/** Toques accidentales: menos de 5 s no cuenta como medición. */
const UMBRAL_CRONOMETRO_MS = 5_000;

/**
 * t_k cronometrado: minutos transcurridos redondeados hacia arriba (se cobra
 * el minuto iniciado). Usa marcas de tiempo absolutas en lugar de contar ticks,
 * así es exacto aunque el navegador congele temporizadores con la pantalla
 * bloqueada o la PWA en segundo plano.
 */
function minutosCronometrados(inicioMs: number, finMs: number): number {
  const transcurrido = finMs - inicioMs;
  if (transcurrido < UMBRAL_CRONOMETRO_MS) return 0;
  return Math.ceil(transcurrido / 60_000);
}

/** r_j = CM_j / (60 · H_j) */
function tasaCIF(recurso: RecursoCIF): number {
  if (recurso.horasMensuales <= 0) return 0;
  return recurso.costoMensual / (60 * recurso.horasMensuales);
}

/** C_CIF = Σ u_j · r_j */
function calcularCIF(recursos: readonly RecursoCIF[]): number {
  return recursos.reduce((acc, r) => acc + Math.max(0, r.minutosUso) * tasaCIF(r), 0);
}

/** P_v = C_u / (1 − g), con 0 ≤ g < 1. */
function precioSugerido(costoUnitario: number, margen: number): number {
  if (margen < 0 || margen >= 1) {
    throw new RangeError('El margen g debe cumplir 0 ≤ g < 1.');
  }
  return costoUnitario / (1 - margen);
}

function calcularCostos(
  receta: Receta,
  insumos: ReadonlyMap<string, Insumo>,
): DesgloseCosto {
  const mpd = calcularMPD(receta.lineas, insumos);
  const mod = calcularMOD(receta.actividades, receta.salarioHora);
  const cif = calcularCIF(receta.recursos);
  const total = mpd + mod + cif;
  const n = Math.max(1, Math.floor(receta.porciones));
  const unitario = total / n;
  const margen = Math.min(MARGEN_MAXIMO, Math.max(0, receta.margen));
  const pv = precioSugerido(unitario, margen);
  // Se redondea SOLO al final para no acumular error de redondeo intermedio.
  return {
    mpd: redondear(mpd),
    mod: redondear(mod),
    cif: redondear(cif),
    total: redondear(total),
    unitario: redondear(unitario),
    precioSugeridoUnitario: redondear(pv),
    precioSugeridoTotal: redondear(pv * n),
    gananciaTotal: redondear(pv * n - total),
  };
}

/* ---------- Fechas (aritmética por día calendario, inmune a husos/DST) ---------- */

function aDiaUTC(iso: string): number {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/** Fecha local del dispositivo (America/La_Paz en producción) como YYYY-MM-DD. */
function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function sumarDias(iso: string, dias: number): string {
  return new Date(aDiaUTC(iso) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** d_j = f_j − f_hoy (en días enteros). */
function diasRestantes(fechaVencimiento: string, hoy: string): number {
  return Math.round((aDiaUTC(fechaVencimiento) - aDiaUTC(hoy)) / MS_POR_DIA);
}

function estadoSemaforo(dias: number): EstadoSemaforo {
  if (dias < 0) return 'rojo';
  if (dias <= UMBRAL_AMARILLO_DIAS) return 'amarillo';
  return 'verde';
}

/* ---------- Inventario multilote FEFO / PEPS ---------- */

function comparadorLotes(estrategia: EstrategiaSalida) {
  return (a: Lote, b: Lote): number => {
    const venc = aDiaUTC(a.fechaVencimiento) - aDiaUTC(b.fechaVencimiento);
    const ingr = aDiaUTC(a.fechaIngreso) - aDiaUTC(b.fechaIngreso);
    const primario = estrategia === 'FEFO' ? venc : ingr;
    const secundario = estrategia === 'FEFO' ? ingr : venc;
    // Desempate final por id: orden total y reproducible (determinismo).
    return primario || secundario || a.id.localeCompare(b.id);
  };
}

/**
 * Deducción en cascada: x_j = min(q_j, Q − Σ x_previos).
 * - Excluye lotes vencidos (rojo): son merma financiera, no materia prima utilizable.
 * - No muta la entrada; devuelve una nueva lista de lotes.
 * - Si el stock vigente no alcanza, informa `faltante` (la decisión de abortar es del llamador).
 */
function deducirInventario(
  lotes: readonly Lote[],
  cantidadRequerida: number,
  hoy: string,
  estrategia: EstrategiaSalida = 'FEFO',
): ResultadoDeduccion {
  if (!(cantidadRequerida > 0)) {
    return { lotes: [...lotes], consumos: [], costoSalida: 0, faltante: 0 };
  }

  const cola = lotes
    .filter((l) => l.cantidad > EPS && diasRestantes(l.fechaVencimiento, hoy) >= 0)
    .sort(comparadorLotes(estrategia));

  const tomado = new Map<string, number>();
  const consumos: ConsumoLote[] = [];
  let restante = cantidadRequerida;
  let costo = 0;

  for (const lote of cola) {
    if (restante <= EPS) break;
    const x = Math.min(lote.cantidad, restante);
    tomado.set(lote.id, x);
    consumos.push({ loteId: lote.id, cantidad: redondear(x, 3), costo: redondear(x * lote.costoUnitario, 4) });
    costo += x * lote.costoUnitario;
    restante -= x;
  }

  const lotesActualizados = lotes.map((l) => {
    const x = tomado.get(l.id);
    if (x === undefined) return l;
    const nuevo = redondear(l.cantidad - x, 3);
    return { ...l, cantidad: nuevo <= EPS ? 0 : nuevo };
  });

  return {
    lotes: lotesActualizados,
    consumos,
    costoSalida: redondear(costo, 4),
    faltante: restante > EPS ? redondear(restante, 3) : 0,
  };
}

/** Cantidad bruta a retirar de despensa: Q / (1 − m). Unidades discretas se redondean hacia arriba. */
function cantidadBruta(cantidadNeta: number, insumo: Insumo): number {
  const bruto = cantidadNeta / (1 - insumo.merma);
  return insumo.unidad === 'u' ? Math.ceil(bruto - 1e-6) : redondear(bruto, 3);
}

/**
 * Producción ATÓMICA: si cualquier insumo tiene faltante, no se descuenta nada
 * (todo o nada, igual que una transacción readwrite de IndexedDB).
 */
function planificarProduccion(
  insumos: readonly Insumo[],
  lineas: readonly LineaReceta[],
  tandas: number,
  hoy: string,
  estrategia: EstrategiaSalida,
): PlanProduccion {
  const netoPorInsumo = new Map<string, number>();
  for (const linea of lineas) {
    if (linea.cantidad <= 0) continue;
    netoPorInsumo.set(
      linea.insumoId,
      (netoPorInsumo.get(linea.insumoId) ?? 0) + linea.cantidad * tandas,
    );
  }

  const detalle: DetalleProduccion[] = [];
  const actualizados = insumos.map((insumo) => {
    const neto = netoPorInsumo.get(insumo.id);
    if (neto === undefined) return insumo;
    const requerido = cantidadBruta(neto, insumo);
    const r = deducirInventario(insumo.lotes, requerido, hoy, estrategia);
    detalle.push({
      insumoId: insumo.id,
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      requerido,
      costo: r.costoSalida,
      faltante: r.faltante,
      consumos: r.consumos,
    });
    return { ...insumo, lotes: r.lotes };
  });

  const factible = detalle.every((d) => d.faltante === 0);
  return {
    factible,
    insumos: factible ? actualizados : [...insumos],
    detalle,
    costoTotal: redondear(detalle.reduce((acc, d) => acc + d.costo, 0)),
    tandas,
    estrategia,
  };
}

function stockVigente(insumo: Insumo, hoy: string): number {
  return insumo.lotes
    .filter((l) => diasRestantes(l.fechaVencimiento, hoy) >= 0)
    .reduce((acc, l) => acc + l.cantidad, 0);
}

function valorVencido(insumo: Insumo, hoy: string): number {
  return insumo.lotes
    .filter((l) => diasRestantes(l.fechaVencimiento, hoy) < 0)
    .reduce((acc, l) => acc + l.cantidad * l.costoUnitario, 0);
}

/* =============================================================================
 * 3. DATOS SEMILLA — Catálogo referencial (mercados Abasto / Mutualista, Bs.)
 * ============================================================================= */

function crearInsumosDemo(hoy: string): Insumo[] {
  const lote = (
    id: string,
    cantidad: number,
    costoUnitario: number,
    ingresoHaceDias: number,
    venceEnDias: number,
  ): Lote => ({
    id,
    cantidad,
    costoUnitario,
    fechaIngreso: sumarDias(hoy, -ingresoHaceDias),
    fechaVencimiento: sumarDias(hoy, venceEnDias),
  });

  return [
    {
      id: 'harina', nombre: 'Harina 0000', unidad: 'g',
      precioCompra: 9, unidadesCompra: 1000, merma: 0.02,
      lotes: [lote('HAR-01', 800, 0.0085, 20, 40), lote('HAR-02', 1000, 0.009, 3, 90)],
    },
    {
      id: 'azucar', nombre: 'Azúcar blanca', unidad: 'g',
      precioCompra: 8.5, unidadesCompra: 1000, merma: 0.01,
      lotes: [lote('AZU-01', 600, 0.008, 30, 200), lote('AZU-02', 1000, 0.0085, 5, 300)],
    },
    {
      id: 'huevo', nombre: 'Huevo', unidad: 'u',
      precioCompra: 30, unidadesCompra: 30, merma: 0,
      lotes: [lote('HUE-01', 6, 0.9, 12, 5), lote('HUE-02', 30, 1, 2, 20), lote('HUE-00', 2, 0.9, 25, -2)],
    },
    {
      id: 'mantequilla', nombre: 'Mantequilla', unidad: 'g',
      precioCompra: 16, unidadesCompra: 200, merma: 0,
      lotes: [lote('MAN-01', 150, 0.075, 15, 3), lote('MAN-02', 400, 0.08, 4, 25)],
    },
    {
      id: 'leche', nombre: 'Leche entera', unidad: 'ml',
      precioCompra: 7.5, unidadesCompra: 1000, merma: 0,
      lotes: [lote('LEC-00', 500, 0.0072, 8, -1), lote('LEC-01', 1000, 0.0075, 2, 6)],
    },
    {
      id: 'cacao', nombre: 'Cacao amargo', unidad: 'g',
      precioCompra: 25, unidadesCompra: 250, merma: 0.01,
      lotes: [lote('CAC-01', 250, 0.1, 10, 120)],
    },
  ];
}

function crearRecetaDemo(): Receta {
  return {
    nombre: 'Torta de chocolate (molde 24 cm)',
    lineas: [
      { insumoId: 'harina', cantidad: 300 },
      { insumoId: 'azucar', cantidad: 250 },
      { insumoId: 'huevo', cantidad: 4 },
      { insumoId: 'mantequilla', cantidad: 150 },
      { insumoId: 'leche', cantidad: 240 },
      { insumoId: 'cacao', cantidad: 60 },
    ],
    actividades: [
      { id: 'prep', nombre: 'Preparación y mezcla', minutos: 40 },
      { id: 'horno', nombre: 'Horneado (supervisión)', minutos: 45 },
      { id: 'deco', nombre: 'Decorado y armado', minutos: 60 },
    ],
    recursos: [
      { id: 'glp', nombre: 'Horno a GLP (garrafa)', costoMensual: 22.5, horasMensuales: 20, minutosUso: 45 },
      { id: 'luz', nombre: 'Batidora eléctrica', costoMensual: 15, horasMensuales: 30, minutosUso: 15 },
      { id: 'dep', nombre: 'Depreciación del horno', costoMensual: 50, horasMensuales: 80, minutosUso: 45 },
      { id: 'agua', nombre: 'Agua potable', costoMensual: 10, horasMensuales: 60, minutosUso: 10 },
    ],
    salarioHora: 15,
    porciones: 12,
    margen: 0.35,
  };
}

/* =============================================================================
 * 4. COMPONENTES TÁCTILES "SUCIA-FRIENDLY"
 * ============================================================================= */

const fmtBs = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtFecha = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

function fmtNum(valor: number, decimales = 0): string {
  return valor.toLocaleString('es-BO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

function fmtCantidad(valor: number): string {
  return fmtNum(valor, Number.isInteger(valor) ? 0 : 1);
}

function formatearFecha(iso: string): string {
  return fmtFecha.format(new Date(aDiaUTC(iso)));
}

function fmtReloj(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Reloj de pantalla: solo hace tick (cada 1 s) mientras hay un cronómetro activo. */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activo]);
  return ahora;
}

interface BotonRepeticionProps {
  readonly etiqueta: string;
  readonly deshabilitado?: boolean;
  readonly onAccion: () => void;
  readonly children: ReactNode;
}

/**
 * Botón circular de 64×64 px (> 48 dp). Mantener presionado repite la acción
 * (450 ms de espera, luego cada 90 ms) para no tener que tocar 30 veces con
 * los dedos con harina.
 */
function BotonRepeticion({ etiqueta, deshabilitado = false, onAccion, children }: BotonRepeticionProps) {
  const accionRef = useRef(onAccion);
  const retardoRef = useRef<number | undefined>(undefined);
  const intervaloRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    accionRef.current = onAccion;
  }, [onAccion]);

  const detener = useCallback(() => {
    window.clearTimeout(retardoRef.current);
    window.clearInterval(intervaloRef.current);
    retardoRef.current = undefined;
    intervaloRef.current = undefined;
  }, []);

  useEffect(() => detener, [detener]);
  useEffect(() => {
    if (deshabilitado) detener();
  }, [deshabilitado, detener]);

  const iniciar = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (deshabilitado || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    accionRef.current();
    retardoRef.current = window.setTimeout(() => {
      intervaloRef.current = window.setInterval(() => accionRef.current(), 90);
    }, 450);
  };

  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={deshabilitado}
      onPointerDown={iniciar}
      onPointerUp={detener}
      onPointerCancel={detener}
      onLostPointerCapture={detener}
      onContextMenu={(e) => e.preventDefault()}
      // e.detail === 0 → activación por teclado/lector de pantalla (accesibilidad).
      onClick={(e) => {
        if (e.detail === 0 && !deshabilitado) accionRef.current();
      }}
      className="btn-tactil grid h-16 w-16 shrink-0 place-items-center rounded-full bg-dulce-400 text-slate-950 shadow-lg shadow-black/40 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

interface SelectorNumericoProps {
  readonly etiqueta: string;
  readonly detalle?: string;
  readonly valor: number;
  readonly onCambiar: (valor: number) => void;
  readonly paso: number;
  readonly min: number;
  readonly max: number;
  readonly unidad: string;
  readonly decimales?: number;
}

/** Reemplaza cualquier <input>: sin teclado nativo, sin celdas milimétricas. */
function SelectorNumerico({
  etiqueta, detalle, valor, onCambiar, paso, min, max, unidad, decimales = 0,
}: SelectorNumericoProps) {
  const ajustar = (delta: number) =>
    onCambiar(redondear(Math.min(max, Math.max(min, valor + delta)), 4));

  return (
    <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold leading-tight text-white">{etiqueta}</span>
        {detalle && <span className="text-right text-sm leading-tight text-slate-400">{detalle}</span>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <BotonRepeticion etiqueta={`Restar ${paso} ${unidad} a ${etiqueta}`} deshabilitado={valor <= min} onAccion={() => ajustar(-paso)}>
          <Minus className="h-8 w-8" strokeWidth={3} />
        </BotonRepeticion>
        <output className="flex-1 text-center">
          <span className="block text-4xl font-black tabular-nums text-white">{fmtNum(valor, decimales)}</span>
          <span className="block text-sm font-bold uppercase tracking-wide text-dulce-300">{unidad}</span>
        </output>
        <BotonRepeticion etiqueta={`Sumar ${paso} ${unidad} a ${etiqueta}`} deshabilitado={valor >= max} onAccion={() => ajustar(paso)}>
          <Plus className="h-8 w-8" strokeWidth={3} />
        </BotonRepeticion>
      </div>
    </div>
  );
}

interface SeccionProps {
  readonly titulo: string;
  readonly icono: ReactNode;
  readonly subtotal?: number;
  readonly children: ReactNode;
}

function Seccion({ titulo, icono, subtotal, children }: SeccionProps) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 text-xl font-black text-dulce-300">
          {icono}
          {titulo}
        </h2>
        {subtotal !== undefined && (
          <span className="text-lg font-bold tabular-nums text-white">{fmtBs.format(subtotal)}</span>
        )}
      </header>
      {children}
    </section>
  );
}

const SEMAFORO: Record<EstadoSemaforo, { readonly clase: string; readonly Icono: LucideIcon }> = {
  verde: { clase: 'bg-semaforo-verde text-slate-950', Icono: CircleCheck },
  amarillo: { clase: 'bg-semaforo-amarillo text-slate-950', Icono: Clock },
  rojo: { clase: 'bg-semaforo-rojo text-white', Icono: CircleX },
};

function textoSemaforo(dias: number): string {
  if (dias < 0) return `Vencido hace ${-dias} d`;
  if (dias === 0) return 'Vence hoy';
  if (dias <= UMBRAL_AMARILLO_DIAS) return `Usar ya · ${dias} d`;
  return `Óptimo · ${dias} d`;
}

/** Color + ícono + texto: nunca se comunica el estado solo con color. */
function SemaforoCaducidad({ dias }: { readonly dias: number }) {
  const { clase, Icono } = SEMAFORO[estadoSemaforo(dias)];
  return (
    <span className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full px-4 text-base font-black ${clase}`}>
      <Icono className="h-6 w-6" strokeWidth={2.75} />
      {textoSemaforo(dias)}
    </span>
  );
}

/* =============================================================================
 * 5. PANTALLAS
 * ============================================================================= */

interface PantallaCosteoProps {
  readonly receta: Receta;
  readonly setReceta: Dispatch<SetStateAction<Receta>>;
  readonly insumos: ReadonlyMap<string, Insumo>;
  readonly costos: DesgloseCosto;
  readonly cronometro: CronometroActivo | null;
  readonly onIniciarCronometro: (actividadId: string) => void;
  readonly onDetenerCronometro: () => void;
}

function PantallaCosteo({
  receta, setReceta, insumos, costos, cronometro, onIniciarCronometro, onDetenerCronometro,
}: PantallaCosteoProps) {
  const ahora = useAhora(cronometro !== null);

  const actualizarLinea = (insumoId: string, cantidad: number) =>
    setReceta((r) => ({
      ...r,
      lineas: r.lineas.map((l) => (l.insumoId === insumoId ? { ...l, cantidad } : l)),
    }));

  const actualizarActividad = (id: string, minutos: number) =>
    setReceta((r) => ({
      ...r,
      actividades: r.actividades.map((a) => (a.id === id ? { ...a, minutos } : a)),
    }));

  const actualizarRecurso = (id: string, minutosUso: number) =>
    setReceta((r) => ({
      ...r,
      recursos: r.recursos.map((x) => (x.id === id ? { ...x, minutosUso } : x)),
    }));

  const base = costos.total > 0 ? costos.total : 1;
  const proporcion = (v: number) => `${(v / base) * 100}%`;

  return (
    <div className="space-y-8">
      {/* Resultado principal */}
      <section className="rounded-3xl bg-dulce-400 p-5 text-slate-950 shadow-xl shadow-black/40">
        <p className="text-sm font-black uppercase tracking-wider">Precio sugerido por torta</p>
        <p className="text-5xl font-black tabular-nums">{fmtBs.format(costos.precioSugeridoTotal)}</p>
        <p className="mt-1 text-base font-bold">
          Redondeo comercial: Bs {fmtNum(Math.ceil(costos.precioSugeridoTotal))} · {fmtBs.format(costos.precioSugeridoUnitario)} por porción
        </p>

        <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-950/20" aria-hidden="true">
          <div className="bg-slate-950" style={{ width: proporcion(costos.mpd) }} />
          <div className="bg-rose-700" style={{ width: proporcion(costos.mod) }} />
          <div className="bg-sky-800" style={{ width: proporcion(costos.cif) }} />
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          {([
            ['MPD', costos.mpd, 'bg-slate-950'],
            ['MOD', costos.mod, 'bg-rose-700'],
            ['CIF', costos.cif, 'bg-sky-800'],
          ] as const).map(([sigla, valor, color]) => (
            <div key={sigla} className="rounded-xl bg-dulce-300 p-2">
              <dt className="flex items-center justify-center gap-1 text-sm font-black">
                <span className={`h-3 w-3 rounded-full ${color}`} />
                {sigla}
              </dt>
              <dd className="text-lg font-black tabular-nums">{fmtBs.format(valor)}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex justify-between gap-3 text-base font-black">
          <span>Costo: {fmtBs.format(costos.total)}</span>
          <span>Ganancia: {fmtBs.format(costos.gananciaTotal)}</span>
        </div>
      </section>

      <Seccion titulo="Materia prima" icono={<Cake className="h-6 w-6" />} subtotal={costos.mpd}>
        {receta.lineas.map((linea) => {
          const insumo = insumos.get(linea.insumoId);
          if (!insumo) return null;
          const cu = costoPorUnidadUtil(insumo);
          return (
            <SelectorNumerico
              key={linea.insumoId}
              etiqueta={insumo.nombre}
              detalle={`Bs ${fmtNum(cu, 4)}/${insumo.unidad} · merma ${fmtNum(insumo.merma * 100)}% · ${fmtBs.format(linea.cantidad * cu)}`}
              valor={linea.cantidad}
              onCambiar={(v) => actualizarLinea(linea.insumoId, v)}
              paso={insumo.unidad === 'u' ? 1 : 10}
              min={0}
              max={insumo.unidad === 'u' ? 60 : 5000}
              unidad={insumo.unidad}
            />
          );
        })}
      </Seccion>

      <Seccion titulo="Mano de obra" icono={<ChefHat className="h-6 w-6" />} subtotal={costos.mod}>
        <SelectorNumerico
          etiqueta="Salario por hora"
          detalle={`Tasa: Bs ${fmtNum(receta.salarioHora / 60, 4)}/min`}
          valor={receta.salarioHora}
          onCambiar={(v) => setReceta((r) => ({ ...r, salarioHora: v }))}
          paso={0.5}
          min={0}
          max={200}
          unidad="Bs / hora"
          decimales={2}
        />
        <p className="px-1 text-base text-slate-300">
          Cronometra cada actividad mientras trabajas: el tiempo medido reemplaza los minutos.
        </p>
        {receta.actividades.map((a) => {
          const midiendo = cronometro?.actividadId === a.id;
          const ocupado = cronometro !== null && !midiendo;
          const transcurrido = cronometro && midiendo ? ahora - cronometro.inicio : 0;
          return (
            <div key={a.id} className="space-y-3">
              <SelectorNumerico
                etiqueta={a.nombre}
                detalle={fmtBs.format((a.minutos * receta.salarioHora) / 60)}
                valor={a.minutos}
                onCambiar={(v) => actualizarActividad(a.id, v)}
                paso={5}
                min={0}
                max={600}
                unidad="min"
              />
              <button
                type="button"
                disabled={ocupado}
                aria-pressed={midiendo}
                onClick={() => (midiendo ? onDetenerCronometro() : onIniciarCronometro(a.id))}
                className={`btn-tactil flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-black ring-2 disabled:opacity-40 ${
                  midiendo
                    ? 'bg-semaforo-rojo text-white ring-semaforo-rojo'
                    : 'bg-slate-900 text-dulce-300 ring-dulce-400'
                }`}
              >
                {midiendo ? (
                  <>
                    <Square className="h-7 w-7" fill="currentColor" />
                    Detener · <span className="tabular-nums">{fmtReloj(transcurrido)}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-7 w-7" fill="currentColor" />
                    Medir con cronómetro
                  </>
                )}
              </button>
            </div>
          );
        })}
      </Seccion>

      <Seccion titulo="Costos indirectos" icono={<Flame className="h-6 w-6" />} subtotal={costos.cif}>
        {receta.recursos.map((r) => (
          <SelectorNumerico
            key={r.id}
            etiqueta={r.nombre}
            detalle={`r = Bs ${fmtNum(tasaCIF(r), 4)}/min · ${fmtBs.format(r.minutosUso * tasaCIF(r))}`}
            valor={r.minutosUso}
            onCambiar={(v) => actualizarRecurso(r.id, v)}
            paso={5}
            min={0}
            max={600}
            unidad="min de uso"
          />
        ))}
      </Seccion>

      <Seccion titulo="Rendimiento y margen" icono={<Percent className="h-6 w-6" />}>
        <SelectorNumerico
          etiqueta="Porciones por torta"
          detalle={`Costo unitario: ${fmtBs.format(costos.unitario)}`}
          valor={receta.porciones}
          onCambiar={(v) => setReceta((r) => ({ ...r, porciones: v }))}
          paso={1}
          min={1}
          max={100}
          unidad="porciones"
        />
        <SelectorNumerico
          etiqueta="Margen de ganancia"
          detalle="Sobre el precio de venta"
          valor={Math.round(receta.margen * 100)}
          onCambiar={(v) => setReceta((r) => ({ ...r, margen: v / 100 }))}
          paso={5}
          min={0}
          max={MARGEN_MAXIMO * 100}
          unidad="%"
        />
      </Seccion>
    </div>
  );
}

interface PantallaInventarioProps {
  readonly insumos: Insumo[];
  readonly setInsumos: Dispatch<SetStateAction<Insumo[]>>;
  readonly receta: Receta;
  readonly hoy: string;
  readonly mpdPorTanda: number;
}

function PantallaInventario({ insumos, setInsumos, receta, hoy, mpdPorTanda }: PantallaInventarioProps) {
  const [tandas, setTandas] = useState(1);
  const [estrategia, setEstrategia] = useState<EstrategiaSalida>('FEFO');
  const [resultado, setResultado] = useState<PlanProduccion | null>(null);
  // Evita doble descuento por doble toque accidental con dedos grasosos.
  const bloqueoRef = useRef(false);

  const conteo = useMemo(() => {
    const c: Record<EstadoSemaforo, number> = { verde: 0, amarillo: 0, rojo: 0 };
    for (const i of insumos) {
      for (const l of i.lotes) {
        if (l.cantidad > EPS) c[estadoSemaforo(diasRestantes(l.fechaVencimiento, hoy))] += 1;
      }
    }
    return c;
  }, [insumos, hoy]);

  const perdidaVencidos = useMemo(
    () => insumos.reduce((acc, i) => acc + valorVencido(i, hoy), 0),
    [insumos, hoy],
  );

  const producir = () => {
    if (bloqueoRef.current) return;
    bloqueoRef.current = true;
    window.setTimeout(() => {
      bloqueoRef.current = false;
    }, 600);

    const plan = planificarProduccion(insumos, receta.lineas, tandas, hoy, estrategia);
    if (plan.factible) setInsumos(plan.insumos);
    setResultado(plan);
  };

  const actualizarPrecio = (id: string, precioCompra: number) =>
    setInsumos((lista) => lista.map((i) => (i.id === id ? { ...i, precioCompra } : i)));

  return (
    <div className="space-y-8">
      {/* Resumen del semáforo */}
      <section className="grid grid-cols-3 gap-3">
        {(['verde', 'amarillo', 'rojo'] as const).map((estado) => {
          const { clase, Icono } = SEMAFORO[estado];
          return (
            <div key={estado} className={`rounded-2xl p-3 text-center ${clase}`}>
              <Icono className="mx-auto h-7 w-7" strokeWidth={2.75} />
              <p className="text-3xl font-black tabular-nums">{conteo[estado]}</p>
              <p className="text-sm font-black uppercase">{estado === 'verde' ? 'Óptimos' : estado === 'amarillo' ? 'Prioridad' : 'Vencidos'}</p>
            </div>
          );
        })}
      </section>

      {perdidaVencidos > 0 && (
        <section className="flex items-center gap-3 rounded-2xl bg-red-950 p-4 ring-2 ring-red-600">
          <TriangleAlert className="h-8 w-8 shrink-0 text-red-400" />
          <p className="text-base font-bold text-red-100">
            Merma financiera por lotes vencidos: <span className="text-xl font-black">{fmtBs.format(perdidaVencidos)}</span>
          </p>
        </section>
      )}

      {/* Producción */}
      <Seccion titulo="Producir receta" icono={<ChefHat className="h-6 w-6" />}>
        <p className="px-1 text-base text-slate-300">{receta.nombre}</p>
        <SelectorNumerico
          etiqueta="Tortas a producir"
          detalle={`MPD estándar: ${fmtBs.format(mpdPorTanda * tandas)}`}
          valor={tandas}
          onCambiar={setTandas}
          paso={1}
          min={1}
          max={20}
          unidad="tandas"
        />

        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Estrategia de salida">
          {(['FEFO', 'PEPS'] as const).map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={estrategia === e}
              onClick={() => setEstrategia(e)}
              className={`btn-tactil min-h-16 rounded-2xl px-3 text-lg font-black ring-2 ${
                estrategia === e
                  ? 'bg-dulce-400 text-slate-950 ring-dulce-400'
                  : 'bg-slate-900 text-slate-300 ring-slate-700'
              }`}
            >
              {e}
              <span className="block text-xs font-bold">
                {e === 'FEFO' ? 'Primero en vencer' : 'Primero en entrar'}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={producir}
          className="btn-tactil flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 text-2xl font-black text-slate-950 shadow-lg shadow-black/40"
        >
          <Package className="h-8 w-8" strokeWidth={2.75} />
          Descontar insumos
        </button>

        {resultado && (
          <div
            role="status"
            className={`space-y-3 rounded-2xl p-4 ring-2 ${
              resultado.factible ? 'bg-emerald-950 ring-emerald-500' : 'bg-red-950 ring-red-600'
            }`}
          >
            {resultado.factible ? (
              <>
                <p className="flex items-center gap-2 text-lg font-black text-emerald-300">
                  <CircleCheck className="h-7 w-7" />
                  {resultado.tandas} torta(s) descontada(s) por {resultado.estrategia}
                </p>
                <p className="text-base text-emerald-100">
                  Costo debitado de lotes: <b>{fmtBs.format(resultado.costoTotal)}</b> · a precio de reposición:{' '}
                  <b>{fmtBs.format(mpdPorTanda * resultado.tandas)}</b>
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-lg font-black text-red-300">
                <TriangleAlert className="h-7 w-7" />
                Stock vigente insuficiente. No se descontó nada.
              </p>
            )}
            <ul className="space-y-1 text-base">
              {resultado.detalle.map((d) => (
                <li key={d.insumoId} className="flex justify-between gap-3 text-slate-100">
                  <span>
                    {d.nombre}: {fmtCantidad(d.requerido)} {d.unidad}
                    {d.consumos.length > 1 && ` (${d.consumos.length} lotes)`}
                  </span>
                  {d.faltante > 0 ? (
                    <span className="font-black text-red-300">Faltan {fmtCantidad(d.faltante)} {d.unidad}</span>
                  ) : (
                    <span className="tabular-nums">{fmtBs.format(d.costo)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Seccion>

      {/* Existencias por lote */}
      <Seccion titulo="Despensa por lotes" icono={<Package className="h-6 w-6" />}>
        {insumos.map((insumo) => {
          const lotes = insumo.lotes
            .filter((l) => l.cantidad > EPS)
            .slice()
            .sort(comparadorLotes('FEFO'));
          return (
            <article key={insumo.id} className="space-y-3 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700">
              <header className="flex items-baseline justify-between gap-3">
                <h3 className="text-xl font-black text-white">{insumo.nombre}</h3>
                <span className="text-base font-bold text-slate-300">
                  Vigente: {fmtCantidad(redondear(stockVigente(insumo, hoy), 1))} {insumo.unidad}
                </span>
              </header>

              {lotes.length === 0 ? (
                <p className="rounded-xl bg-slate-800 p-3 text-base font-bold text-red-300">Sin existencias</p>
              ) : (
                <ul className="space-y-2">
                  {lotes.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800 px-3 py-3">
                      <div className="min-w-0">
                        <p className="text-xl font-black tabular-nums text-white">
                          {fmtCantidad(l.cantidad)} {insumo.unidad}
                        </p>
                        <p className="text-sm text-slate-400">
                          {l.id} · vence {formatearFecha(l.fechaVencimiento)}
                        </p>
                      </div>
                      <SemaforoCaducidad dias={diasRestantes(l.fechaVencimiento, hoy)} />
                    </li>
                  ))}
                </ul>
              )}

              <SelectorNumerico
                etiqueta="Precio de compra actual"
                detalle={`Empaque de ${fmtNum(insumo.unidadesCompra)} ${insumo.unidad}`}
                valor={insumo.precioCompra}
                onCambiar={(v) => actualizarPrecio(insumo.id, v)}
                paso={0.5}
                min={0.5}
                max={2000}
                unidad="Bs"
                decimales={2}
              />
            </article>
          );
        })}
      </Seccion>
    </div>
  );
}

/* =============================================================================
 * 6. COMPONENTE RAÍZ
 * ============================================================================= */

export default function App() {
  const [hoy] = useState(hoyISO);
  const [pantalla, setPantalla] = useState<Pantalla>('costeo');
  const [insumos, setInsumos] = useState<Insumo[]>(() => crearInsumosDemo(hoy));
  const [receta, setReceta] = useState<Receta>(crearRecetaDemo);
  // Vive en la raíz para que la medición no se pierda al cambiar de pestaña.
  const [cronometro, setCronometro] = useState<CronometroActivo | null>(null);

  const iniciarCronometro = (actividadId: string) =>
    setCronometro({ actividadId, inicio: Date.now() });

  const detenerCronometro = () => {
    if (!cronometro) return;
    const minutos = minutosCronometrados(cronometro.inicio, Date.now());
    if (minutos > 0) {
      const { actividadId } = cronometro;
      setReceta((r) => ({
        ...r,
        actividades: r.actividades.map((a) =>
          a.id === actividadId ? { ...a, minutos: Math.min(600, minutos) } : a,
        ),
      }));
    }
    setCronometro(null);
  };

  const mapaInsumos = useMemo(
    () => new Map(insumos.map((i) => [i.id, i] as const)),
    [insumos],
  );
  const costos = useMemo(() => calcularCostos(receta, mapaInsumos), [receta, mapaInsumos]);
  const mpdPorTanda = useMemo(() => calcularMPD(receta.lineas, mapaInsumos), [receta, mapaInsumos]);

  const restaurarDemo = () => {
    setInsumos(crearInsumosDemo(hoy));
    setReceta(crearRecetaDemo());
    setCronometro(null);
  };

  const pestañas: ReadonlyArray<{ id: Pantalla; texto: string; Icono: LucideIcon }> = [
    { id: 'costeo', texto: 'Costeo', Icono: Calculator },
    { id: 'inventario', texto: 'Inventario', Icono: Package },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-950 text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-dulce-400 text-slate-950">
            <Cake className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="text-2xl font-black leading-none">GustoDulce</h1>
            <p className="text-sm font-semibold text-slate-400">Modo cocina · {formatearFecha(hoy)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={restaurarDemo}
          aria-label="Restaurar datos de demostración"
          className="btn-tactil grid h-14 w-14 place-items-center rounded-2xl bg-slate-800 text-slate-200 ring-1 ring-slate-700"
        >
          <RotateCcw className="h-7 w-7" />
        </button>
      </header>

      <main className="flex-1 px-4 pb-32 pt-5">
        {pantalla === 'costeo' ? (
          <PantallaCosteo
            receta={receta}
            setReceta={setReceta}
            insumos={mapaInsumos}
            costos={costos}
            cronometro={cronometro}
            onIniciarCronometro={iniciarCronometro}
            onDetenerCronometro={detenerCronometro}
          />
        ) : (
          <PantallaInventario
            insumos={insumos}
            setInsumos={setInsumos}
            receta={receta}
            hoy={hoy}
            mpdPorTanda={mpdPorTanda}
          />
        )}
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md gap-3 border-t border-slate-800 bg-slate-950 px-4 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {pestañas.map(({ id, texto, Icono }) => (
          <button
            key={id}
            type="button"
            aria-current={pantalla === id ? 'page' : undefined}
            onClick={() => setPantalla(id)}
            className={`btn-tactil flex min-h-16 flex-1 flex-col items-center justify-center rounded-2xl text-lg font-black ${
              pantalla === id ? 'bg-dulce-400 text-slate-950' : 'bg-slate-900 text-slate-300'
            }`}
          >
            <Icono className="h-7 w-7" strokeWidth={2.5} />
            {texto}
          </button>
        ))}
      </nav>
    </div>
  );
}
