/**
 * costeo.ts — Costeo ABC/TDABC determinista: MPD, MOD, CIF y precio sugerido.
 *
 * Los minutos de elaboración y horneado los ingresa la usuaria (no hay cronómetro).
 *   T_min  = S_mes / (días · horas · 60)          (tasa minutaria de MOD)
 *   C_MOD  = T_min · (t_elaboración + t_horneado)
 *   r_j    = CM_j / (días · horas · 60)           (tasa minutaria del servicio j)
 *   C_CIF  = Σ r_j · u_j   (u_j = minutos totales, o solo horneado para el gas)
 *   C_MPD  = Σ costo FEFO de Q_i / (1 − m_i)
 *   C_u    = (C_MPD + C_MOD + C_CIF) / N
 *   P_v    = C_u / (1 − g),   0 ≤ g < 1
 */
import { cantidadBruta, estrategiaFEFO, lotesDeInsumo, planificarSalida, type EstrategiaSalida } from './inventario';
import { EPSILON, asegurarFinito, asegurarNoNegativo, redondearBs, sumar } from './numeros';
import { compararFechas } from './fechas';
import type {
  BaseProrrateo,
  ConfigLaboral,
  Cotizacion,
  DesgloseCIF,
  DesgloseMPD,
  FechaISO,
  Insumo,
  LineaMPD,
  Lote,
  Receta,
  ServicioFijo,
} from './tipos';

/** Salario de referencia del MVP: 3300 Bs/mes, 24 días de 8 horas. */
export const CONFIG_LABORAL_POR_DEFECTO: ConfigLaboral = Object.freeze({
  salarioMensual: 3300,
  diasLaborablesMes: 24,
  horasPorDia: 8,
});

// ─────────────────────────── Validaciones ───────────────────────────

export function validarConfigLaboral(c: ConfigLaboral): ConfigLaboral {
  asegurarNoNegativo(c.salarioMensual, 'salario mensual');
  for (const [v, n] of [
    [c.diasLaborablesMes, 'días laborables'],
    [c.horasPorDia, 'horas por día'],
  ] as const) {
    asegurarFinito(v, n);
    if (v <= 0) throw new RangeError(`${n} debe ser mayor a cero`);
  }
  if (c.diasLaborablesMes > 31) throw new RangeError('Un mes no puede tener más de 31 días laborables');
  if (c.horasPorDia > 24) throw new RangeError('Un día no puede tener más de 24 horas');
  return c;
}

export function validarReceta(r: Receta): Receta {
  asegurarFinito(r.rendimiento, 'rendimiento');
  if (r.rendimiento <= 0) throw new RangeError(`La receta "${r.nombre}" debe rendir al menos 1 unidad`);
  asegurarNoNegativo(r.minutosElaboracion, 'minutos de elaboración');
  asegurarNoNegativo(r.minutosHorneado, 'minutos de horneado');
  for (const i of r.ingredientes) asegurarNoNegativo(i.cantidad, `cantidad de ${i.insumoId}`);
  return r;
}

// ─────────────────────────── MOD ───────────────────────────

export function minutosLaborablesMes(c: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO): number {
  validarConfigLaboral(c);
  return c.diasLaborablesMes * c.horasPorDia * 60;
}

/** T_min. Con la configuración por defecto: 3300 / 11 520 = 0,286458… Bs/min. */
export function tasaMinutoMOD(c: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO): number {
  return c.salarioMensual / minutosLaborablesMes(c);
}

export function minutosTotales(r: Receta): number {
  return r.minutosElaboracion + r.minutosHorneado;
}

export function costoMOD(r: Receta, c: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO): number {
  validarReceta(r);
  return tasaMinutoMOD(c) * minutosTotales(r);
}

// ─────────────────────────── CIF ───────────────────────────

export function tasaMinutoServicio(s: ServicioFijo, c: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO): number {
  asegurarNoNegativo(s.montoMensual, `monto de ${s.nombre}`);
  return s.montoMensual / minutosLaborablesMes(c);
}

/** Tasa CIF combinada por minuto de producción (suma de luz + agua + gas). */
export function tasaMinutoCIF(servicios: readonly ServicioFijo[], c: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO): number {
  return sumar(servicios.map((s) => tasaMinutoServicio(s, c)));
}

function minutosSegunBase(r: Receta, base: BaseProrrateo): number {
  return base === 'horneado' ? r.minutosHorneado : minutosTotales(r);
}

export function costoCIF(
  r: Receta,
  servicios: readonly ServicioFijo[],
  c: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO,
): DesgloseCIF {
  validarReceta(r);
  const lineas = servicios.map((s) => {
    const tasa = tasaMinutoServicio(s, c);
    const minutos = minutosSegunBase(r, s.aplicaA);
    return { servicioId: s.id, nombre: s.nombre, tasaPorMinuto: tasa, minutos, costo: tasa * minutos };
  });
  return { total: sumar(lineas.map((l) => l.costo)), lineas };
}

// ─────────────────────────── MPD ───────────────────────────

/** Bs por unidad base a partir de una compra: P_compra / U_compra. */
export function costoPorUnidadBase(precioCompra: number, cantidadCompra: number): number {
  asegurarNoNegativo(precioCompra, 'precio de compra');
  asegurarFinito(cantidadCompra, 'cantidad de compra');
  if (cantidadCompra <= EPSILON) throw new RangeError('La cantidad comprada debe ser mayor a cero');
  return precioCompra / cantidadCompra;
}

/** Último costo conocido de un insumo (lote ingresado más recientemente, aunque esté agotado). */
export function precioReferencia(lotes: readonly Lote[], insumoId: string): number | null {
  const propios = lotesDeInsumo(lotes, insumoId);
  if (propios.length === 0) return null;
  const masReciente = propios.reduce((a, b) => (compararFechas(b.fechaIngreso, a.fechaIngreso) > 0 ? b : a));
  return masReciente.costoUnitario;
}

/**
 * Costo de materia prima para UNA elaboración de la receta.
 * Se valoriza con el costo real de los lotes que FEFO consumiría hoy; si el
 * stock no alcanza, el remanente se valoriza al último precio conocido y la
 * línea queda marcada para que la UI lo advierta (nunca se inventa un costo).
 */
export function costoMPD(
  r: Receta,
  insumos: readonly Insumo[],
  lotes: readonly Lote[],
  hoy: FechaISO,
  estrategia: EstrategiaSalida = estrategiaFEFO,
): DesgloseMPD {
  validarReceta(r);
  const porId = new Map(insumos.map((i) => [i.id, i]));
  // Agregar por insumo: una misma línea de stock no puede costearse dos veces.
  const agregado = new Map<string, number>();
  for (const ing of r.ingredientes) agregado.set(ing.insumoId, (agregado.get(ing.insumoId) ?? 0) + ing.cantidad);

  const lineas: LineaMPD[] = [];
  for (const [insumoId, neta] of agregado) {
    const insumo = porId.get(insumoId);
    if (!insumo) throw new Error(`La receta "${r.nombre}" usa un insumo inexistente: ${insumoId}`);
    const bruta = cantidadBruta(neta, insumo.merma);

    const plan = planificarSalida(insumoId, bruta, lotes, hoy, estrategia);
    if (plan.ok) {
      lineas.push({ insumoId, nombre: insumo.nombre, cantidadNeta: neta, cantidadBruta: bruta, costo: plan.valor.costoTotal, origen: 'stock' });
      continue;
    }
    // Stock insuficiente: costear lo disponible y el resto a precio de referencia.
    const disponible = plan.error.disponible;
    const parcial = disponible > EPSILON ? planificarSalida(insumoId, disponible, lotes, hoy, estrategia) : null;
    const costoParcial = parcial?.ok ? parcial.valor.costoTotal : 0;
    const ref = precioReferencia(lotes, insumoId);
    const resto = bruta - disponible;
    lineas.push({
      insumoId,
      nombre: insumo.nombre,
      cantidadNeta: neta,
      cantidadBruta: bruta,
      costo: costoParcial + (ref ?? 0) * resto,
      origen: ref === null ? 'sin-precio' : disponible > EPSILON ? 'stock+referencia' : 'referencia',
    });
  }
  return { total: sumar(lineas.map((l) => l.costo)), lineas };
}

// ─────────────────────────── Precio ───────────────────────────

/** P_v = C_u / (1 − g). El margen es sobre el precio de venta, no sobre el costo. */
export function precioSugerido(costoUnitario: number, margen: number): number {
  asegurarNoNegativo(costoUnitario, 'costo unitario');
  asegurarFinito(margen, 'margen');
  if (margen < 0 || margen >= 1) throw new RangeError(`El margen debe cumplir 0 ≤ g < 1 (recibido: ${margen})`);
  return costoUnitario / (1 - margen);
}

export interface ParametrosCotizacion {
  readonly receta: Receta;
  readonly insumos: readonly Insumo[];
  readonly lotes: readonly Lote[];
  readonly servicios: readonly ServicioFijo[];
  readonly configLaboral?: ConfigLaboral;
  readonly margen: number;
  readonly unidades: number;
  readonly hoy: FechaISO;
}

export function cotizar(p: ParametrosCotizacion): Cotizacion {
  const config = p.configLaboral ?? CONFIG_LABORAL_POR_DEFECTO;
  const r = validarReceta(p.receta);
  if (!Number.isInteger(p.unidades) || p.unidades < 1) throw new RangeError('Las unidades pedidas deben ser un entero ≥ 1');

  const mpd = costoMPD(r, p.insumos, p.lotes, p.hoy);
  const mod = costoMOD(r, config);
  const cif = costoCIF(r, p.servicios, config);
  const costoReceta = sumar([mpd.total, mod, cif.total]);
  const costoUnitario = costoReceta / r.rendimiento;

  // Se redondea el precio unitario primero para que total = unitario × unidades cuadre al centavo.
  const precioUnitario = redondearBs(precioSugerido(costoUnitario, p.margen));
  const precioTotal = redondearBs(precioUnitario * p.unidades);
  const gananciaTotal = redondearBs(precioTotal - costoUnitario * p.unidades);

  const advertencias: string[] = [];
  for (const l of mpd.lineas) {
    if (l.origen === 'sin-precio') advertencias.push(`${l.nombre}: sin lotes registrados, costo tomado como 0 Bs.`);
    else if (l.origen !== 'stock') advertencias.push(`${l.nombre}: stock insuficiente, se usó el último precio de compra.`);
  }
  if (r.minutosElaboracion + r.minutosHorneado === 0) advertencias.push('La receta no tiene minutos cargados: MOD y CIF valen 0.');

  return {
    recetaId: r.id,
    unidades: p.unidades,
    margen: p.margen,
    mpd,
    mod,
    cif,
    costoReceta,
    costoUnitario,
    precioUnitario,
    precioTotal,
    gananciaTotal,
    advertencias,
  };
}
