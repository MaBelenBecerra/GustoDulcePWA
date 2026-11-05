import { sumarDias, SUELDO_MINIMO_BS } from '../domain';
import type { ConfiguracionCostos, FechaISO, Insumo, Lote, Receta } from '../domain';

export const INSUMOS_DEMO: readonly Insumo[] = [
  { id: 'harina', nombre: 'Harina de trigo', unidad: 'g', presentacion: { cantidad: 1000, precio: 9 }, merma: 0.02 },
  { id: 'azucar', nombre: 'Azúcar blanca', unidad: 'g', presentacion: { cantidad: 1000, precio: 8 }, merma: 0 },
  { id: 'huevo', nombre: 'Huevo', unidad: 'u', presentacion: { cantidad: 30, precio: 32 }, merma: 0.03 },
  { id: 'mantequilla', nombre: 'Mantequilla', unidad: 'g', presentacion: { cantidad: 200, precio: 18 }, merma: 0.02 },
  { id: 'leche', nombre: 'Leche entera', unidad: 'ml', presentacion: { cantidad: 1000, precio: 8 }, merma: 0 },
  { id: 'cacao', nombre: 'Cacao en polvo', unidad: 'g', presentacion: { cantidad: 250, precio: 25 }, merma: 0 },
  { id: 'polvo', nombre: 'Polvo de hornear', unidad: 'g', presentacion: { cantidad: 100, precio: 6 }, merma: 0 },
];

export const RECETAS_DEMO: readonly Receta[] = [
  {
    id: 'torta-chocolate',
    nombre: 'Torta de chocolate',
    porciones: 12,
    minutosElaboracion: 50,
    minutosHorneado: 45,
    ingredientes: [
      { insumoId: 'harina', cantidad: 300 },
      { insumoId: 'azucar', cantidad: 250 },
      { insumoId: 'huevo', cantidad: 4 },
      { insumoId: 'mantequilla', cantidad: 150 },
      { insumoId: 'leche', cantidad: 240 },
      { insumoId: 'cacao', cantidad: 60 },
      { insumoId: 'polvo', cantidad: 10 },
    ],
  },
  {
    id: 'brownies',
    nombre: 'Brownies',
    porciones: 16,
    minutosElaboracion: 30,
    minutosHorneado: 30,
    ingredientes: [
      { insumoId: 'harina', cantidad: 120 },
      { insumoId: 'azucar', cantidad: 200 },
      { insumoId: 'huevo', cantidad: 3 },
      { insumoId: 'mantequilla', cantidad: 180 },
      { insumoId: 'cacao', cantidad: 80 },
    ],
  },
  {
    id: 'bizcochuelo',
    nombre: 'Bizcochuelo de vainilla',
    porciones: 10,
    minutosElaboracion: 25,
    minutosHorneado: 35,
    ingredientes: [
      { insumoId: 'harina', cantidad: 250 },
      { insumoId: 'azucar', cantidad: 200 },
      { insumoId: 'huevo', cantidad: 5 },
      { insumoId: 'leche', cantidad: 120 },
      { insumoId: 'polvo', cantidad: 8 },
    ],
  },
];

export const CONFIGURACION_DEMO: ConfiguracionCostos = {
  sueldoMensual: SUELDO_MINIMO_BS,
  horasTrabajoMes: 120,
  servicios: { luz: 180, agua: 60, gas: 45 },
};

export function crearLotesDemo(hoy: FechaISO): Lote[] {
  const lote = (
    id: string,
    insumoId: string,
    cantidad: number,
    costoUnitario: number,
    diasIngreso: number,
    diasVence: number,
  ): Lote => ({
    id,
    insumoId,
    cantidadInicial: cantidad,
    cantidadDisponible: cantidad,
    costoUnitario,
    fechaIngreso: sumarDias(hoy, -diasIngreso),
    fechaVencimiento: sumarDias(hoy, diasVence),
  });

  return [
    lote('L-harina-1', 'harina', 400, 0.0085, 40, 4),
    lote('L-harina-2', 'harina', 2000, 0.009, 5, 90),
    lote('L-azucar-1', 'azucar', 1800, 0.008, 20, 300),
    lote('L-huevo-1', 'huevo', 12, 1.0, 10, 3),
    lote('L-huevo-2', 'huevo', 30, 1.0667, 2, 20),
    lote('L-mant-1', 'mantequilla', 200, 0.09, 30, -2),
    lote('L-mant-2', 'mantequilla', 400, 0.09, 4, 25),
    lote('L-leche-1', 'leche', 1000, 0.008, 3, 6),
    lote('L-cacao-1', 'cacao', 250, 0.1, 15, 120),
    lote('L-polvo-1', 'polvo', 100, 0.06, 60, 180),
  ];
}