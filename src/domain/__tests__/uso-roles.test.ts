import { describe, expect, it } from 'vitest';
import { dividirDestacadas, listaAdministradoras, recetasPorUso, rolDe, usoPorReceta } from '..';
import type { CotizacionGuardada, Movimiento, Receta } from '..';

const receta = (id: string, nombre: string, archivada = false): Receta => ({
  id, nombre, porciones: 1, minutosElaboracion: 0, minutosHorneado: 0, ingredientes: [], archivada,
});
const consumo = (id: string, produccionId: string, recetaId: string): Movimiento => ({
  id, dispositivoId: 'd', registradoEn: '', lamport: 1, tipo: 'CONSUMO', loteId: 'L', cantidad: 1, costo: 1, produccionId, recetaId,
});
const cot = (recetaId: string): CotizacionGuardada => ({ id: recetaId + Math.random(), recetaId, porciones: 1, precioTotal: 1, cliente: '', fecha: '2026-01-01' });

describe('recetas más usadas', () => {
  it('cuenta producciones distintas (no cada consumo) y suma cotizaciones', () => {
    const uso = usoPorReceta(
      [consumo('1', 'P1', 'a'), consumo('2', 'P1', 'a'), consumo('3', 'P2', 'a'), consumo('4', 'P3', 'b')],
      [cot('b'), cot('b'), cot('c')],
    );
    expect(uso.get('a')).toBe(2);
    expect(uso.get('b')).toBe(3);
    expect(uso.get('c')).toBe(1);
  });

  it('ordena por uso, desempata por nombre y oculta las archivadas', () => {
    const recetas = [receta('a', 'Brownies'), receta('b', 'Alfajores'), receta('c', 'Cupcakes'), receta('d', 'Flan', true)];
    const orden = recetasPorUso(recetas, new Map([['c', 5], ['d', 9]]));
    expect(orden.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    const { destacadas, otras } = dividirDestacadas(orden);
    expect(destacadas.map((r) => r.id)).toEqual(['c', 'b']);
    expect(otras.map((r) => r.id)).toEqual(['a']);
  });
});

describe('roles', () => {
  it('reconoce a la administradora por correo sin importar mayúsculas', () => {
    const admins = listaAdministradoras(' Belustianabecerra@gmail.com , otra@x.com ,');
    expect(admins).toEqual(['belustianabecerra@gmail.com', 'otra@x.com']);
    expect(rolDe('BELUSTIANABECERRA@gmail.com', admins)).toBe('administradora');
    expect(rolDe('repostera@gmail.com', admins)).toBe('repostera');
    expect(rolDe(null, admins)).toBe('repostera');
  });
});
