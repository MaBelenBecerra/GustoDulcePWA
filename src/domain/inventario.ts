/**
 * inventario.ts — Inventario multilote con salida FEFO
 * (First Expired, First Out: primero en vencer, primero en salir).
 *
 * Patrón Strategy: la política de salida es intercambiable (EstrategiaSalida).
 * El MVP usa exclusivamente `estrategiaFEFO`.
 *
 * Todas las funciones son PURAS: nunca mutan los lotes recibidos; devuelven
 * arreglos nuevos. Eso es lo que permite que la producción sea atómica.
 */
import { compararFechas, estaVencido, peorSemaforo, semaforoCaducidad } from './fechas';
import { EPSILON, asegurarFinito, asegurarNoNegativo, limpiarResiduo, sumar } from './numeros';
import {
  type BajaPorVencimiento,
  type Faltante,
  type FechaISO,
  type Insumo,
  type Lote,
  type PlanSalida,
  type Receta,
  type Resultado,
  type Semaforo,
  type TomaLote,
  exito,
  fallo,
} from './tipos';

// ─────────────────────────── Strategy ───────────────────────────

export interface EstrategiaSalida {
  readonly nombre: string;
  /** Devuelve, en orden de consumo, los lotes ELEGIBLES de la lista recibida. */
  ordenar(lotes: readonly Lote[], hoy: FechaISO): Lote[];
}

/**
 * FEFO: excluye lotes vencidos o vacíos y ordena por fecha de vencimiento
 * ascendente. Desempates deterministas: fecha de ingreso más antigua y luego id.
 */
export const estrategiaFEFO: EstrategiaSalida = {
  nombre: 'FEFO',
  ordenar(lotes, hoy) {
    return lotes
      .filter((l) => l.cantidadDisponible > EPSILON && !estaVencido(l.fechaVencimiento, hoy))
      .sort(
        (a, b) =>
          compararFechas(a.fechaVencimiento, b.fechaVencimiento) ||
          compararFechas(a.fechaIngreso, b.fechaIngreso) ||
          a.id.localeCompare(b.id),
      );
  },
};

// ─────────────────────────── Altas y validación ───────────────────────────

export interface DatosNuevoLote {
  readonly id: string;
  readonly insumoId: string;
  readonly cantidad: number;
  readonly costoUnitario: number;
  readonly fechaIngreso: FechaISO;
  readonly fechaVencimiento: FechaISO;
}

export function crearLote(d: DatosNuevoLote): Lote {
  asegurarFinito(d.cantidad, 'cantidad');
  if (d.cantidad <= EPSILON) throw new RangeError('La cantidad del lote debe ser mayor a cero');
  asegurarNoNegativo(d.costoUnitario, 'costo unitario');
  if (compararFechas(d.fechaVencimiento, d.fechaIngreso) < 0) {
    throw new RangeError('La fecha de vencimiento no puede ser anterior al ingreso');
  }
  return {
    id: d.id,
    insumoId: d.insumoId,
    cantidadInicial: d.cantidad,
    cantidadDisponible: d.cantidad,
    costoUnitario: d.costoUnitario,
    fechaIngreso: d.fechaIngreso,
    fechaVencimiento: d.fechaVencimiento,
  };
}

/** Q_bruta = Q_neta / (1 − m). Lo que sale de despensa para obtener Q útil. */
export function cantidadBruta(cantidadNeta: number, merma: number): number {
  asegurarNoNegativo(cantidadNeta, 'cantidad neta');
  asegurarFinito(merma, 'merma');
  if (merma < 0 || merma >= 1) throw new RangeError(`La merma debe cumplir 0 ≤ m < 1 (recibido: ${merma})`);
  return cantidadNeta / (1 - merma);
}

// ─────────────────────────── Consultas ───────────────────────────

export function lotesDeInsumo(lotes: readonly Lote[], insumoId: string): Lote[] {
  return lotes.filter((l) => l.insumoId === insumoId);
}

/** Stock que la estrategia permite consumir hoy (excluye vencidos). */
export function disponibleUtilizable(
  lotes: readonly Lote[],
  insumoId: string,
  hoy: FechaISO,
  estrategia: EstrategiaSalida = estrategiaFEFO,
): number {
  return sumar(estrategia.ordenar(lotesDeInsumo(lotes, insumoId), hoy).map((l) => l.cantidadDisponible));
}

export interface ResumenInsumo {
  readonly insumoId: string;
  readonly disponibleUtil: number;
  readonly disponibleVencido: number;
  /** Peor estado entre los lotes con existencias (null si no hay stock). */
  readonly semaforo: Semaforo | null;
  /** Valor en Bs del stock utilizable. */
  readonly valorStock: number;
}

export function resumirInsumo(lotes: readonly Lote[], insumoId: string, hoy: FechaISO): ResumenInsumo {
  const conStock = lotesDeInsumo(lotes, insumoId).filter((l) => l.cantidadDisponible > EPSILON);
  const utiles = conStock.filter((l) => !estaVencido(l.fechaVencimiento, hoy));
  const vencidos = conStock.filter((l) => estaVencido(l.fechaVencimiento, hoy));
  return {
    insumoId,
    disponibleUtil: sumar(utiles.map((l) => l.cantidadDisponible)),
    disponibleVencido: sumar(vencidos.map((l) => l.cantidadDisponible)),
    semaforo: peorSemaforo(conStock.map((l) => semaforoCaducidad(l.fechaVencimiento, hoy))),
    valorStock: sumar(utiles.map((l) => l.cantidadDisponible * l.costoUnitario)),
  };
}

// ─────────────────────────── Salidas ───────────────────────────

/**
 * Planifica (SIN aplicar) la salida de `cantidad` de un insumo.
 * x_j = min(q_j, max(0, Q − Σ_{i<j} q_i));  C_salida = Σ x_j · c_j
 */
export function planificarSalida(
  insumoId: string,
  cantidad: number,
  lotes: readonly Lote[],
  hoy: FechaISO,
  estrategia: EstrategiaSalida = estrategiaFEFO,
): Resultado<PlanSalida, Faltante> {
  asegurarNoNegativo(cantidad, 'cantidad solicitada');
  const orden = estrategia.ordenar(lotesDeInsumo(lotes, insumoId), hoy);
  const tomas: TomaLote[] = [];
  let restante = cantidad;

  for (const lote of orden) {
    if (restante <= EPSILON) break;
    const x = Math.min(lote.cantidadDisponible, restante);
    tomas.push({ loteId: lote.id, cantidad: x, costoUnitario: lote.costoUnitario, costo: x * lote.costoUnitario });
    restante = limpiarResiduo(restante - x);
  }

  if (restante > EPSILON) {
    const disponible = sumar(orden.map((l) => l.cantidadDisponible));
    return fallo({ insumoId, requerido: cantidad, disponible, faltante: cantidad - disponible });
  }
  return exito({ insumoId, cantidadSolicitada: cantidad, tomas, costoTotal: sumar(tomas.map((t) => t.costo)) });
}

/** Aplica planes ya validados. Pura: devuelve un arreglo NUEVO de lotes. */
export function aplicarPlanes(lotes: readonly Lote[], planes: readonly PlanSalida[]): Lote[] {
  const descuentos = new Map<string, number>();
  for (const p of planes) for (const t of p.tomas) descuentos.set(t.loteId, (descuentos.get(t.loteId) ?? 0) + t.cantidad);

  return lotes.map((l) => {
    const d = descuentos.get(l.id);
    if (d === undefined) return l;
    const nuevo = limpiarResiduo(l.cantidadDisponible - d);
    if (nuevo < -EPSILON) throw new Error(`Inconsistencia: el lote ${l.id} quedaría negativo`);
    return { ...l, cantidadDisponible: Math.max(0, nuevo) };
  });
}

/**
 * Necesidades BRUTAS de una receta, agregadas por insumo.
 * (Si la receta lista el mismo insumo dos veces, p. ej. azúcar para masa y
 * para glaseado, se suman ANTES de planificar; si no, ambas líneas "verían"
 * el mismo stock y se sobregiraría el lote.)
 */
export function necesidadesReceta(
  receta: Receta,
  insumos: readonly Insumo[],
  factor = 1,
): Map<string, number> {
  asegurarFinito(factor, 'factor');
  if (factor <= 0) throw new RangeError('El factor de producción debe ser mayor a cero');
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const necesidades = new Map<string, number>();
  for (const ing of receta.ingredientes) {
    const insumo = porId.get(ing.insumoId);
    if (!insumo) throw new Error(`La receta "${receta.nombre}" usa un insumo inexistente: ${ing.insumoId}`);
    const bruta = cantidadBruta(ing.cantidad * factor, insumo.merma);
    necesidades.set(ing.insumoId, (necesidades.get(ing.insumoId) ?? 0) + bruta);
  }
  return necesidades;
}

export interface ResultadoProduccion {
  readonly lotes: Lote[];
  readonly planes: readonly PlanSalida[];
  readonly costoMPD: number;
}

/**
 * Producción ATÓMICA: o se descuentan TODOS los ingredientes o no se descuenta
 * ninguno. Primero se planifica todo contra el estado original; solo si no hay
 * faltantes se aplica el conjunto completo.
 */
export function producir(
  receta: Receta,
  insumos: readonly Insumo[],
  lotes: readonly Lote[],
  hoy: FechaISO,
  factor = 1,
  estrategia: EstrategiaSalida = estrategiaFEFO,
): Resultado<ResultadoProduccion, { readonly faltantes: readonly Faltante[] }> {
  const planes: PlanSalida[] = [];
  const faltantes: Faltante[] = [];

  for (const [insumoId, cantidad] of necesidadesReceta(receta, insumos, factor)) {
    const r = planificarSalida(insumoId, cantidad, lotes, hoy, estrategia);
    if (r.ok) planes.push(r.valor);
    else faltantes.push(r.error);
  }

  if (faltantes.length > 0) return fallo({ faltantes });
  return exito({
    lotes: aplicarPlanes(lotes, planes),
    planes,
    costoMPD: sumar(planes.map((p) => p.costoTotal)),
  });
}

/** Lleva a cero los lotes vencidos con existencias y los reporta como merma financiera. */
export function darDeBajaVencidos(
  lotes: readonly Lote[],
  hoy: FechaISO,
): { lotes: Lote[]; bajas: BajaPorVencimiento[]; costoTotal: number } {
  const bajas: BajaPorVencimiento[] = [];
  const nuevos = lotes.map((l) => {
    if (l.cantidadDisponible <= EPSILON || !estaVencido(l.fechaVencimiento, hoy)) return l;
    bajas.push({
      loteId: l.id,
      insumoId: l.insumoId,
      cantidad: l.cantidadDisponible,
      costo: l.cantidadDisponible * l.costoUnitario,
    });
    return { ...l, cantidadDisponible: 0 };
  });
  return { lotes: nuevos, bajas, costoTotal: sumar(bajas.map((b) => b.costo)) };
}
