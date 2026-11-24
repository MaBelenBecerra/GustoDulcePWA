import { sumaPrecisa, TOLERANCIA } from './numeros';
import { exito, fallo } from './tipos';
import type { Id, Lote, Resultado } from './tipos';

interface Comun {
  
  readonly id: Id;
  readonly dispositivoId: Id;
  
  readonly registradoEn: string;
  
  readonly lamport: number;
}

export type Movimiento =
  | (Comun & { readonly tipo: 'COMPRA'; readonly lote: Lote })
  | (Comun & {
      readonly tipo: 'CONSUMO';
      readonly loteId: Id;
      readonly cantidad: number;
      readonly costo: number;
      
      readonly produccionId: Id;
      readonly recetaId: Id;
    })
  | (Comun & { readonly tipo: 'BAJA_VENCIMIENTO'; readonly loteId: Id; readonly cantidad: number; readonly valor: number });

export type TipoMovimiento = Movimiento['tipo'];


export interface Contexto {
  readonly dispositivoId: Id;
  readonly registradoEn: string;
  readonly lamport: number;
  
  readonly nuevoId: () => Id;
}

const comun = (ctx: Contexto) => ({
  id: ctx.nuevoId(),
  dispositivoId: ctx.dispositivoId,
  registradoEn: ctx.registradoEn,
  lamport: ctx.lamport,
});

export function movimientoCompra(ctx: Contexto, lote: Lote): Movimiento {
  return { ...comun(ctx), tipo: 'COMPRA', lote };
}

export function movimientosProduccion(
  ctx: Contexto,
  produccionId: Id,
  recetaId: Id,
  planes: readonly { readonly asignaciones: readonly { loteId: Id; cantidad: number; costo: number }[] }[],
): Movimiento[] {
  return planes.flatMap((p) =>
    p.asignaciones.map(
      (a): Movimiento => ({
        ...comun(ctx),
        tipo: 'CONSUMO',
        loteId: a.loteId,
        cantidad: a.cantidad,
        costo: a.costo,
        produccionId,
        recetaId,
      }),
    ),
  );
}

export function movimientosBaja(
  ctx: Contexto,
  mermas: readonly { loteId: Id; cantidad: number; valor: number }[],
): Movimiento[] {
  return mermas.map((m): Movimiento => ({ ...comun(ctx), tipo: 'BAJA_VENCIMIENTO', ...m }));
}

export interface ResultadoFusion {
  readonly movimientos: Movimiento[];
  
  readonly nuevos: Id[];
  
  readonly divergentes: Id[];
}

const huella = (m: Movimiento): string => JSON.stringify(m, Object.keys(m).sort());


export function fusionar(locales: readonly Movimiento[], remotos: readonly Movimiento[]): ResultadoFusion {
  const porId = new Map(locales.map((m) => [m.id, m]));
  const nuevos: Id[] = [];
  const divergentes: Id[] = [];
  for (const r of remotos) {
    const existente = porId.get(r.id);
    if (!existente) {
      porId.set(r.id, r);
      nuevos.push(r.id);
    } else if (huella(existente) !== huella(r)) {
      divergentes.push(r.id);
    }
  }
  return { movimientos: [...porId.values()], nuevos, divergentes };
}


export function ordenarMovimientos(movs: readonly Movimiento[]): Movimiento[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...movs].sort((a, b) => a.lamport - b.lamport || cmp(a.dispositivoId, b.dispositivoId) || cmp(a.id, b.id));
}


export interface Sobregiro {
  readonly loteId: Id;
  readonly insumoId: Id;
  
  readonly exceso: number;
}

export interface Proyeccion {
  
  readonly lotes: Lote[];
  readonly sobregiros: Sobregiro[];
  
  readonly huerfanos: Id[];
  
  readonly valorMerma: number;
}

export function proyectarInventario(movimientos: readonly Movimiento[]): Proyeccion {
  const base = new Map<Id, Lote>();
  for (const m of movimientos) if (m.tipo === 'COMPRA') base.set(m.lote.id, m.lote);

  const deltas = new Map<Id, number[]>();
  const huerfanos: Id[] = [];
  const mermas: number[] = [];
  for (const m of movimientos) {
    if (m.tipo === 'COMPRA') continue;
    if (!base.has(m.loteId)) {
      huerfanos.push(m.id);
      continue;
    }
    const lista = deltas.get(m.loteId) ?? [];
    lista.push(-m.cantidad);
    deltas.set(m.loteId, lista);
    if (m.tipo === 'BAJA_VENCIMIENTO') mermas.push(m.valor);
  }

  const lotes: Lote[] = [];
  const sobregiros: Sobregiro[] = [];
  for (const lote of base.values()) {
    const saldo = sumaPrecisa([lote.cantidadInicial, ...(deltas.get(lote.id) ?? [])]);
    if (saldo < -TOLERANCIA * Math.max(1, lote.cantidadInicial)) {
      sobregiros.push({ loteId: lote.id, insumoId: lote.insumoId, exceso: -saldo });
    }
    lotes.push({ ...lote, cantidadDisponible: saldo <= TOLERANCIA ? 0 : saldo });
  }
  lotes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { lotes, sobregiros, huerfanos, valorMerma: sumaPrecisa(mermas) };
}


export function validarMovimiento(m: Movimiento): Resultado<Movimiento, string> {
  if (!m.id || !m.dispositivoId) return fallo('Movimiento sin identificadores.');
  if (!Number.isInteger(m.lamport) || m.lamport < 0) return fallo('Reloj lógico inválido.');
  switch (m.tipo) {
    case 'COMPRA':
      if (!(m.lote.cantidadInicial > 0) || !(m.lote.costoUnitario >= 0)) return fallo('Lote inválido.');
      return exito(m);
    case 'CONSUMO':
    case 'BAJA_VENCIMIENTO':
      if (!(m.cantidad > 0) || !Number.isFinite(m.cantidad)) return fallo('Cantidad inválida.');
      return exito(m);
    default:
      return fallo('Tipo de movimiento desconocido.');
  }
}
