import { useEffect, useId, useMemo, useState } from 'react';
import { Archive, BookPlus, CheckCircle2, Flame, Package, Plus, Trash2 } from 'lucide-react';
import { calcularCostoReceta, dividirDestacadas, resumenInsumo } from '../domain';
import type { ConfiguracionCostos, FechaISO, Id, Insumo, Lote, Receta } from '../domain';
import type { DatosRecetaNueva } from '../aplicacion/servicio';
import {
  BotonPrincipal,
  CampoTexto,
  ChipSemaforo,
  FilaMonto,
  formatearCantidad,
  pasoPorUnidad,
  SelectorNumerico,
  SelectorReceta,
  Tarjeta,
  TituloSeccion,
} from './comunes';

interface PropsRecetas {
  recetas: readonly Receta[];
  insumos: readonly Insumo[];
  lotes: readonly Lote[];
  config: ConfiguracionCostos;
  hoy: FechaISO;
  onActualizar: (recetaId: Id, cambio: (r: Receta) => Receta) => void;
  onCrear: (datos: DatosRecetaNueva) => Promise<Receta | null>;
  onArchivar: (recetaId: Id) => Promise<void>;
  onProducir: (recetaId: Id, veces: number) => void;
  onIrInventario: () => void;
}

export function PantallaRecetas({ recetas, insumos, lotes, config, hoy, onActualizar, onCrear, onArchivar, onProducir, onIrInventario }: PropsRecetas) {
  const [recetaId, setRecetaId] = useState<Id>(recetas[0]?.id ?? '');
  const [veces, setVeces] = useState(1);
  const [creando, setCreando] = useState(recetas.length === 0);
  const mapaInsumos = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const receta = recetas.find((r) => r.id === recetaId) ?? recetas[0];
  const { destacadas, otras } = dividirDestacadas(recetas);

  if (insumos.length === 0) {
    return (
      <Tarjeta>
        <TituloSeccion>Primero, tus insumos</TituloSeccion>
        <p className="mb-4 text-lg text-cafe-700">Para armar una receta necesitas registrar al menos un insumo en tu inventario.</p>
        <BotonPrincipal onClick={onIrInventario} icono={<Package size={24} aria-hidden />}>
          Ir a Inventario
        </BotonPrincipal>
      </Tarjeta>
    );
  }

  if (creando || !receta) {
    return (
      <FormularioReceta
        insumos={insumos}
        primera={recetas.length === 0}
        onCancelar={recetas.length > 0 ? () => setCreando(false) : undefined}
        onGuardar={async (datos) => {
          const nueva = await onCrear(datos);
          if (nueva) {
            setRecetaId(nueva.id);
            setCreando(false);
          }
        }}
      />
    );
  }

  const costo = calcularCostoReceta(receta, mapaInsumos, config);
  const cambiar = (cambio: (r: Receta) => Receta) => onActualizar(receta.id, cambio);
  const sinUsar = insumos.filter((i) => !receta.ingredientes.some((ing) => ing.insumoId === i.id));

  return (
    <div className="flex flex-col gap-4">
      <BotonPrincipal onClick={() => setCreando(true)} icono={<BookPlus size={24} aria-hidden />}>
        Crear receta nueva
      </BotonPrincipal>

      <Tarjeta>
        <TituloSeccion>Elige una receta</TituloSeccion>
        <SelectorReceta etiqueta="Receta" destacadas={destacadas} otras={otras} valor={receta.id} onCambio={setRecetaId} />
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Tiempos y rendimiento</TituloSeccion>
        <div className="flex flex-col gap-6">
          <SelectorNumerico
            etiqueta="Minutos de elaboración y decorado"
            valor={receta.minutosElaboracion}
            onCambio={(v) => cambiar((r) => ({ ...r, minutosElaboracion: v }))}
            min={0}
            max={600}
            paso={5}
            formato={(v) => `${v} min`}
            unidad="minutos"
          />
          <SelectorNumerico
            etiqueta="Minutos de horneado"
            valor={receta.minutosHorneado}
            onCambio={(v) => cambiar((r) => ({ ...r, minutosHorneado: v }))}
            min={0}
            max={600}
            paso={5}
            formato={(v) => `${v} min`}
            unidad="minutos"
          />
          <SelectorNumerico
            etiqueta="Porciones que rinde"
            valor={receta.porciones}
            onCambio={(v) => cambiar((r) => ({ ...r, porciones: v }))}
            min={1}
            max={200}
            paso={1}
            unidad="porciones"
          />
        </div>
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Ingredientes</TituloSeccion>
        <div className="flex flex-col gap-6">
          {receta.ingredientes.map((ing, indice) => {
            const insumo = mapaInsumos.get(ing.insumoId);
            if (!insumo) return null;
            const estado = resumenInsumo(lotes, insumo.id, hoy).semaforo;
            return (
              <div key={ing.insumoId} className="flex flex-col gap-2">
                {estado === 'amarillo' && (
                  <span className="self-start">
                    <ChipSemaforo estado="amarillo" />
                  </span>
                )}
                <SelectorNumerico
                  etiqueta={insumo.nombre}
                  valor={ing.cantidad}
                  onCambio={(v) =>
                    cambiar((r) => ({
                      ...r,
                      ingredientes: r.ingredientes.map((x, i) => (i === indice ? { ...x, cantidad: v } : x)),
                    }))
                  }
                  min={0}
                  max={insumo.unidad === 'u' ? 60 : 10000}
                  paso={pasoPorUnidad(insumo.unidad)}
                  formato={(v) => formatearCantidad(v, insumo.unidad)}
                  unidad={insumo.unidad === 'u' ? 'unidades' : insumo.unidad}
                  decimales={insumo.unidad === 'u' ? 0 : 1}
                />
                {receta.ingredientes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => cambiar((r) => ({ ...r, ingredientes: r.ingredientes.filter((_, i) => i !== indice) }))}
                    className="boton-tactil flex min-h-12 items-center gap-2 self-end rounded-xl px-3 text-base font-semibold text-rojo-texto"
                  >
                    <Trash2 size={20} aria-hidden /> Quitar {insumo.nombre.toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}
          {sinUsar.length > 0 && (
            <AgregarIngrediente
              insumos={sinUsar}
              onAgregar={(insumoId, cantidad) => cambiar((r) => ({ ...r, ingredientes: [...r.ingredientes, { insumoId, cantidad }] }))}
            />
          )}
        </div>
      </Tarjeta>

      <Tarjeta className="border-rosa-300 bg-rosa-100">
        <TituloSeccion>Costo de esta receta</TituloSeccion>
        <FilaMonto etiqueta="Materia prima" valor={costo.mpd} />
        <FilaMonto etiqueta="Mi mano de obra" valor={costo.mod} />
        <FilaMonto etiqueta="Luz, agua y gas" valor={costo.cif} />
        <div className="my-2 border-t-2 border-rosa-300" />
        <FilaMonto etiqueta="Costo total" valor={costo.total} fuerte />
        <FilaMonto etiqueta="Costo por porción" valor={costo.unitario} fuerte />
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Producir</TituloSeccion>
        <div className="flex flex-col gap-5">
          <SelectorNumerico
            etiqueta="Veces que preparo la receta"
            valor={veces}
            onCambio={setVeces}
            min={1}
            max={20}
            paso={1}
            unidad="veces"
            ayuda={`Saldrán ${receta.porciones * veces} porciones`}
          />
          <BotonPrincipal onClick={() => onProducir(receta.id, veces)} icono={<Flame size={24} aria-hidden />}>
            Producir y descontar
          </BotonPrincipal>
        </div>
      </Tarjeta>

      <BotonArchivar
        nombre={receta.nombre}
        onConfirmar={async () => {
          await onArchivar(receta.id);
          setRecetaId(recetas.find((r) => r.id !== receta.id)?.id ?? '');
        }}
      />
    </div>
  );
}

function BotonArchivar({ nombre, onConfirmar }: { nombre: string; onConfirmar: () => void }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = window.setTimeout(() => setArmado(false), 4000);
    return () => window.clearTimeout(t);
  }, [armado]);
  return (
    <BotonPrincipal
      variante={armado ? 'peligro' : 'suave'}
      icono={<Archive size={24} aria-hidden />}
      onClick={() => {
        if (!armado) return setArmado(true);
        setArmado(false);
        onConfirmar();
      }}
    >
      {armado ? `Toca otra vez para retirar "${nombre}"` : 'Retirar esta receta'}
    </BotonPrincipal>
  );
}

function SelectorInsumo({ insumos, valor, onCambio }: { insumos: readonly Insumo[]; valor: Id; onCambio: (id: Id) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold text-cafe-700">
        Insumo
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="h-14 w-full appearance-none rounded-2xl border-2 border-crema-200 bg-crema-50 px-4 text-lg font-semibold text-cafe-900 focus:border-cafe-700 focus:outline-none"
      >
        {insumos.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nombre} ({i.unidad === 'u' ? 'unidades' : i.unidad})
          </option>
        ))}
      </select>
    </div>
  );
}

function AgregarIngrediente({ insumos, onAgregar }: { insumos: readonly Insumo[]; onAgregar: (insumoId: Id, cantidad: number) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [insumoId, setInsumoId] = useState<Id>(insumos[0]?.id ?? '');
  const [cantidad, setCantidad] = useState(100);
  const insumo = insumos.find((i) => i.id === insumoId) ?? insumos[0];

  if (!abierto || !insumo) {
    return (
      <BotonPrincipal variante="suave" onClick={() => setAbierto(true)} icono={<Plus size={24} aria-hidden />}>
        Agregar ingrediente
      </BotonPrincipal>
    );
  }
  return (
    <div className="flex flex-col gap-5 rounded-2xl border-2 border-rosa-300 bg-rosa-100 p-4">
      <SelectorInsumo
        insumos={insumos}
        valor={insumo.id}
        onCambio={(id) => {
          setInsumoId(id);
          setCantidad(insumos.find((i) => i.id === id)?.unidad === 'u' ? 1 : 100);
        }}
      />
      <SelectorNumerico
        etiqueta="Cantidad"
        valor={cantidad}
        onCambio={setCantidad}
        min={0}
        max={insumo.unidad === 'u' ? 60 : 10000}
        paso={pasoPorUnidad(insumo.unidad)}
        formato={(v) => formatearCantidad(v, insumo.unidad)}
        unidad={insumo.unidad === 'u' ? 'unidades' : insumo.unidad}
        decimales={insumo.unidad === 'u' ? 0 : 1}
      />
      <BotonPrincipal
        onClick={() => {
          onAgregar(insumo.id, cantidad);
          setAbierto(false);
        }}
        icono={<CheckCircle2 size={24} aria-hidden />}
        deshabilitado={cantidad <= 0}
      >
        Agregar
      </BotonPrincipal>
      <BotonPrincipal variante="suave" onClick={() => setAbierto(false)}>
        Cancelar
      </BotonPrincipal>
    </div>
  );
}

interface Linea {
  readonly insumoId: Id;
  readonly cantidad: number;
}

function FormularioReceta({
  insumos,
  primera,
  onGuardar,
  onCancelar,
}: {
  insumos: readonly Insumo[];
  primera: boolean;
  onGuardar: (datos: DatosRecetaNueva) => void;
  onCancelar: (() => void) | undefined;
}) {
  const [nombre, setNombre] = useState('');
  const [porciones, setPorciones] = useState(10);
  const [elaboracion, setElaboracion] = useState(30);
  const [horneado, setHorneado] = useState(30);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | undefined>();
  const mapa = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const disponibles = insumos.filter((i) => !lineas.some((l) => l.insumoId === i.id));

  const guardar = () => {
    if (nombre.trim().length < 2) return setError('Escribe el nombre de la receta, por ejemplo "Torta tres leches".');
    if (!lineas.some((l) => l.cantidad > 0)) return setError('Agrega al menos un ingrediente con su cantidad.');
    onGuardar({ nombre, porciones, minutosElaboracion: elaboracion, minutosHorneado: horneado, ingredientes: lineas });
  };

  return (
    <Tarjeta className="border-rosa-300 bg-rosa-100">
      <TituloSeccion>{primera ? 'Crea tu primera receta' : 'Nueva receta'}</TituloSeccion>
      <div className="flex flex-col gap-6">
        <CampoTexto
          etiqueta="Nombre de la receta"
          valor={nombre}
          onCambio={(v) => {
            setNombre(v);
            setError(undefined);
          }}
          placeholder="Ej.: Torta tres leches"
          autoComplete="off"
          maxLength={60}
        />
        <SelectorNumerico etiqueta="Porciones que rinde" valor={porciones} onCambio={setPorciones} min={1} max={200} paso={1} unidad="porciones" />
        <SelectorNumerico etiqueta="Minutos de elaboración y decorado" valor={elaboracion} onCambio={setElaboracion} min={0} max={600} paso={5} formato={(v) => `${v} min`} unidad="minutos" />
        <SelectorNumerico etiqueta="Minutos de horneado" valor={horneado} onCambio={setHorneado} min={0} max={600} paso={5} formato={(v) => `${v} min`} unidad="minutos" />

        <div className="flex flex-col gap-4 border-t-2 border-rosa-300 pt-5">
          <p className="text-lg font-bold text-cafe-900">Ingredientes ({lineas.length})</p>
          {lineas.map((l, indice) => {
            const insumo = mapa.get(l.insumoId);
            if (!insumo) return null;
            return (
              <div key={l.insumoId} className="flex flex-col gap-2 rounded-2xl bg-crema-50 p-3">
                <SelectorNumerico
                  etiqueta={insumo.nombre}
                  valor={l.cantidad}
                  onCambio={(v) => setLineas((ls) => ls.map((x, i) => (i === indice ? { ...x, cantidad: v } : x)))}
                  min={0}
                  max={insumo.unidad === 'u' ? 60 : 10000}
                  paso={pasoPorUnidad(insumo.unidad)}
                  formato={(v) => formatearCantidad(v, insumo.unidad)}
                  unidad={insumo.unidad === 'u' ? 'unidades' : insumo.unidad}
                  decimales={insumo.unidad === 'u' ? 0 : 1}
                />
                <button
                  type="button"
                  onClick={() => setLineas((ls) => ls.filter((_, i) => i !== indice))}
                  className="boton-tactil flex min-h-12 items-center gap-2 self-end rounded-xl px-3 text-base font-semibold text-rojo-texto"
                >
                  <Trash2 size={20} aria-hidden /> Quitar
                </button>
              </div>
            );
          })}
          {disponibles.length > 0 && (
            <AgregarIngrediente
              key={lineas.length}
              insumos={disponibles}
              onAgregar={(insumoId, cantidad) => {
                setLineas((ls) => [...ls, { insumoId, cantidad }]);
                setError(undefined);
              }}
            />
          )}
        </div>

        {error && (
          <p role="alert" className="text-base font-semibold text-rojo-texto">
            {error}
          </p>
        )}
        <BotonPrincipal onClick={guardar} icono={<CheckCircle2 size={24} aria-hidden />}>
          Guardar receta
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
