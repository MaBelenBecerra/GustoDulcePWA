/**
 * demo.ts — Datos semilla para la demostración ante el jurado.
 *
 * Las fechas se generan RELATIVAS a "hoy" para que el semáforo siempre muestre
 * los tres estados (verde, amarillo, rojo) sin importar el día de la defensa.
 * Precios: referenciales de demostración en Bs, inspirados en compras minoristas
 * en mercados de Santa Cruz (Abasto / Mutualista). No son una cotización real.
 */
import {
  CONFIG_LABORAL_POR_DEFECTO,
  costoPorUnidadBase,
  crearLote,
  sumarDias,
  type ConfigLaboral,
  type FechaISO,
  type Insumo,
  type Lote,
  type Receta,
  type ServicioFijo,
} from '../domain';

export const INSUMOS_DEMO: readonly Insumo[] = [
  { id: 'harina', nombre: 'Harina 0000', unidad: 'g', merma: 0.02 },
  { id: 'azucar', nombre: 'Azúcar blanca', unidad: 'g', merma: 0 },
  { id: 'huevo', nombre: 'Huevo', unidad: 'unidad', merma: 0 },
  { id: 'mantequilla', nombre: 'Mantequilla', unidad: 'g', merma: 0.01 },
  { id: 'leche', nombre: 'Leche entera', unidad: 'ml', merma: 0 },
  { id: 'cacao', nombre: 'Cacao amargo', unidad: 'g', merma: 0 },
  { id: 'crema', nombre: 'Crema de leche', unidad: 'ml', merma: 0.03 },
  { id: 'frutilla', nombre: 'Frutilla', unidad: 'g', merma: 0.15 },
  { id: 'maicena', nombre: 'Maicena', unidad: 'g', merma: 0 },
  { id: 'dulce-leche', nombre: 'Dulce de leche', unidad: 'g', merma: 0.02 },
];

/** [id, insumo, cantidad comprada, precio pagado Bs, días desde ingreso, días hasta vencer] */
type SemillaLote = readonly [string, string, number, number, number, number];

const SEMILLA_LOTES: readonly SemillaLote[] = [
  ['L-HAR-01', 'harina', 1000, 9.5, -20, 40],
  ['L-HAR-02', 'harina', 5000, 45, -3, 90],
  ['L-AZU-01', 'azucar', 2000, 15, -10, 180],
  ['L-HUE-01', 'huevo', 12, 12, -6, 5], // amarillo: usar primero
  ['L-HUE-02', 'huevo', 30, 33, -1, 20],
  ['L-MAN-01', 'mantequilla', 200, 18, -15, -2], // rojo: vencido → merma
  ['L-MAN-02', 'mantequilla', 500, 42, -2, 25],
  ['L-LEC-01', 'leche', 1000, 7.5, -4, 3], // amarillo
  ['L-LEC-02', 'leche', 2000, 15, -1, 9],
  ['L-CAC-01', 'cacao', 250, 28, -30, 200],
  ['L-CRE-01', 'crema', 1000, 36, -5, 6], // amarillo
  ['L-FRU-01', 'frutilla', 500, 12, -4, -1], // rojo
  ['L-FRU-02', 'frutilla', 1000, 22, 0, 4], // amarillo
  ['L-MAI-01', 'maicena', 400, 9, -40, 300],
  ['L-DDL-01', 'dulce-leche', 1000, 32, -8, 45],
];

export function crearLotesDemo(hoy: FechaISO): Lote[] {
  return SEMILLA_LOTES.map(([id, insumoId, cantidad, precio, dIngreso, dVence]) =>
    crearLote({
      id,
      insumoId,
      cantidad,
      costoUnitario: costoPorUnidadBase(precio, cantidad),
      fechaIngreso: sumarDias(hoy, dIngreso),
      fechaVencimiento: sumarDias(hoy, dVence),
    }),
  );
}

export const RECETAS_DEMO: readonly Receta[] = [
  {
    id: 'torta-chocolate',
    nombre: 'Torta de chocolate',
    rendimiento: 12,
    minutosElaboracion: 60,
    minutosHorneado: 45,
    ingredientes: [
      { insumoId: 'harina', cantidad: 300 },
      { insumoId: 'azucar', cantidad: 250 },
      { insumoId: 'huevo', cantidad: 4 },
      { insumoId: 'mantequilla', cantidad: 150 },
      { insumoId: 'leche', cantidad: 240 },
      { insumoId: 'cacao', cantidad: 60 },
      { insumoId: 'crema', cantidad: 300 },
    ],
  },
  {
    id: 'torta-frutilla',
    nombre: 'Torta de frutilla con crema',
    rendimiento: 16,
    minutosElaboracion: 75,
    minutosHorneado: 40,
    ingredientes: [
      { insumoId: 'harina', cantidad: 250 },
      { insumoId: 'azucar', cantidad: 200 },
      { insumoId: 'huevo', cantidad: 6 },
      { insumoId: 'leche', cantidad: 120 },
      { insumoId: 'crema', cantidad: 500 },
      { insumoId: 'frutilla', cantidad: 400 },
      // Mismo insumo en dos pasos (bizcocho + almíbar): el motor los agrega.
      { insumoId: 'azucar', cantidad: 50 },
    ],
  },
  {
    id: 'alfajores',
    nombre: 'Alfajores de maicena',
    rendimiento: 24,
    minutosElaboracion: 90,
    minutosHorneado: 15,
    ingredientes: [
      { insumoId: 'maicena', cantidad: 300 },
      { insumoId: 'harina', cantidad: 200 },
      { insumoId: 'mantequilla', cantidad: 200 },
      { insumoId: 'azucar', cantidad: 150 },
      { insumoId: 'huevo', cantidad: 3 },
      { insumoId: 'dulce-leche', cantidad: 400 },
    ],
  },
];

export const SERVICIOS_DEMO: readonly ServicioFijo[] = [
  { id: 'luz', tipo: 'luz', nombre: 'Luz (CRE)', montoMensual: 180, aplicaA: 'total' },
  { id: 'agua', tipo: 'agua', nombre: 'Agua (cooperativa)', montoMensual: 60, aplicaA: 'total' },
  { id: 'gas', tipo: 'gas', nombre: 'Gas GLP / domiciliario', montoMensual: 45, aplicaA: 'horneado' },
];

export const CONFIG_LABORAL_DEMO: ConfigLaboral = CONFIG_LABORAL_POR_DEFECTO;
