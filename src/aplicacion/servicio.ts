










import {
  agregarLote,
  darDeBajaVencidos,
  ErrorDominio,
  SUELDO_MINIMO_BS,
  validarInsumo,
  validarNombre,
  movimientoCompra,
  movimientosBaja,
  movimientosProduccion,
  producir as producirDominio,
  proyectarInventario,
  registrarCompra as registrarCompraDominio,
  sumarDias,
  validarConfiguracion,
  validarReceta,
} from '../domain';
import type {
  Coleccion,
  ConfiguracionCostos,
  CotizacionGuardada,
  Contexto,
  Documento,
  ErrorProduccion,
  FechaISO,
  Id,
  Insumo,
  Lote,
  Movimiento,
  Proyeccion,
  Receta,
  Resultado,
  UnidadBase,
} from '../domain';
import type { RepositorioLocal, Vista } from '../infra/repositorio';


export const CONFIGURACION_ID = 'principal';

export const CONFIGURACION_INICIAL: ConfiguracionCostos = {
  sueldoMensual: SUELDO_MINIMO_BS,
  horasTrabajoMes: 120,
  servicios: { luz: 0, agua: 0, gas: 0 },
};



function coleccion<T>(docs: readonly Documento[], nombre: Coleccion): T[] {
  return docs
    .filter((d) => d.coleccion === nombre)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => d.datos as T);
}

export interface Catalogo {
  readonly insumos: Insumo[];
  readonly recetas: Receta[];
  readonly cotizaciones: CotizacionGuardada[];
  readonly config: ConfiguracionCostos | null;
}

export function leerCatalogo(docs: readonly Documento[]): Catalogo {
  const config = docs.find((d) => d.coleccion === 'configuracion' && d.id === CONFIGURACION_ID);
  return {
    insumos: coleccion<Insumo>(docs, 'insumos').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    recetas: coleccion<Receta>(docs, 'recetas'),
    cotizaciones: coleccion<CotizacionGuardada>(docs, 'cotizaciones'),
    config: config ? (config.datos as ConfiguracionCostos) : null,
  };
}

export interface Estado {
  readonly insumos: Insumo[];
  readonly recetas: Receta[];
  readonly cotizaciones: CotizacionGuardada[];
  readonly config: ConfiguracionCostos;
  readonly configGuardada: boolean;
  readonly lotes: Lote[];
  readonly proyeccion: Proyeccion;
  readonly movimientos: readonly Movimiento[];
}

export type ResultadoProducir = Resultado<
  { costoMPDReal: number; unidadesProducidas: number; produccionId: Id },
  ErrorProduccion
>;

export interface Semilla {
  readonly insumos: readonly Insumo[];
  readonly recetas: readonly Receta[];
  readonly configuracion: ConfiguracionCostos;
  readonly lotes: readonly Lote[];
  readonly cotizaciones: readonly CotizacionGuardada[];
  readonly producciones: readonly { readonly recetaId: Id; readonly veces: number }[];
}

export interface ResumenCarga {
  readonly insumos: number;
  readonly recetas: number;
  readonly lotes: number;
  readonly cotizaciones: number;
  readonly producciones: number;
  readonly consumos: number;
  readonly total: number;
}

export interface DatosInsumoNuevo {
  readonly nombre: string;
  readonly unidad: UnidadBase;
  readonly presentacionCantidad: number;
  readonly precioPresentacion: number;
  readonly merma: number;
  readonly presentaciones: number;
  readonly diasVence: number;
  readonly hoy: FechaISO;
}

export interface DatosRecetaNueva {
  readonly nombre: string;
  readonly porciones: number;
  readonly minutosElaboracion: number;
  readonly minutosHorneado: number;
  readonly ingredientes: readonly { readonly insumoId: Id; readonly cantidad: number }[];
}

export interface Reloj {
  ahora(): Date;
}



export class ServicioGustoDulce {
  private readonly repo: RepositorioLocal;
  private readonly reloj: Reloj;
  private readonly nuevoId: () => Id;

  constructor(repo: RepositorioLocal, reloj: Reloj = { ahora: () => new Date() }, nuevoId: () => Id = () => crypto.randomUUID()) {
    this.repo = repo;
    this.reloj = reloj;
    this.nuevoId = nuevoId;
  }

  private contexto(vista: Vista): Contexto {
    return {
      dispositivoId: vista.dispositivoId,
      registradoEn: this.reloj.ahora().toISOString(),
      lamport: vista.lamport,
      nuevoId: this.nuevoId,
    };
  }

  private documento<T>(vista: Vista, col: Coleccion, id: Id, datos: T): Documento<T> {
    return {
      coleccion: col,
      id,
      datos,
      version: vista.lamport,
      dispositivoId: vista.dispositivoId,
      actualizadoEn: this.reloj.ahora().toISOString(),
    };
  }

  

  async estado(): Promise<Estado> {
    const { movimientos, documentos } = await this.repo.leerTodo();
    const catalogo = leerCatalogo(documentos);
    const proyeccion = proyectarInventario(movimientos);
    return {
      ...catalogo,
      config: catalogo.config ?? CONFIGURACION_INICIAL,
      configGuardada: catalogo.config !== null,
      lotes: proyeccion.lotes,
      proyeccion,
      movimientos,
    };
  }

  async estaVacio(): Promise<boolean> {
    const [docs, movs] = await Promise.all([this.repo.db.documentos.count(), this.repo.db.movimientos.count()]);
    return docs === 0 && movs === 0;
  }

  

  registrarCompra(datos: {
    insumoId: Id;
    presentaciones: number;
    precioPorPresentacion: number;
    diasVence: number;
    hoy: FechaISO;
  }): Promise<Lote> {
    return this.repo.ejecutarAtomico((vista) => {
      const insumo = leerCatalogo(vista.documentos).insumos.find((i) => i.id === datos.insumoId);
      if (!insumo) throw new ErrorDominio('INSUMO_DESCONOCIDO', `No existe el insumo ${datos.insumoId}.`);
      const lote = registrarCompraDominio(insumo, {
        id: `L-${this.nuevoId()}`,
        presentaciones: datos.presentaciones,
        precioPagado: datos.precioPorPresentacion * datos.presentaciones,
        fechaIngreso: datos.hoy,
        fechaVencimiento: sumarDias(datos.hoy, datos.diasVence),
      });
      
      const actualizado: Insumo = { ...insumo, presentacion: { ...insumo.presentacion, precio: datos.precioPorPresentacion } };
      return {
        movimientos: [movimientoCompra(this.contexto(vista), lote)],
        documentos: [this.documento(vista, 'insumos', insumo.id, actualizado)],
        resultado: lote,
      };
    });
  }

  
  producir(datos: { recetaId: Id; veces: number; hoy: FechaISO }): Promise<ResultadoProducir> {
    return this.repo.ejecutarAtomico<ResultadoProducir>((vista) => {
      const catalogo = leerCatalogo(vista.documentos);
      const receta = catalogo.recetas.find((r) => r.id === datos.recetaId);
      if (!receta) throw new ErrorDominio('RECETA_INVALIDA', `No existe la receta ${datos.recetaId}.`);
      const r = producirDominio({
        lotes: proyectarInventario(vista.movimientos).lotes,
        receta,
        insumos: new Map(catalogo.insumos.map((i) => [i.id, i])),
        veces: datos.veces,
        hoy: datos.hoy,
      });
      if (!r.ok) return { resultado: r };
      const produccionId = `P-${this.nuevoId()}`;
      return {
        movimientos: movimientosProduccion(this.contexto(vista), produccionId, receta.id, r.valor.planes),
        resultado: {
          ok: true,
          valor: { costoMPDReal: r.valor.costoMPDReal, unidadesProducidas: r.valor.unidadesProducidas, produccionId },
        },
      };
    });
  }

  
  darDeBaja(hoy: FechaISO): Promise<number> {
    return this.repo.ejecutarAtomico((vista) => {
      const baja = darDeBajaVencidos(proyectarInventario(vista.movimientos).lotes, hoy);
      return { movimientos: movimientosBaja(this.contexto(vista), baja.mermas), resultado: baja.valorTotal };
    });
  }

  

  crearInsumo(datos: DatosInsumoNuevo): Promise<Insumo> {
    return this.repo.ejecutarAtomico((vista) => {
      const nombre = validarNombre(datos.nombre, 'del insumo');
      const catalogo = leerCatalogo(vista.documentos);
      if (catalogo.insumos.some((i) => i.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new ErrorDominio('NOMBRE_INVALIDO', `Ya tienes un insumo llamado "${nombre}".`);
      }
      const insumo: Insumo = {
        id: `i-${this.nuevoId()}`,
        nombre,
        unidad: datos.unidad,
        presentacion: { cantidad: datos.presentacionCantidad, precio: datos.precioPresentacion },
        merma: datos.merma,
      };
      validarInsumo(insumo);
      const movimientos: Movimiento[] = [];
      if (datos.presentaciones > 0) {
        const lote = registrarCompraDominio(insumo, {
          id: `L-${this.nuevoId()}`,
          presentaciones: datos.presentaciones,
          precioPagado: datos.precioPresentacion * datos.presentaciones,
          fechaIngreso: datos.hoy,
          fechaVencimiento: sumarDias(datos.hoy, datos.diasVence),
        });
        movimientos.push(movimientoCompra(this.contexto(vista), lote));
      }
      return { documentos: [this.documento(vista, 'insumos', insumo.id, insumo)], movimientos, resultado: insumo };
    });
  }

  crearReceta(datos: DatosRecetaNueva): Promise<Receta> {
    return this.repo.ejecutarAtomico((vista) => {
      const nombre = validarNombre(datos.nombre, 'de la receta');
      const catalogo = leerCatalogo(vista.documentos);
      if (catalogo.recetas.some((r) => !r.archivada && r.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new ErrorDominio('NOMBRE_INVALIDO', `Ya tienes una receta llamada "${nombre}".`);
      }
      const ids = new Set(catalogo.insumos.map((i) => i.id));
      const ingredientes = datos.ingredientes.filter((i) => i.cantidad > 0);
      if (ingredientes.length === 0) {
        throw new ErrorDominio('RECETA_INVALIDA', 'Agrega al menos un ingrediente con cantidad.');
      }
      if (new Set(ingredientes.map((i) => i.insumoId)).size !== ingredientes.length) {
        throw new ErrorDominio('RECETA_INVALIDA', 'Hay un ingrediente repetido en la receta.');
      }
      for (const ing of ingredientes) {
        if (!ids.has(ing.insumoId)) throw new ErrorDominio('INSUMO_DESCONOCIDO', 'La receta usa un insumo que no existe.');
      }
      const receta: Receta = {
        id: `r-${this.nuevoId()}`,
        nombre,
        porciones: datos.porciones,
        minutosElaboracion: datos.minutosElaboracion,
        minutosHorneado: datos.minutosHorneado,
        ingredientes,
      };
      validarReceta(receta);
      return { documentos: [this.documento(vista, 'recetas', receta.id, receta)], resultado: receta };
    });
  }

  archivarReceta(recetaId: Id): Promise<void> {
    return this.repo.ejecutarAtomico((vista) => {
      const receta = leerCatalogo(vista.documentos).recetas.find((r) => r.id === recetaId);
      if (!receta) throw new ErrorDominio('RECETA_INVALIDA', 'La receta ya no existe.');
      const archivada: Receta = { ...receta, archivada: true };
      return { documentos: [this.documento(vista, 'recetas', receta.id, archivada)], resultado: undefined };
    });
  }

  registrarCotizacion(datos: Omit<CotizacionGuardada, 'id'>): Promise<CotizacionGuardada> {
    return this.repo.ejecutarAtomico((vista) => {
      const cotizacion: CotizacionGuardada = { ...datos, cliente: datos.cliente.trim().slice(0, 60), id: `q-${this.nuevoId()}` };
      return { documentos: [this.documento(vista, 'cotizaciones', cotizacion.id, cotizacion)], resultado: cotizacion };
    });
  }

  guardarReceta(receta: Receta): Promise<void> {
    return this.repo.ejecutarAtomico((vista) => {
      validarReceta(receta);
      return { documentos: [this.documento(vista, 'recetas', receta.id, receta)], resultado: undefined };
    });
  }

  guardarConfiguracion(config: ConfiguracionCostos): Promise<void> {
    return this.repo.ejecutarAtomico((vista) => {
      validarConfiguracion(config);
      return { documentos: [this.documento(vista, 'configuracion', CONFIGURACION_ID, config)], resultado: undefined };
    });
  }

  

  cargarDatosPrueba(semilla: Semilla, hoy: FechaISO): Promise<ResumenCarga> {
    return this.repo.ejecutarAtomico<ResumenCarga>((vista) => {
      const existentes = new Set(vista.documentos.map((d) => `${d.coleccion}/${d.id}`));
      const lotesExistentes = new Set(proyectarInventario(vista.movimientos).lotes.map((l) => l.id));
      const lotesNuevos = semilla.lotes.filter((l) => !lotesExistentes.has(l.id));
      if (lotesNuevos.length === 0) {
        throw new ErrorDominio('MOVIMIENTO_INVALIDO', 'Los datos de prueba ya están cargados en esta cuenta.');
      }
      const ctx = this.contexto(vista);
      const catalogo = leerCatalogo(vista.documentos);
      const clave = (n: string) => n.trim().toLowerCase();

      const porNombre = new Map(catalogo.insumos.map((i) => [clave(i.nombre), i.id]));
      const equivalente = new Map<Id, Id>();
      for (const i of semilla.insumos) {
        const suyo = porNombre.get(clave(i.nombre));
        if (suyo && suyo !== i.id) equivalente.set(i.id, suyo);
      }
      const idReal = (id: Id) => equivalente.get(id) ?? id;

      const insumos = semilla.insumos.filter((i) => !equivalente.has(i.id) && !existentes.has(`insumos/${i.id}`));
      const nombresRecetas = new Set(catalogo.recetas.filter((r) => !r.archivada).map((r) => clave(r.nombre)));
      const recetas = semilla.recetas
        .filter((r) => !existentes.has(`recetas/${r.id}`) && !nombresRecetas.has(clave(r.nombre)))
        .map((r) => ({ ...r, ingredientes: r.ingredientes.map((ing) => ({ ...ing, insumoId: idReal(ing.insumoId) })) }));
      const cotizaciones = semilla.cotizaciones.filter((c) => !existentes.has(`cotizaciones/${c.id}`));
      insumos.forEach(validarInsumo);
      recetas.forEach(validarReceta);
      const documentos: Documento[] = [
        ...insumos.map((i) => this.documento(vista, 'insumos', i.id, i)),
        ...recetas.map((r) => this.documento(vista, 'recetas', r.id, r)),
        ...cotizaciones.map((c) => this.documento(vista, 'cotizaciones', c.id, c)),
      ];
      if (!existentes.has(`configuracion/${CONFIGURACION_ID}`)) {
        validarConfiguracion(semilla.configuracion);
        documentos.push(this.documento(vista, 'configuracion', CONFIGURACION_ID, semilla.configuracion));
      }

      const lotesAjustados = lotesNuevos.map((l) => ({ ...l, insumoId: idReal(l.insumoId) }));
      const movimientos: Movimiento[] = lotesAjustados.map((lote) =>
        movimientoCompra({ ...ctx, nuevoId: () => `C-${lote.id}` }, lote),
      );

      const mapaInsumos = new Map([...catalogo.insumos, ...insumos].map((i) => [i.id, i]));
      const mapaRecetas = new Map([...catalogo.recetas, ...recetas].map((r) => [r.id, r]));
      let lotes = proyectarInventario(vista.movimientos).lotes;
      for (const l of lotesAjustados) lotes = agregarLote(lotes, l);
      let producciones = 0;
      let consumos = 0;
      for (const p of semilla.producciones) {
        const receta = mapaRecetas.get(p.recetaId);
        if (!receta || receta.archivada) continue;
        const r = producirDominio({ lotes, receta, insumos: mapaInsumos, veces: p.veces, hoy });
        if (!r.ok) continue;
        lotes = r.valor.lotes;
        const nuevos = movimientosProduccion(ctx, `P-${this.nuevoId()}`, receta.id, r.valor.planes);
        movimientos.push(...nuevos);
        producciones += 1;
        consumos += nuevos.length;
      }

      const resumen: ResumenCarga = {
        insumos: insumos.length,
        recetas: recetas.length,
        lotes: lotesNuevos.length,
        cotizaciones: cotizaciones.length,
        producciones,
        consumos,
        total: documentos.length + movimientos.length,
      };
      return { documentos, movimientos, resultado: resumen };
    });
  }
}
