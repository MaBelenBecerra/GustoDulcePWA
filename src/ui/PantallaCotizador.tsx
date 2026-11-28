import { useMemo, useState } from 'react';
import { BookOpen, Copy, MessageCircle } from 'lucide-react';
import { cotizar, dividirDestacadas, enlaceWhatsApp, formatearBs, mensajeCotizacion, normalizarCelular } from '../domain';
import type { ConfiguracionCostos, CotizacionGuardada, FechaISO, Id, Insumo, Receta } from '../domain';
import { BotonPrincipal, CampoTexto, FilaMonto, SelectorNumerico, SelectorReceta, Tarjeta, TituloSeccion } from './comunes';

const DIAS_VALIDEZ = 7;

export function PantallaCotizador({
  recetas,
  insumos,
  config,
  negocio,
  hoy,
  onRegistrar,
  onIrRecetas,
}: {
  recetas: readonly Receta[];
  insumos: readonly Insumo[];
  config: ConfiguracionCostos;
  negocio: string;
  hoy: FechaISO;
  onRegistrar: (datos: Omit<CotizacionGuardada, 'id'>) => Promise<void>;
  onIrRecetas: () => void;
}) {
  const [recetaId, setRecetaId] = useState<Id>(recetas[0]?.id ?? '');
  const receta = recetas.find((r) => r.id === recetaId) ?? recetas[0];
  const [porciones, setPorciones] = useState<number>(receta?.porciones ?? 1);
  const [cliente, setCliente] = useState('');
  const [celular, setCelular] = useState('');
  const [errorCelular, setErrorCelular] = useState<string | undefined>();
  const [copiado, setCopiado] = useState(false);
  const mapaInsumos = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const { destacadas, otras } = dividirDestacadas(recetas);

  if (!receta) {
    return (
      <Tarjeta>
        <TituloSeccion>Aún no tienes recetas</TituloSeccion>
        <p className="mb-4 text-lg text-cafe-700">Crea una receta y aquí verás cuánto cobrar por ella.</p>
        <BotonPrincipal onClick={onIrRecetas} icono={<BookOpen size={24} aria-hidden />}>
          Ir a Recetas
        </BotonPrincipal>
      </Tarjeta>
    );
  }

  const q = cotizar(receta, mapaInsumos, config, porciones);
  const texto = mensajeCotizacion({
    negocio,
    cliente,
    producto: receta.nombre,
    porciones,
    precioPorcion: q.precioUnitarioComercial,
    precioTotal: q.precioTotal,
    diasValidez: DIAS_VALIDEZ,
  });
  const registro = { recetaId: receta.id, porciones, precioTotal: q.precioTotal, cliente, fecha: hoy };

  const enviar = () => {
    const tel = normalizarCelular(celular);
    if (!tel.ok) {
      setErrorCelular(tel.mensaje);
      return;
    }
    window.open(enlaceWhatsApp(tel.numero, texto), '_blank', 'noopener');
    void onRegistrar(registro);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
      void onRegistrar(registro);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <TituloSeccion>¿Qué te pidieron?</TituloSeccion>
        <SelectorReceta
          etiqueta="Producto"
          destacadas={destacadas}
          otras={otras}
          valor={receta.id}
          onCambio={(id) => {
            setRecetaId(id);
            const elegida = recetas.find((r) => r.id === id);
            if (elegida) setPorciones(elegida.porciones);
          }}
        />
      </Tarjeta>

      <Tarjeta>
        <SelectorNumerico etiqueta="Porciones" valor={porciones} onCambio={setPorciones} min={1} max={500} paso={1} unidad="porciones" />
      </Tarjeta>

      <Tarjeta className="border-cafe-700 bg-rosa-200">
        <p className="text-lg font-semibold text-cafe-700">Precio para tu clienta</p>
        <p className="text-5xl font-black text-cafe-900 tabular-nums">{formatearBs(q.precioTotal)}</p>
        <p className="mt-1 text-lg text-cafe-700">{formatearBs(q.precioUnitarioComercial)} por porción</p>
        <div className="my-3 border-t-2 border-rosa-400" />
        <FilaMonto etiqueta="Materia prima" valor={q.materiaPrima} />
        <FilaMonto etiqueta="Luz, agua y gas" valor={q.costosIndirectos} />
        <div className="my-2 border-t-2 border-dashed border-rosa-400" />
        <FilaMonto etiqueta="Tu ganancia (mano de obra)" valor={q.ganancia} fuerte />
        <p className="mt-2 text-sm text-cafe-700">
          {q.redondeo > 0
            ? `Tu mano de obra es ${formatearBs(q.manoDeObra)}; al redondear el precio a Bs 0,50 ganas ${formatearBs(q.redondeo)} más.`
            : 'Tu ganancia es el pago completo de tu tiempo de trabajo.'}{' '}
          La clienta no ve este desglose.
        </p>
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Enviar a la clienta</TituloSeccion>
        <div className="flex flex-col gap-5">
          <CampoTexto etiqueta="Nombre de la clienta (opcional)" valor={cliente} onCambio={setCliente} placeholder="Ej.: Doña Rosa" autoComplete="off" maxLength={60} />
          <CampoTexto
            etiqueta="Celular (opcional)"
            valor={celular}
            onCambio={(v) => {
              setCelular(v);
              setErrorCelular(undefined);
            }}
            error={errorCelular}
            ayuda="Si lo dejas vacío, eliges el chat dentro de WhatsApp."
            placeholder="71234567"
            inputMode="tel"
            type="tel"
            autoComplete="tel"
          />
          <div className="rounded-2xl border-2 border-dashed border-crema-200 bg-crema-50 p-3">
            <p className="mb-1 text-sm font-semibold text-cafe-500">Mensaje que le llega:</p>
            <p className="text-base whitespace-pre-line text-cafe-900">{texto.replace(/\*/g, '')}</p>
          </div>
          <BotonPrincipal onClick={enviar} icono={<MessageCircle size={24} aria-hidden />}>
            Enviar por WhatsApp
          </BotonPrincipal>
          <BotonPrincipal onClick={() => void copiar()} variante="suave" icono={<Copy size={22} aria-hidden />}>
            {copiado ? '¡Mensaje copiado!' : 'Copiar mensaje'}
          </BotonPrincipal>
        </div>
      </Tarjeta>
    </div>
  );
}
