



















import { proyectarInventario, validarMovimiento } from '../domain';
import type { Documento, Movimiento, Sobregiro } from '../domain';
import type { RepositorioLocal } from '../infra/repositorio';

export interface Paquete {
  readonly movimientos: readonly Movimiento[];
  readonly documentos: readonly Documento[];
}


export interface RemotoSync {
  
  enviar(origen: string, paquete: Paquete): Promise<void>;
  
  recibir(cursor: string | null): Promise<{ paquete: Paquete; cursor: string | null }>;
}

export interface ResumenSync {
  readonly enviados: number;
  readonly recibidos: number;
  readonly documentosActualizados: number;
  readonly rechazados: number;
  readonly divergentes: readonly string[];
  readonly sobregiros: readonly Sobregiro[];
}

export class MotorSincronizacion {
  private enCurso: Promise<ResumenSync> | null = null;

  private readonly repo: RepositorioLocal;
  private readonly remoto: RemotoSync;

  constructor(repo: RepositorioLocal, remoto: RemotoSync) {
    this.repo = repo;
    this.remoto = remoto;
  }

  
  sincronizar(): Promise<ResumenSync> {
    if (!this.enCurso) {
      this.enCurso = this.ronda().finally(() => {
        this.enCurso = null;
      });
    }
    return this.enCurso;
  }

  private async ronda(): Promise<ResumenSync> {
    const dispositivo = await this.repo.dispositivoId();

    
    const pendientes = await this.repo.pendientes();
    if (pendientes.movimientos.length > 0 || pendientes.documentos.length > 0) {
      await this.remoto.enviar(dispositivo, pendientes);
      await this.repo.marcarSincronizados(
        pendientes.movimientos.map((m) => m.id),
        pendientes.documentos,
      );
    }

    
    const cursor = await this.repo.leerMeta<string | null>('cursorRemoto', null);
    const { paquete, cursor: siguiente } = await this.remoto.recibir(cursor);
    const validos = paquete.movimientos.filter((m) => validarMovimiento(m).ok);
    const aplicado = await this.repo.aplicarRemotos(validos, paquete.documentos, siguiente);

    
    const { movimientos } = await this.repo.leerTodo();
    const { sobregiros } = proyectarInventario(movimientos);

    return {
      enviados: pendientes.movimientos.length + pendientes.documentos.length,
      recibidos: aplicado.nuevos,
      documentosActualizados: aplicado.documentosActualizados,
      rechazados: paquete.movimientos.length - validos.length,
      divergentes: aplicado.divergentes,
      sobregiros,
    };
  }
}








export class RemotoMemoria implements RemotoSync {
  private secuencia = 0;
  readonly movimientos = new Map<string, { seq: number; m: Movimiento }>();
  readonly documentos = new Map<string, { seq: number; d: Documento }>();
  
  fallarAlEnviar: 'antes' | 'despues' | null = null;
  fallarAlRecibir = false;

  async enviar(_origen: string, paquete: Paquete): Promise<void> {
    if (this.fallarAlEnviar === 'antes') throw new Error('Sin conexión');
    for (const m of paquete.movimientos) {
      if (!this.movimientos.has(m.id)) this.movimientos.set(m.id, { seq: ++this.secuencia, m });
    }
    for (const d of paquete.documentos) {
      const clave = `${d.coleccion}/${d.id}`;
      const actual = this.documentos.get(clave);
      const gana = !actual || d.version > actual.d.version || (d.version === actual.d.version && d.dispositivoId > actual.d.dispositivoId);
      if (gana) this.documentos.set(clave, { seq: ++this.secuencia, d });
    }
    
    if (this.fallarAlEnviar === 'despues') throw new Error('Se perdió la confirmación');
  }

  async recibir(cursor: string | null): Promise<{ paquete: Paquete; cursor: string | null }> {
    if (this.fallarAlRecibir) throw new Error('Sin conexión');
    const desde = cursor === null ? 0 : Number(cursor);
    const movimientos = [...this.movimientos.values()].filter((x) => x.seq > desde).map((x) => x.m);
    const documentos = [...this.documentos.values()].filter((x) => x.seq > desde).map((x) => x.d);
    return { paquete: { movimientos, documentos }, cursor: String(this.secuencia) };
  }
}
