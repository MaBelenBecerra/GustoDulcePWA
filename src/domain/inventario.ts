import { cantidadBruta } from './costeo';
import { compararFechas, diasRestantes, semaforo, SEVERIDAD_SEMAFORO } from './fechas';
import { asegurarNoNegativo, asegurarPositivo, sumaPrecisa, TOLERANCIA } from './numeros';
import { ErrorDominio, exito, fallo } from './tipos';
import type { FechaISO, Id, Insumo, Lote, Receta, Resultado, Semaforo } from './tipos';

export interface EstrategiaConsumo {
  readonly nombre: string;

  seleccionar(lotes: readonly Lote[], insumoId: Id, hoy: FechaISO): Lote[];
}

const compararTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const estrategiaFEFO: EstrategiaConsumo = {
  nombre: 'FEFO',
  seleccionar(lotes, insumoId, hoy) {
    return lotes
      .filter(
        (l) =>
          l.insumoId === insumoId &&
          l.cantidadDisponible > TOLERANCIA &&
          diasRestantes(l.fechaVencimiento, hoy) >= 0,
      )
      .sort(
        (a, b) =>
          compararFechas(a.fechaVencimiento, b.fechaVencimiento) ||
          compararFechas(a.fechaIngreso, b.fechaIngreso) ||
          compararTexto(a.id, b.id),
      );
  },
};

export interface Asignacion {
  readonly loteId: Id;
  readonly insumoId: Id;
  readonly cantidad: number;
  readonly costo: number;
}

export interface PlanConsumo {
  readonly insumoId: Id;
  readonly cantidadRequerida: number;
  readonly asignaciones: readonly Asignacion[];
  readonly costoTotal: number;
}

export interface Faltante {
  readonly insumoId: Id;
  readonly requerido: number;

  readonly disponible: number;
  readonly faltante: number;
}

export function planificarConsumo(
  lotes: readonly Lote[],
  insumoId: Id,
  cantidad: number,
  hoy: FechaISO,
  estrategia: EstrategiaConsumo = estrategiaFEFO,
): Resultado<PlanConsumo, Faltante> {
  asegurarNoNegativo(cantidad, 'Cantidad a consumir');
  const asignaciones: Asignacion[] = [];
  let restante = cantidad;

  for (const lote of estrategia.seleccionar(lotes, insumoId, hoy)) {
    if (restante <= TOLERANCIA) break;
    const x = Math.min(lote.cantidadDisponible, restante);
    asignaciones.push({ loteId: lote.id, insumoId, cantidad: x, costo: x * lote.costoUnitario });
    restante -= x;
  }

  if (restante > TOLERANCIA * Math.max(1, cantidad)) {
    const disponible = cantidad - restante;
    return fallo({ insumoId, requerido: cantidad, disponible, faltante: restante });
  }
  return exito({
    insumoId,
    cantidadRequerida: cantidad,
    asignaciones,
    costoTotal: sumaPrecisa(asignaciones.map((a) => a.costo)),
  });
}

export function aplicarPlanes(lotes: readonly Lote[], planes: readonly PlanConsumo[]): Lote[] {
  const descuento = new Map<Id, number>();
  for (const plan of planes) {
    for (const a of plan.asignaciones) {
      descuento.set(a.loteId, (descuento.get(a.loteId) ?? 0) + a.cantidad);
    }
  }
  return lotes.map((lote) => {
    const x = descuento.get(lote.id);
    if (x === undefined) return lote;
    const nuevo = lote.cantidadDisponible - x;
    if (nuevo < -TOLERANCIA * Math.max(1, lote.cantidadDisponible)) {
      throw new ErrorDominio('LOTE_INVALIDO', `El lote ${lote.id} quedaría con saldo negativo.`);
    }

    return { ...lote, cantidadDisponible: nuevo <= TOLERANCIA ? 0 : nuevo };
  });
}

export type ErrorProduccion =
  | { readonly tipo: 'STOCK_INSUFICIENTE'; readonly faltantes: readonly Faltante[] }
  | { readonly tipo: 'INSUMO_DESCONOCIDO'; readonly insumoId: Id };

export interface ResultadoProduccion {
  readonly lotes: Lote[];
  readonly planes: readonly PlanConsumo[];

  readonly costoMPDReal: number;
  readonly unidadesProducidas: number;
}

export interface SolicitudProduccion {
  readonly lotes: readonly Lote[];
  readonly receta: Receta;
  readonly insumos: ReadonlyMap<Id, Insumo>;

  readonly veces: number;
  readonly hoy: FechaISO;
  readonly estrategia?: EstrategiaConsumo;
}

export function consumoBrutoReceta(
  receta: Receta,
  insumos: ReadonlyMap<Id, Insumo>,
  veces: number,
): Resultado<Map<Id, number>, ErrorProduccion> {
  const consumo = new Map<Id, number>();
  for (const ing of receta.ingredientes) {
    const insumo = insumos.get(ing.insumoId);
    if (!insumo) return fallo({ tipo: 'INSUMO_DESCONOCIDO', insumoId: ing.insumoId });
    const bruto = cantidadBruta(ing.cantidad * veces, insumo.merma);
    consumo.set(ing.insumoId, (consumo.get(ing.insumoId) ?? 0) + bruto);
  }
  return exito(consumo);
}

export function producir(solicitud: SolicitudProduccion): Resultado<ResultadoProduccion, ErrorProduccion> {
  const { lotes, receta, insumos, veces, hoy, estrategia = estrategiaFEFO } = solicitud;
  if (!Number.isInteger(veces) || veces < 1) {
    throw new ErrorDominio('RECETA_INVALIDA', 'La producción debe ser un número entero de recetas (≥ 1).');
  }

  const consumo = consumoBrutoReceta(receta, insumos, veces);
  if (!consumo.ok) return consumo;

  const planes: PlanConsumo[] = [];
  const faltantes: Faltante[] = [];
  for (const [insumoId, cantidad] of consumo.valor) {
    const plan = planificarConsumo(lotes, insumoId, cantidad, hoy, estrategia);
    if (plan.ok) planes.push(plan.valor);
    else faltantes.push(plan.error);
  }
  if (faltantes.length > 0) return fallo({ tipo: 'STOCK_INSUFICIENTE', faltantes });

  return exito({
    lotes: aplicarPlanes(lotes, planes),
    planes,
    costoMPDReal: sumaPrecisa(planes.map((p) => p.costoTotal)),
    unidadesProducidas: receta.porciones * veces,
  });
}

export interface DatosCompra {
  readonly id: Id;

  readonly presentaciones: number;

  readonly precioPagado: number;
  readonly fechaIngreso: FechaISO;
  readonly fechaVencimiento: FechaISO;
}

export function registrarCompra(insumo: Insumo, compra: DatosCompra): Lote {
  asegurarPositivo(compra.presentaciones, 'Presentaciones compradas');
  asegurarNoNegativo(compra.precioPagado, 'Precio pagado');
  if (diasRestantes(compra.fechaVencimiento, compra.fechaIngreso) < 0) {
    throw new ErrorDominio('LOTE_INVALIDO', 'No se puede ingresar un lote que ya está vencido.');
  }
  const cantidad = compra.presentaciones * insumo.presentacion.cantidad;
  asegurarPositivo(cantidad, 'Cantidad del lote');
  return {
    id: compra.id,
    insumoId: insumo.id,
    cantidadInicial: cantidad,
    cantidadDisponible: cantidad,
    costoUnitario: compra.precioPagado / cantidad,
    fechaIngreso: compra.fechaIngreso,
    fechaVencimiento: compra.fechaVencimiento,
  };
}

export function agregarLote(lotes: readonly Lote[], lote: Lote): Lote[] {
  if (lotes.some((l) => l.id === lote.id)) {
    throw new ErrorDominio('LOTE_INVALIDO', `Ya existe un lote con id ${lote.id}.`);
  }
  return [...lotes, lote];
}

export interface ResumenInsumo {
  readonly insumoId: Id;

  readonly disponible: number;

  readonly vencido: number;
  readonly valorDisponible: number;
  readonly valorVencido: number;
  readonly proximoVencimiento: FechaISO | null;

  readonly semaforo: Semaforo | null;
  readonly lotesActivos: number;
}

export function resumenInsumo(lotes: readonly Lote[], insumoId: Id, hoy: FechaISO): ResumenInsumo {
  const conSaldo = lotes.filter((l) => l.insumoId === insumoId && l.cantidadDisponible > TOLERANCIA);
  const vigentes = conSaldo.filter((l) => diasRestantes(l.fechaVencimiento, hoy) >= 0);
  const vencidos = conSaldo.filter((l) => diasRestantes(l.fechaVencimiento, hoy) < 0);

  let peor: Semaforo | null = null;
  for (const l of conSaldo) {
    const s = semaforo(l.fechaVencimiento, hoy);
    if (peor === null || SEVERIDAD_SEMAFORO[s] > SEVERIDAD_SEMAFORO[peor]) peor = s;
  }

  const proximo = [...vigentes].sort((a, b) => compararFechas(a.fechaVencimiento, b.fechaVencimiento))[0];

  return {
    insumoId,
    disponible: sumaPrecisa(vigentes.map((l) => l.cantidadDisponible)),
    vencido: sumaPrecisa(vencidos.map((l) => l.cantidadDisponible)),
    valorDisponible: sumaPrecisa(vigentes.map((l) => l.cantidadDisponible * l.costoUnitario)),
    valorVencido: sumaPrecisa(vencidos.map((l) => l.cantidadDisponible * l.costoUnitario)),
    proximoVencimiento: proximo ? proximo.fechaVencimiento : null,
    semaforo: peor,
    lotesActivos: conSaldo.length,
  };
}

export interface MermaVencimiento {
  readonly loteId: Id;
  readonly insumoId: Id;
  readonly cantidad: number;
  readonly valor: number;
}

export interface ResultadoBaja {
  readonly lotes: Lote[];
  readonly mermas: readonly MermaVencimiento[];
  readonly valorTotal: number;
}

export function darDeBajaVencidos(lotes: readonly Lote[], hoy: FechaISO): ResultadoBaja {
  const mermas: MermaVencimiento[] = [];
  const nuevos = lotes.map((l) => {
    if (l.cantidadDisponible <= TOLERANCIA || diasRestantes(l.fechaVencimiento, hoy) >= 0) return l;
    mermas.push({
      loteId: l.id,
      insumoId: l.insumoId,
      cantidad: l.cantidadDisponible,
      valor: l.cantidadDisponible * l.costoUnitario,
    });
    return { ...l, cantidadDisponible: 0 };
  });
  return { lotes: nuevos, mermas, valorTotal: sumaPrecisa(mermas.map((m) => m.valor)) };
}
