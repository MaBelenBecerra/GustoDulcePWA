import { describe, expect, it } from 'vitest';
import {
  calcularCIF,
  calcularCostoReceta,
  calcularMOD,
  calcularMPD,
  cantidadBruta,
  costoPorUnidadBase,
  cotizar,
  ErrorDominio,
  precioSugerido,
  tasaMinutoCIF,
  tasaMinutoMOD,
} from '../index';
import type { ConfiguracionCostos, Insumo, Receta } from '../index';

const harina: Insumo = { id: 'harina', nombre: 'Harina', unidad: 'g', presentacion: { cantidad: 1000, precio: 10 }, merma: 0 };
const azucar: Insumo = { id: 'azucar', nombre: 'Azúcar', unidad: 'g', presentacion: { cantidad: 1000, precio: 8 }, merma: 0 };
const huevo: Insumo = { id: 'huevo', nombre: 'Huevo', unidad: 'u', presentacion: { cantidad: 30, precio: 30 }, merma: 0 };

const insumos = new Map([harina, azucar, huevo].map((i) => [i.id, i]));

const bizcocho: Receta = {
  id: 'bizcocho',
  nombre: 'Bizcocho',
  porciones: 10,
  minutosElaboracion: 60,
  minutosHorneado: 30,
  ingredientes: [
    { insumoId: 'harina', cantidad: 500 },
    { insumoId: 'azucar', cantidad: 300 },
    { insumoId: 'huevo', cantidad: 4 },
  ],
};

const config: ConfiguracionCostos = {
  sueldoMensual: 3300,
  horasTrabajoMes: 120,
  servicios: { luz: 180, agua: 60, gas: 120 },
};

describe('MPD', () => {
  it('convierte la presentación a costo por unidad base', () => {
    expect(costoPorUnidadBase(harina)).toBeCloseTo(0.01, 12);
  });

  it('ajusta por merma: P / (U · (1 − m))', () => {
    expect(costoPorUnidadBase({ ...harina, merma: 0.2 })).toBeCloseTo(0.0125, 12);
    expect(cantidadBruta(160, 0.2)).toBeCloseTo(200, 12);
  });

  it('suma las líneas de la receta', () => {
    const mpd = calcularMPD(bizcocho, insumos);
    expect(mpd.total).toBeCloseTo(11.4, 10);
    expect(mpd.lineas).toHaveLength(3);
  });

  it('rechaza merma ≥ 1 e insumos inexistentes', () => {
    expect(() => costoPorUnidadBase({ ...harina, merma: 1 })).toThrow(ErrorDominio);
    const rota: Receta = { ...bizcocho, ingredientes: [{ insumoId: 'fantasma', cantidad: 1 }] };
    expect(() => calcularMPD(rota, insumos)).toThrow(/inexistente/);
  });
});

describe('MOD dinámica (horas reales configuradas)', () => {
  it('tarifa minutaria = 3300 / (60 · horas)', () => {
    expect(tasaMinutoMOD(config)).toBeCloseTo(3300 / 7200, 12);
    expect(calcularMOD(bizcocho, config)).toBeCloseTo(41.25, 10);
  });

  it('si trabaja más horas al mes, el minuto cuesta menos', () => {
    const masHoras = { ...config, horasTrabajoMes: 160 };
    expect(calcularMOD(bizcocho, masHoras)).toBeCloseTo(30.9375, 10);
    expect(tasaMinutoMOD(masHoras)).toBeLessThan(tasaMinutoMOD(config));
  });

  it('no presume jornada de 8 h: acepta valores irregulares', () => {
    expect(tasaMinutoMOD({ ...config, horasTrabajoMes: 37 })).toBeCloseTo(3300 / (60 * 37), 12);
  });

  it('rechaza 0 horas, horas negativas o más horas que las de un mes', () => {
    expect(() => tasaMinutoMOD({ ...config, horasTrabajoMes: 0 })).toThrow(ErrorDominio);
    expect(() => tasaMinutoMOD({ ...config, horasTrabajoMes: -5 })).toThrow(ErrorDominio);
    expect(() => tasaMinutoMOD({ ...config, horasTrabajoMes: 745 })).toThrow(ErrorDominio);
  });
});

describe('CIF promediado', () => {
  it('(luz + agua + gas) / (60 · horas) por minuto de receta', () => {
    expect(tasaMinutoCIF(config)).toBeCloseTo(0.05, 12);
    expect(calcularCIF(bizcocho, config)).toBeCloseTo(4.5, 10);
  });

  it('servicios en cero producen CIF cero', () => {
    const sinServicios = { ...config, servicios: { luz: 0, agua: 0, gas: 0 } };
    expect(calcularCIF(bizcocho, sinServicios)).toBe(0);
  });
});

describe('consolidado y precio', () => {
  it('costo total y unitario', () => {
    const c = calcularCostoReceta(bizcocho, insumos, config);
    expect(c.total).toBeCloseTo(57.15, 10);
    expect(c.unitario).toBeCloseTo(5.715, 10);
  });

  it('rechaza recetas con 0 porciones', () => {
    expect(() => calcularCostoReceta({ ...bizcocho, porciones: 0 }, insumos, config)).toThrow(ErrorDominio);
  });

  it('precio sugerido P = C / (1 − g)', () => {
    expect(precioSugerido(7, 0.3)).toBeCloseTo(10, 12);
    expect(precioSugerido(10, 0)).toBe(10);
  });

  it('rechaza márgenes fuera de [0, 1)', () => {
    expect(() => precioSugerido(10, 1)).toThrow(ErrorDominio);
    expect(() => precioSugerido(10, -0.1)).toThrow(ErrorDominio);
  });

  it('cotización con precio comercial redondeado a Bs 0,50', () => {
    const q = cotizar(bizcocho, insumos, config, 3, 0.3);
    expect(q.precioUnitario).toBe(8.16);
    expect(q.precioUnitarioComercial).toBe(8.5);
    expect(q.precioTotal).toBe(25.5);
    expect(q.costoTotal).toBeCloseTo(17.15, 2);
    expect(q.gananciaTotal).toBeCloseTo(25.5 - q.costoTotal, 10);
  });

  it('no cotiza 0 unidades ni fracciones', () => {
    expect(() => cotizar(bizcocho, insumos, config, 0, 0.3)).toThrow(ErrorDominio);
    expect(() => cotizar(bizcocho, insumos, config, 1.5, 0.3)).toThrow(ErrorDominio);
  });

  it('es determinista: misma entrada, misma salida', () => {
    expect(cotizar(bizcocho, insumos, config, 2, 0.4)).toEqual(cotizar(bizcocho, insumos, config, 2, 0.4));
  });
});
