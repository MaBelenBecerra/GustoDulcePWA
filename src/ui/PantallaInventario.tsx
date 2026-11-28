import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { diasRestantes, formatearBs, resumenInsumo, semaforo, sumaPrecisa } from '../domain';
import type { FechaISO, Id, Insumo, Lote, UnidadBase } from '../domain';
import type { DatosInsumoNuevo } from '../aplicacion/servicio';
import {
  BotonPrincipal,
  CampoBusqueda,
  CampoTexto,
  ChipSemaforo,
  formatearCantidad,
  formatearFechaCorta,
  normalizarBusqueda,
  SelectorNumerico,
  SelectorOpciones,
  Tarjeta,
  textoDiasRestantes,
  TituloSeccion,
} from './comunes';

interface PropsInventario {
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  hoy: FechaISO;
  mermaAcumulada: number;
  onRegistrarCompra: (insumoId: Id, presentaciones: number, precioPorPresentacion: number, diasVence: number) => void;
  onCrearInsumo: (datos: DatosInsumoNuevo) => Promise<boolean>;
  onDarDeBaja: () => void;
}

export function PantallaInventario({ insumos, lotes, hoy, mermaAcumulada, onRegistrarCompra, onCrearInsumo, onDarDeBaja }: PropsInventario) {
  const [abierto, setAbierto] = useState<Id | null>(null);
  const [comprando, setComprando] = useState<Id | null>(null);
  const [creando, setCreando] = useState(insumos.length === 0);
  const [filtro, setFiltro] = useState('');

  const resumenes = useMemo(
    () => insumos.map((i) => ({ insumo: i, resumen: resumenInsumo(lotes, i.id, hoy) })),
    [insumos, lotes, hoy],
  );
  const valorVencido = sumaPrecisa(resumenes.map((r) => r.resumen.valorVencido));
  const visibles = filtro
    ? resumenes.filter((r) => normalizarBusqueda(r.insumo.nombre).includes(normalizarBusqueda(filtro)))
    : resumenes;

  return (
    <div className="flex flex-col gap-4">
      {creando ? (
        <FormularioInsumo
          hoy={hoy}
          primero={insumos.length === 0}
          onCancelar={insumos.length > 0 ? () => setCreando(false) : undefined}
          onGuardar={async (datos) => {
            if (await onCrearInsumo(datos)) setCreando(false);
          }}
        />
      ) : (
        <BotonPrincipal onClick={() => setCreando(true)} icono={<Plus size={24} aria-hidden />}>
          Agregar insumo nuevo
        </BotonPrincipal>
      )}

      {valorVencido > 0 && (
        <Tarjeta className="border-rojo-texto bg-rojo-fondo">
          <p className="mb-3 text-lg font-bold text-rojo-texto">
            Tienes {formatearBs(valorVencido)} en insumos vencidos. Retíralos de la despensa.
          </p>
          <BotonPrincipal onClick={onDarDeBaja} icono={<Trash2 size={24} aria-hidden />} variante="suave">
            Registrar como merma
          </BotonPrincipal>
        </Tarjeta>
      )}

      {mermaAcumulada > 0 && (
        <p className="px-1 text-base text-cafe-500">Merma acumulada por vencimientos: {formatearBs(mermaAcumulada)}</p>
      )}

      {insumos.length > 6 && <CampoBusqueda valor={filtro} onCambio={setFiltro} etiqueta={`Buscar entre ${insumos.length} insumos`} />}

      {visibles.map(({ insumo, resumen }) => {
        const expandido = abierto === insumo.id;
        const lotesInsumo = lotes
          .filter((l) => l.insumoId === insumo.id && l.cantidadDisponible > 0)
          .sort((a, b) => diasRestantes(a.fechaVencimiento, hoy) - diasRestantes(b.fechaVencimiento, hoy));

        return (
          <Tarjeta key={insumo.id}>
            <button
              type="button"
              onClick={() => setAbierto(expandido ? null : insumo.id)}
              aria-expanded={expandido}
              className="boton-tactil flex min-h-14 w-full items-center gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold text-cafe-900">{insumo.nombre}</p>
                <p className="text-lg text-cafe-700 tabular-nums">{formatearCantidad(resumen.disponible, insumo.unidad)} disponibles</p>
                {resumen.proximoVencimiento && (
                  <p className="text-base text-cafe-500">Próximo lote {textoDiasRestantes(diasRestantes(resumen.proximoVencimiento, hoy))}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {resumen.semaforo ? <ChipSemaforo estado={resumen.semaforo} /> : <span className="text-base font-bold text-cafe-500">Sin stock</span>}
                {expandido ? <ChevronUp size={28} className="text-cafe-700" aria-hidden /> : <ChevronDown size={28} className="text-cafe-700" aria-hidden />}
              </div>
            </button>

            {expandido && (
              <div className="mt-4 flex flex-col gap-3 border-t-2 border-crema-200 pt-4">
                {lotesInsumo.length === 0 && <p className="text-lg text-cafe-500">No hay lotes en la despensa.</p>}
                {lotesInsumo.map((l, indice) => {
                  const dias = diasRestantes(l.fechaVencimiento, hoy);
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-3 rounded-2xl bg-crema-50 p-3">
                      <div>
                        <p className="text-lg font-bold text-cafe-900 tabular-nums">{formatearCantidad(l.cantidadDisponible, insumo.unidad)}</p>
                        <p className="text-base text-cafe-700">
                          {formatearFechaCorta(l.fechaVencimiento)} · {textoDiasRestantes(dias)}
                        </p>
                        {indice === 0 && dias >= 0 && <p className="text-sm font-semibold text-cafe-500">Se usa primero</p>}
                      </div>
                      <ChipSemaforo estado={semaforo(l.fechaVencimiento, hoy)} />
                    </div>
                  );
                })}

                {comprando === insumo.id ? (
                  <FormularioCompra
                    insumo={insumo}
                    onCancelar={() => setComprando(null)}
                    onGuardar={(presentaciones, precio, dias) => {
                      onRegistrarCompra(insumo.id, presentaciones, precio, dias);
                      setComprando(null);
                    }}
                  />
                ) : (
                  <BotonPrincipal onClick={() => setComprando(insumo.id)} icono={<PackagePlus size={24} aria-hidden />}>
                    Registrar compra
                  </BotonPrincipal>
                )}
              </div>
            )}
          </Tarjeta>
        );
      })}

      {filtro && visibles.length === 0 && <p className="px-1 text-lg text-cafe-500">No hay insumos con ese nombre.</p>}
    </div>
  );
}

function FormularioCompra({
  insumo,
  onGuardar,
  onCancelar,
}: {
  insumo: Insumo;
  onGuardar: (presentaciones: number, precioPorPresentacion: number, diasVence: number) => void;
  onCancelar: () => void;
}) {
  const [presentaciones, setPresentaciones] = useState(1);
  const [precio, setPrecio] = useState(insumo.presentacion.precio);
  const [dias, setDias] = useState(30);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border-2 border-rosa-300 bg-rosa-100 p-4">
      <SelectorNumerico
        etiqueta={`Presentaciones de ${formatearCantidad(insumo.presentacion.cantidad, insumo.unidad)}`}
        valor={presentaciones}
        onCambio={setPresentaciones}
        min={1}
        max={99}
        paso={1}
        unidad="presentaciones"
      />
      <SelectorNumerico
        etiqueta="Precio pagado por presentación"
        valor={precio}
        onCambio={setPrecio}
        min={0}
        max={5000}
        paso={0.5}
        formato={formatearBs}
        unidad="Bs"
        ayuda={`Total de la compra: ${formatearBs(precio * presentaciones)}`}
      />
      <SelectorNumerico etiqueta="Días hasta que vence" valor={dias} onCambio={setDias} min={0} max={730} paso={1} formato={(v) => `${v} días`} unidad="días" />
      <BotonPrincipal onClick={() => onGuardar(presentaciones, precio, dias)} icono={<CheckCircle2 size={24} aria-hidden />}>
        Guardar compra
      </BotonPrincipal>
      <BotonPrincipal onClick={onCancelar} variante="suave">
        Cancelar
      </BotonPrincipal>
    </div>
  );
}

const UNIDADES: readonly { id: UnidadBase; nombre: string }[] = [
  { id: 'g', nombre: 'Gramos' },
  { id: 'ml', nombre: 'Mililitros' },
  { id: 'u', nombre: 'Unidades' },
];

const PRESENTACION_SUGERIDA: Readonly<Record<UnidadBase, number>> = { g: 1000, ml: 1000, u: 30 };

function FormularioInsumo({
  hoy,
  primero,
  onGuardar,
  onCancelar,
}: {
  hoy: FechaISO;
  primero: boolean;
  onGuardar: (datos: DatosInsumoNuevo) => void;
  onCancelar: (() => void) | undefined;
}) {
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState<UnidadBase>('g');
  const [cantidad, setCantidad] = useState(PRESENTACION_SUGERIDA.g);
  const [precio, setPrecio] = useState(10);
  const [merma, setMerma] = useState(0);
  const [presentaciones, setPresentaciones] = useState(1);
  const [dias, setDias] = useState(30);
  const [error, setError] = useState<string | undefined>();

  const guardar = () => {
    if (nombre.trim().length < 2) {
      setError('Escribe el nombre del insumo, por ejemplo "Harina de trigo".');
      return;
    }
    onGuardar({
      nombre,
      unidad,
      presentacionCantidad: cantidad,
      precioPresentacion: precio,
      merma: merma / 100,
      presentaciones,
      diasVence: dias,
      hoy,
    });
  };

  const textoUnidad = unidad === 'u' ? 'unidades' : unidad;

  return (
    <Tarjeta className="border-rosa-300 bg-rosa-100">
      <TituloSeccion>{primero ? 'Registra tu primer insumo' : 'Nuevo insumo'}</TituloSeccion>
      {primero && (
        <p className="mb-4 text-lg text-cafe-700">
          Empieza por lo que más usas: harina, azúcar, huevos… Anota cómo lo compras y cuánto pagaste.
        </p>
      )}
      <div className="flex flex-col gap-6">
        <CampoTexto
          etiqueta="Nombre del insumo"
          valor={nombre}
          onCambio={(v) => {
            setNombre(v);
            setError(undefined);
          }}
          error={error}
          placeholder="Ej.: Harina de trigo"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={60}
        />
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold text-cafe-700">¿Cómo lo mides en tus recetas?</span>
          <SelectorOpciones
            etiqueta="Unidad"
            horizontal
            opciones={UNIDADES}
            valor={unidad}
            onCambio={(u) => {
              setUnidad(u);
              setCantidad(PRESENTACION_SUGERIDA[u]);
            }}
          />
        </div>
        <SelectorNumerico
          etiqueta={`Contenido de cada paquete (${textoUnidad})`}
          valor={cantidad}
          onCambio={setCantidad}
          min={1}
          max={50000}
          paso={unidad === 'u' ? 1 : 50}
          formato={(v) => formatearCantidad(v, unidad)}
          unidad={textoUnidad}
          decimales={unidad === 'u' ? 0 : 1}
          ayuda="Ej.: bolsa de 1 kg = 1000 g, maple de 30 huevos = 30 u"
        />
        <SelectorNumerico etiqueta="Precio de cada paquete" valor={precio} onCambio={setPrecio} min={0} max={5000} paso={0.5} formato={formatearBs} unidad="Bs" />
        <SelectorNumerico
          etiqueta="Merma al usarlo (cáscara, lo que se pega)"
          valor={merma}
          onCambio={setMerma}
          min={0}
          max={90}
          paso={1}
          formato={(v) => `${v} %`}
          unidad="%"
          ayuda="Si no se pierde nada, déjalo en 0 %"
        />
        <div className="border-t-2 border-rosa-300 pt-5">
          <p className="mb-4 text-lg font-bold text-cafe-900">¿Cuánto tienes ahora en la despensa?</p>
          <div className="flex flex-col gap-6">
            <SelectorNumerico
              etiqueta="Paquetes que tienes"
              valor={presentaciones}
              onCambio={setPresentaciones}
              min={0}
              max={99}
              paso={1}
              unidad="paquetes"
              ayuda={presentaciones === 0 ? 'Se registra sin stock; podrás anotar la compra después.' : `Entran ${formatearCantidad(cantidad * presentaciones, unidad)} al inventario`}
            />
            {presentaciones > 0 && (
              <SelectorNumerico etiqueta="Días hasta que vence" valor={dias} onCambio={setDias} min={0} max={730} paso={1} formato={(v) => `${v} días`} unidad="días" />
            )}
          </div>
        </div>
        <BotonPrincipal onClick={guardar} icono={<CheckCircle2 size={24} aria-hidden />}>
          Guardar insumo
        </BotonPrincipal>
        {onCancelar && (
          <BotonPrincipal onClick={onCancelar} variante="suave">
            Cancelar
          </BotonPrincipal>
        )}
      </div>
    </Tarjeta>
  );
}
