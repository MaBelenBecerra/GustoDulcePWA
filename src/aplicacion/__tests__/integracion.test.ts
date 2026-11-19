




import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearSemilla } from '../../data/demo';
import { BaseLocal, RepositorioLocal } from '../../infra/repositorio';
import { ServicioGustoDulce } from '../servicio';
import { MotorSincronizacion, RemotoMemoria } from '../sincronizacion';

const HOY = '2026-11-17';
let n = 0;

function dispositivo(remoto = new RemotoMemoria()) {
  const repo = new RepositorioLocal(new BaseLocal(`disp-${++n}-${Math.random()}`));
  const servicio = new ServicioGustoDulce(repo, { ahora: () => new Date('2026-11-17T12:00:00Z') });
  return { repo, servicio, sync: new MotorSincronizacion(repo, remoto), remoto };
}

const stock = async (s: ServicioGustoDulce, insumo: string) =>
  (await s.estado()).lotes.filter((l) => l.insumoId === insumo).reduce((a, l) => a + l.cantidadDisponible, 0);

const compra = { insumoId: 'harina', presentaciones: 2, precioPorPresentacion: 10, diasVence: 60, hoy: HOY };

describe('Persistencia local en IndexedDB', () => {
  let d: ReturnType<typeof dispositivo>;
  beforeEach(async () => {
    d = dispositivo();
    await d.servicio.sembrar(crearSemilla(HOY));
  });

  it('los datos sobreviven a recargar la app (nueva instancia sobre la misma base)', async () => {
    await d.servicio.registrarCompra(compra);
    const otra = new ServicioGustoDulce(new RepositorioLocal(d.repo.db));
    expect(await stock(otra, 'harina')).toBe(2400 + 2000);
  });

  it('sembrar dos veces no duplica el catálogo ni el stock', async () => {
    await d.servicio.sembrar(crearSemilla(HOY));
    expect(await stock(d.servicio, 'harina')).toBe(2400);
  });

  it('la compra actualiza el precio de catálogo (costo de reposición)', async () => {
    await d.servicio.registrarCompra({ ...compra, presentaciones: 1, precioPorPresentacion: 11 });
    expect((await d.servicio.estado()).insumos.find((i) => i.id === 'harina')!.presentacion.precio).toBe(11);
  });

  it('una producción válida descuenta por FEFO y queda pendiente de respaldo', async () => {
    const pendientes = await d.repo.contarPendientes();
    const r = await d.servicio.producir({ recetaId: 'bizcochuelo', veces: 1, hoy: HOY });
    expect(r.ok).toBe(true);
    const lotes = (await d.servicio.estado()).lotes;
    
    expect(lotes.find((l) => l.id === 'L-harina-1')!.cantidadDisponible).toBeCloseTo(400 - 250 / 0.98, 6);
    expect(lotes.find((l) => l.id === 'L-harina-2')!.cantidadDisponible).toBe(2000);
    expect(await d.repo.contarPendientes()).toBe(pendientes + 5); 
  });

  it('la producción es atómica: si falta un insumo no se descuenta ninguno', async () => {
    await d.servicio.producir({ recetaId: 'torta-chocolate', veces: 1, hoy: HOY });
    const antes = await stock(d.servicio, 'harina');
    const pendientes = await d.repo.contarPendientes();
    
    const r = await d.servicio.producir({ recetaId: 'torta-chocolate', veces: 20, hoy: HOY });
    expect(r.ok).toBe(false);
    expect(await stock(d.servicio, 'harina')).toBe(antes);
    expect(await d.repo.contarPendientes()).toBe(pendientes);
  });

  it('un error de dominio aborta la transacción y no deja escrituras', async () => {
    const pendientes = await d.repo.contarPendientes();
    await expect(d.servicio.registrarCompra({ ...compra, presentaciones: -1 })).rejects.toThrow();
    expect(await d.repo.contarPendientes()).toBe(pendientes);
  });

  it('la baja por vencimiento lleva el lote a cero y registra la merma', async () => {
    const valor = await d.servicio.darDeBaja(HOY);
    expect(valor).toBeCloseTo(200 * 0.09, 9); 
    const e = await d.servicio.estado();
    expect(e.proyeccion.valorMerma).toBeCloseTo(18, 9);
    expect(e.lotes.find((l) => l.id === 'L-mant-1')!.cantidadDisponible).toBe(0);
  });
});

describe('Respaldo en la nube (sincronización idempotente)', () => {
  it('las operaciones sin conexión se respaldan cuando vuelve la red', async () => {
    const d = dispositivo();
    await d.servicio.sembrar(crearSemilla(HOY));
    d.remoto.fallarAlEnviar = 'antes';
    await d.servicio.registrarCompra(compra);
    await expect(d.sync.sincronizar()).rejects.toThrow(/Sin conexión/);
    expect(await d.repo.contarPendientes()).toBeGreaterThan(0);

    d.remoto.fallarAlEnviar = null;
    await d.sync.sincronizar();
    expect(await d.repo.contarPendientes()).toBe(0);
    expect(d.remoto.movimientos.size).toBe((await d.repo.leerTodo()).movimientos.length);
  });

  it('si se pierde la confirmación del servidor, el reenvío no duplica nada', async () => {
    const d = dispositivo();
    await d.servicio.sembrar(crearSemilla(HOY));
    await d.servicio.producir({ recetaId: 'brownies', veces: 1, hoy: HOY });
    d.remoto.fallarAlEnviar = 'despues';
    await expect(d.sync.sincronizar()).rejects.toThrow();
    d.remoto.fallarAlEnviar = null;
    await d.sync.sincronizar();
    await d.sync.sincronizar();
    expect(d.remoto.movimientos.size).toBe((await d.repo.leerTodo()).movimientos.length);
  });

  it('un teléfono nuevo reconstruye el inventario completo desde el respaldo', async () => {
    const servidor = new RemotoMemoria();
    const viejo = dispositivo(servidor);
    await viejo.servicio.sembrar(crearSemilla(HOY));
    await viejo.servicio.producir({ recetaId: 'brownies', veces: 2, hoy: HOY });
    await viejo.servicio.registrarCompra(compra);
    await viejo.sync.sincronizar();

    const nuevo = dispositivo(servidor);
    await nuevo.sync.sincronizar();
    expect((await nuevo.servicio.estado()).lotes).toEqual((await viejo.servicio.estado()).lotes);
  });

  it('el catálogo se resuelve por último escritor (LWW)', async () => {
    const servidor = new RemotoMemoria();
    const a = dispositivo(servidor);
    const b = dispositivo(servidor);
    await a.servicio.sembrar(crearSemilla(HOY));
    await a.sync.sincronizar();
    await b.sync.sincronizar();
    const receta = (await a.servicio.estado()).recetas.find((r) => r.id === 'brownies')!;
    await a.servicio.guardarReceta({ ...receta, porciones: 20 });
    await a.sync.sincronizar();
    await b.sync.sincronizar();
    await b.servicio.guardarReceta({ ...receta, porciones: 24 }); 
    await b.sync.sincronizar();
    await a.sync.sincronizar();
    for (const s of [a.servicio, b.servicio]) {
      expect((await s.estado()).recetas.find((r) => r.id === 'brownies')!.porciones).toBe(24);
    }
  });

  it('detecta el sobregiro si la operadora usó dos dispositivos sin conexión', async () => {
    const servidor = new RemotoMemoria();
    const a = dispositivo(servidor);
    const b = dispositivo(servidor);
    await a.servicio.sembrar(crearSemilla(HOY));
    await a.sync.sincronizar();
    await b.sync.sincronizar();
    
    for (const d of [a, b]) expect((await d.servicio.producir({ recetaId: 'bizcochuelo', veces: 2, hoy: HOY })).ok).toBe(true);
    await a.sync.sincronizar();
    const r = await b.sync.sincronizar();
    expect(r.sobregiros.map((x) => x.loteId)).toContain('L-huevo-1');
  });
});
