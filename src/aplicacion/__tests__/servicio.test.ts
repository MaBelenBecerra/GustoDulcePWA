import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { calcularMetricas, ErrorDominio } from '../../domain';
import { crearDatosPrueba } from '../../data/datos-prueba';
import { BaseLocal, RepositorioLocal } from '../../infra/repositorio';
import { ServicioGustoDulce } from '../servicio';

const HOY = '2026-11-27';
let n = 0;
let servicio: ServicioGustoDulce;

beforeEach(() => {
  n += 1;
  servicio = new ServicioGustoDulce(new RepositorioLocal(new BaseLocal(`prueba-${n}`)));
});

describe('cuenta nueva', () => {
  it('arranca vacía, con configuración inicial sin guardar', async () => {
    expect(await servicio.estaVacio()).toBe(true);
    const e = await servicio.estado();
    expect(e.insumos).toHaveLength(0);
    expect(e.recetas).toHaveLength(0);
    expect(e.configGuardada).toBe(false);
  });

  it('crea un insumo con su primera compra y luego una receta que lo usa', async () => {
    const harina = await servicio.crearInsumo({
      nombre: ' Harina  de trigo ', unidad: 'g', presentacionCantidad: 1000, precioPresentacion: 9,
      merma: 0.02, presentaciones: 2, diasVence: 60, hoy: HOY,
    });
    expect(harina.nombre).toBe('Harina de trigo');
    let e = await servicio.estado();
    expect(e.lotes).toHaveLength(1);
    expect(e.lotes[0]!.cantidadDisponible).toBe(2000);

    await expect(
      servicio.crearInsumo({ nombre: 'harina de trigo', unidad: 'g', presentacionCantidad: 1, precioPresentacion: 1, merma: 0, presentaciones: 0, diasVence: 1, hoy: HOY }),
    ).rejects.toThrow(ErrorDominio);

    const receta = await servicio.crearReceta({
      nombre: 'Pan dulce', porciones: 8, minutosElaboracion: 30, minutosHorneado: 25,
      ingredientes: [{ insumoId: harina.id, cantidad: 500 }],
    });
    await expect(
      servicio.crearReceta({ nombre: 'Vacía', porciones: 1, minutosElaboracion: 0, minutosHorneado: 0, ingredientes: [] }),
    ).rejects.toThrow(ErrorDominio);

    await servicio.archivarReceta(receta.id);
    e = await servicio.estado();
    expect(e.recetas[0]!.archivada).toBe(true);
  });

  it('guarda cotizaciones enviadas', async () => {
    await servicio.registrarCotizacion({ recetaId: 'x', porciones: 10, precioTotal: 120, cliente: 'Doña Rosa', fecha: HOY });
    expect((await servicio.estado()).cotizaciones).toHaveLength(1);
  });
});

describe('datos de prueba', () => {
  it('carga entre 150 y 300 registros coherentes, una sola vez', async () => {
    const resumen = await servicio.cargarDatosPrueba(crearDatosPrueba(HOY), HOY);
    expect(resumen.insumos).toBe(40);
    expect(resumen.recetas).toBe(30);
    expect(resumen.cotizaciones).toBe(35);
    expect(resumen.lotes).toBeGreaterThanOrEqual(80);
    expect(resumen.producciones).toBeGreaterThanOrEqual(10);
    expect(resumen.total).toBeGreaterThanOrEqual(150);
    expect(resumen.total).toBeLessThanOrEqual(400);

    const e = await servicio.estado();
    expect(e.proyeccion.sobregiros).toHaveLength(0);
    const m = calcularMetricas({ ...e, mermaAcumulada: 0, hoy: HOY });
    expect(m.registros).toBe(resumen.total);

    await expect(servicio.cargarDatosPrueba(crearDatosPrueba(HOY), HOY)).rejects.toThrow('ya están cargados');
  });

  it('no duplica un insumo que la repostera ya tenía con el mismo nombre', async () => {
    const mia = await servicio.crearInsumo({ nombre: 'HARINA DE TRIGO', unidad: 'g', presentacionCantidad: 1000, precioPresentacion: 12, merma: 0, presentaciones: 1, diasVence: 30, hoy: HOY });
    await servicio.cargarDatosPrueba(crearDatosPrueba(HOY), HOY);
    const e = await servicio.estado();
    expect(e.insumos.filter((i) => i.nombre.toLowerCase() === 'harina de trigo')).toHaveLength(1);
    expect(e.recetas.find((r) => r.id === 'torta-chocolate')!.ingredientes[0]!.insumoId).toBe(mia.id);
    expect(e.proyeccion.huerfanos).toHaveLength(0);
    expect(e.insumos).toHaveLength(40);
  });
});
