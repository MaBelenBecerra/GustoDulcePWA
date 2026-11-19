










import {
  darDeBajaVencidos,
  ErrorDominio,
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
} from '../domain';
import type { RepositorioLocal, Vista } from '../infra/repositorio';


export const CONFIGURACION_ID = 'principal';



function coleccion<T>(docs: readonly Documento[], nombre: Coleccion): T[] {
  return docs
    .filter((d) => d.coleccion === nombre)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => d.datos as T);
}

export interface Catalogo {
  readonly insumos: Insumo[];
  readonly recetas: Receta[];
  readonly config: ConfiguracionCostos | null;
}

export function leerCatalogo(docs: readonly Documento[]): Catalogo {
  const config = docs.find((d) => d.coleccion === 'configuracion' && d.id === CONFIGURACION_ID);
  return {
    insumos: coleccion<Insumo>(docs, 'insumos'),
    recetas: coleccion<Receta>(docs, 'recetas'),
    config: config ? (config.datos as ConfiguracionCostos) : null,
  };
}

export interface Estado {
  readonly insumos: Insumo[];
  readonly recetas: Receta[];
  readonly config: ConfiguracionCostos;
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
    if (!catalogo.config) throw new ErrorDominio('CONFIGURACION_INVALIDA', 'No hay configuración de costos.');
    const proyeccion = proyectarInventario(movimientos);
    return { ...catalogo, config: catalogo.config, lotes: proyeccion.lotes, proyeccion, movimientos };
  }

  async estaVacio(): Promise<boolean> {
    return (await this.repo.db.documentos.count()) === 0;
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

  

  
  sembrar(semilla: Semilla): Promise<void> {
    return this.repo.ejecutarAtomico((vista) => {
      if (vista.documentos.length > 0) return { resultado: undefined };
      const documentos: Documento[] = [
        ...semilla.insumos.map((i) => this.documento(vista, 'insumos', i.id, i)),
        ...semilla.recetas.map((r) => this.documento(vista, 'recetas', r.id, r)),
        this.documento(vista, 'configuracion', CONFIGURACION_ID, semilla.configuracion),
      ];
      
      const movimientos = semilla.lotes.map((lote) =>
        movimientoCompra({ ...this.contexto(vista), nuevoId: () => `C-${lote.id}` }, lote),
      );
      return { documentos, movimientos, resultado: undefined };
    });
  }
}
