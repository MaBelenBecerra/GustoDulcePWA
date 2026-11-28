import { describe, expect, it } from 'vitest';
import { calcularCostoReceta, cotizar, ErrorDominio, validarNombre } from '..';
import type { ConfiguracionCostos, Insumo, Receta } from '..';

const insumos = new Map<string, Insumo>([
  ['harina', { id: 'harina', nombre: 'Harina', unidad: 'g', presentacion: { cantidad: 1000, precio: 10 }, merma: 0 }],
  ['huevo', { id: 'huevo', nombre: 'Huevo', unidad: 'u', presentacion: { cantidad: 30, precio: 30 }, merma: 0 }],
]);
const receta: Receta = {
  id: 'torta',
  nombre: 'Torta',
  porciones: 10,
  minutosElaboracion: 40,
  minutosHorneado: 20,
  ingredientes: [
    { insumoId: 'harina', cantidad: 500 },
    { insumoId: 'huevo', cantidad: 4 },
  ],
};
const config: ConfiguracionCostos = { sueldoMensual: 3300, horasTrabajoMes: 110, servicios: { luz: 120, agua: 30, gas: 48 } };

describe('cotizar (sin margen de ganancia)', () => {
  it('cobra materia prima + costos indirectos + mano de obra, redondeado a Bs 0,50', () => {
    const q = cotizar(receta, insumos, config, 10);
    expect(q.materiaPrima).toBe(9);
    expect(q.manoDeObra).toBe(30);
    expect(q.costosIndirectos).toBe(1.8);
    expect(q.precioUnitarioComercial).toBe(4.5);
    expect(q.precioTotal).toBe(45);
    expect(q.ganancia).toBe(34.2);
    expect(q.redondeo).toBe(4.2);
  });

  it('la ganancia es la mano de obra cuando no hay redondeo', () => {
    const exacta: ConfiguracionCostos = { ...config, servicios: { luz: 0, agua: 0, gas: 0 } };
    const r: Receta = { ...receta, ingredientes: [{ insumoId: 'harina', cantidad: 1000 }] };
    const q = cotizar(r, insumos, exacta, 10);
    expect(q.precioTotal).toBe(40);
    expect(q.ganancia).toBe(q.manoDeObra);
    expect(q.redondeo).toBe(0);
  });

  it('escala con las porciones pedidas', () => {
    const q = cotizar(receta, insumos, config, 25);
    const costo = calcularCostoReceta(receta, insumos, config);
    expect(q.materiaPrima).toBeCloseTo(costo.mpd * 2.5, 2);
    expect(q.precioTotal).toBe(4.5 * 25);
  });

  it('rechaza porciones no enteras o menores a 1', () => {
    expect(() => cotizar(receta, insumos, config, 0)).toThrow(ErrorDominio);
    expect(() => cotizar(receta, insumos, config, 2.5)).toThrow(ErrorDominio);
  });
});

describe('validarNombre', () => {
  it('limpia espacios y exige 2 a 60 letras', () => {
    expect(validarNombre('  Torta   de coco ', 'x')).toBe('Torta de coco');
    expect(() => validarNombre('a', 'x')).toThrow(ErrorDominio);
    expect(() => validarNombre('x'.repeat(61), 'x')).toThrow(ErrorDominio);
  });
});
