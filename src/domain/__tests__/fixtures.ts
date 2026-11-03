import { crearLote } from '../inventario';
import type { FechaISO, Insumo, Lote, Receta, ServicioFijo } from '../tipos';

export const HOY: FechaISO = '2026-11-03';

export const harina: Insumo = { id: 'harina', nombre: 'Harina', unidad: 'g', merma: 0 };
export const huevo: Insumo = { id: 'huevo', nombre: 'Huevo', unidad: 'unidad', merma: 0 };
export const azucar: Insumo = { id: 'azucar', nombre: 'Azúcar', unidad: 'g', merma: 0 };
export const frutilla: Insumo = { id: 'frutilla', nombre: 'Frutilla', unidad: 'g', merma: 0.2 };

export const INSUMOS: Insumo[] = [harina, huevo, azucar, frutilla];

export function lote(
  id: string,
  insumoId: string,
  cantidad: number,
  costoUnitario: number,
  fechaVencimiento: FechaISO,
  fechaIngreso: FechaISO = '2026-10-01',
): Lote {
  return crearLote({ id, insumoId, cantidad, costoUnitario, fechaIngreso, fechaVencimiento });
}

export function receta(parcial: Partial<Receta> = {}): Receta {
  return {
    id: 'r1',
    nombre: 'Bizcocho',
    rendimiento: 10,
    ingredientes: [
      { insumoId: 'harina', cantidad: 500 },
      { insumoId: 'huevo', cantidad: 4 },
    ],
    minutosElaboracion: 40,
    minutosHorneado: 50,
    ...parcial,
  };
}

export const SERVICIOS: ServicioFijo[] = [
  { id: 'luz', tipo: 'luz', nombre: 'Luz', montoMensual: 230.4, aplicaA: 'total' },
  { id: 'agua', tipo: 'agua', nombre: 'Agua', montoMensual: 115.2, aplicaA: 'total' },
  { id: 'gas', tipo: 'gas', nombre: 'Gas', montoMensual: 57.6, aplicaA: 'horneado' },
];
