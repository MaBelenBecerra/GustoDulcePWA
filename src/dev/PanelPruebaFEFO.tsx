/**
 * PanelPruebaFEFO.tsx — Panel TEMPORAL de verificación manual (solo en desarrollo).
 *
 * Uso:
 *  1. Pulsa "Sembrar lotes".
 *  2. Pulsa una deducción.
 *  3. F12 → Application → IndexedDB → GustoDulceDB → lotes_inventario / movimientos_inventario
 *     (clic derecho en la tabla → Refresh si DevTools no se actualiza solo).
 *
 * Borra este archivo y su línea en App.tsx antes de la entrega.
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db, aRegistro } from '../data/db';
import { repositorioInventario } from '../data/repositorios/InventarioRepositorioDexie';
import { planificadorReferencia } from './planificadorReferencia';
import type { FechaISO, Insumo, Lote } from '../domain/tipos';
import type { ErrorSalida } from '../domain/puertos';

const INSUMO_ID = 'demo-harina';

/** Fecha LOCAL (no UTC): toISOString() correría el día después de las 20:00 en Bolivia. */
function fechaLocal(diasDesdeHoy: number): FechaISO {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` as FechaISO;
}

function loteDemo(id: string, dias: number, cantidad: number, costo: number): Lote {
  return {
    id,
    insumoId: INSUMO_ID,
    cantidadInicial: cantidad,
    cantidadDisponible: cantidad,
    costoUnitario: costo,
    fechaIngreso: fechaLocal(0),
    fechaVencimiento: fechaLocal(dias),
  };
}

function describirError(e: ErrorSalida): string {
  switch (e.tipo) {
    case 'faltante':
      return `Stock insuficiente: faltan ${e.faltante.faltante} g (hay ${e.faltante.disponible} g).`;
    case 'stock-insuficiente':
      return `El lote ${e.loteId} solo tiene ${e.disponible} g.`;
    case 'lote-no-encontrado':
      return `No existe el lote ${e.loteId}.`;
    case 'costo-desactualizado':
      return `El costo del lote ${e.loteId} cambió; recalcula el plan.`;
    case 'plan-invalido':
      return `Plan inválido: ${e.detalle}`;
  }
}

const bs = (n: number) => `Bs ${n.toFixed(2)}`;

export function PanelPruebaFEFO() {
  const [mensaje, setMensaje] = useState('Pulsa "1. Sembrar lotes" para empezar.');

  // useLiveQuery re-renderiza solo cuando cambian las tablas consultadas.
  const lotes = useLiveQuery(
    () => db.lotes_inventario.where('[insumoId+fechaVencimiento]')
      .between([INSUMO_ID, ''], [INSUMO_ID, '￿']).toArray(),
    [],
  );
  const movimientos = useLiveQuery(
    () => db.movimientos_inventario.where('insumoId').equals(INSUMO_ID).sortBy('fecha'),
    [],
  );

  async function sembrar() {
    await db.transaction('rw', db.insumos, db.lotes_inventario, db.movimientos_inventario, async () => {
      await db.lotes_inventario.where('insumoId').equals(INSUMO_ID).delete();
      await db.movimientos_inventario.where('insumoId').equals(INSUMO_ID).delete();
      await db.insumos.put(aRegistro<Insumo>({ id: INSUMO_ID, nombre: 'Harina (prueba)', unidad: 'g', merma: 0 }));
      // Insertados fuera de orden: el FEFO no depende del orden de ingreso.
      await db.lotes_inventario.bulkPut([
        aRegistro(loteDemo('demo-lote-C', 40, 500, 0.014)),
        aRegistro(loteDemo('demo-lote-A', 3, 1000, 0.012)),
        aRegistro(loteDemo('demo-lote-B', 15, 1000, 0.013)),
      ]);
    });
    setMensaje('Sembrado: A 1000 g (vence en 3 días), B 1000 g (15 días), C 500 g (40 días).');
  }

  async function descontar(cantidad: number) {
    const r = await repositorioInventario.descontarFEFO(
      INSUMO_ID, cantidad, planificadorReferencia, `Prueba manual ${cantidad} g`,
    );
    setMensaje(
      r.ok
        ? `✔ Descontados ${cantidad} g — costo de salida ${bs(r.valor.plan.costoTotal)} — tomas: ` +
            r.valor.plan.tomas.map((t) => `${t.loteId.replace('demo-', '')} ${t.cantidad} g`).join(', ')
        : `✘ Rechazado sin tocar la base. ${describirError(r.error)}`,
    );
  }

  async function concurrente() {
    const [r1, r2] = await Promise.all([
      repositorioInventario.descontarFEFO(INSUMO_ID, 800, planificadorReferencia, 'Concurrente #1'),
      repositorioInventario.descontarFEFO(INSUMO_ID, 800, planificadorReferencia, 'Concurrente #2'),
    ]);
    setMensaje(`Dos descuentos simultáneos de 800 g → #1 ${r1.ok ? 'OK' : 'rechazado'}, #2 ${r2.ok ? 'OK' : 'rechazado'}.`);
  }

  const boton =
    'min-h-14 min-w-14 rounded-xl px-5 text-lg font-bold text-white active:scale-95 transition';

  return (
    <section className="m-4 rounded-2xl border-4 border-dashed border-amber-500 bg-white p-4 text-neutral-900">
      <h2 className="mb-3 text-xl font-extrabold">🧪 Prueba FEFO (solo desarrollo)</h2>

      <div className="flex flex-wrap gap-3">
        <button className={`${boton} bg-neutral-800`} onClick={sembrar}>1. Sembrar lotes</button>
        <button className={`${boton} bg-emerald-700`} onClick={() => descontar(1500)}>2. Descontar 1500 g</button>
        <button className={`${boton} bg-red-700`} onClick={() => descontar(99_999)}>3. Pedir 99 999 g</button>
        <button className={`${boton} bg-indigo-700`} onClick={concurrente}>4. Dos a la vez (800 + 800)</button>
      </div>

      <p className="mt-4 rounded-lg bg-neutral-100 p-3 text-base font-semibold">{mensaje}</p>

      <table className="mt-4 w-full text-left text-base">
        <thead>
          <tr className="border-b-2 border-neutral-900">
            <th className="py-2">Lote</th><th>Vence</th><th className="text-right">Disponible</th><th className="text-right">Bs/g</th>
          </tr>
        </thead>
        <tbody>
          {(lotes ?? []).map((l) => (
            <tr key={l.id} className={`border-b ${l.cantidadDisponible === 0 ? 'text-neutral-400 line-through' : ''}`}>
              <td className="py-2 font-mono">{l.id.replace('demo-', '')}</td>
              <td>{l.fechaVencimiento}</td>
              <td className="text-right font-bold">{l.cantidadDisponible} g</td>
              <td className="text-right">{l.costoUnitario}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-sm text-neutral-600">
        Kardex: {movimientos?.length ?? 0} movimientos · pendientes de sincronizar:{' '}
        {(movimientos ?? []).filter((m) => m.pendienteSync === 1).length}
      </p>
    </section>
  );
}
