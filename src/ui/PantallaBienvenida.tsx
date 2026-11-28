import { BookOpen, Calculator, CheckCircle2, Circle, Database, Package, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { BotonPrincipal, Tarjeta } from './comunes';

export type Paso = 'costos' | 'inventario' | 'recetas' | 'cotizador';

export interface EstadoPasos {
  readonly costos: boolean;
  readonly inventario: boolean;
  readonly recetas: boolean;
  readonly cotizador: boolean;
}

export const contarPasos = (p: EstadoPasos) => Object.values(p).filter(Boolean).length;

const PASOS: readonly { id: Paso; titulo: string; detalle: string; icono: ReactNode }[] = [
  {
    id: 'costos',
    titulo: 'Tus costos y horas',
    detalle: 'Horas que trabajas al mes y lo que pagas de luz, agua y gas.',
    icono: <Wallet size={28} aria-hidden />,
  },
  {
    id: 'inventario',
    titulo: 'Tu inventario',
    detalle: 'Registra los insumos que tienes en la despensa y cuánto pagaste.',
    icono: <Package size={28} aria-hidden />,
  },
  {
    id: 'recetas',
    titulo: 'Tu primera receta',
    detalle: 'Ingredientes, tiempos y porciones. La app calcula el costo sola.',
    icono: <BookOpen size={28} aria-hidden />,
  },
  {
    id: 'cotizador',
    titulo: 'Tu primera cotización',
    detalle: 'Mira cuánto cobrar y envíaselo a tu clienta por WhatsApp.',
    icono: <Calculator size={28} aria-hidden />,
  },
];

export function PantallaBienvenida({
  nombre,
  pasos,
  esAdministradora,
  cargando,
  onIr,
  onCargarPrueba,
  onTerminar,
}: {
  nombre: string | null;
  pasos: EstadoPasos;
  esAdministradora: boolean;
  cargando: boolean;
  onIr: (paso: Paso) => void;
  onCargarPrueba: () => void;
  onTerminar: () => void;
}) {
  const hechos = contarPasos(pasos);
  const siguiente = PASOS.find((p) => !pasos[p.id]);

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="border-rosa-300 bg-rosa-100">
        <p className="text-2xl font-black text-cafe-900">¡Bienvenida{nombre ? `, ${nombre}` : ''}! 🧁</p>
        <p className="mt-2 text-lg text-cafe-700">
          Tu cuenta está lista. Sigue estos 4 pasos para que GustoDulce calcule tus costos y precios con tus propios datos.
        </p>
        <div className="mt-4 h-4 overflow-hidden rounded-full bg-crema-50" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={hechos} aria-label="Pasos completados">
          <div className="h-full rounded-full bg-rosa-400 transition-all" style={{ width: `${(hechos / 4) * 100}%` }} />
        </div>
        <p className="mt-2 text-base font-semibold text-cafe-700">{hechos} de 4 pasos completados</p>
      </Tarjeta>

      <ol className="flex flex-col gap-3">
        {PASOS.map((p, i) => {
          const hecho = pasos[p.id];
          const esSiguiente = siguiente?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onIr(p.id)}
                className={`boton-tactil flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left ${
                  esSiguiente ? 'border-cafe-700 bg-rosa-200' : hecho ? 'border-verde-texto bg-verde-fondo' : 'border-crema-200 bg-crema-100'
                }`}
              >
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${hecho ? 'text-verde-texto' : 'text-cafe-700'}`}>{p.icono}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-cafe-500 uppercase">Paso {i + 1}</span>
                  <span className="block text-xl font-extrabold text-cafe-900">{p.titulo}</span>
                  <span className="block text-base text-cafe-700">{p.detalle}</span>
                </span>
                {hecho ? (
                  <CheckCircle2 size={30} className="shrink-0 text-verde-texto" aria-label="Hecho" />
                ) : (
                  <Circle size={30} className="shrink-0 text-cafe-500" aria-label="Pendiente" />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {siguiente && (
        <BotonPrincipal onClick={() => onIr(siguiente.id)} icono={siguiente.icono}>
          {hechos === 0 ? 'Empezar' : `Seguir: ${siguiente.titulo.toLowerCase()}`}
        </BotonPrincipal>
      )}

      {esAdministradora && (
        <Tarjeta>
          <p className="text-lg font-bold text-cafe-900">Cuenta de pruebas</p>
          <p className="mb-4 text-base text-cafe-700">
            Carga 40 insumos, 30 recetas, ~94 compras, 35 cotizaciones y producciones de ejemplo (≈ 290 registros) para probar la app y
            mostrarla en la defensa.
          </p>
          <BotonPrincipal onClick={onCargarPrueba} variante="suave" icono={<Database size={24} aria-hidden />} deshabilitado={cargando}>
            {cargando ? 'Cargando datos…' : 'Cargar datos de prueba'}
          </BotonPrincipal>
        </Tarjeta>
      )}

      <BotonPrincipal onClick={onTerminar} variante="suave">
        {hechos === 4 ? '¡Listo! Ir a mi cocina' : 'Lo hago después'}
      </BotonPrincipal>
    </div>
  );
}
