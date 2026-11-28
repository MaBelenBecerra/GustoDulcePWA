import { CheckCircle2, Clock, Flame } from 'lucide-react';
import { formatearBs, HORAS_MES_MAXIMO, redondear, tasaMinutoCIF, tasaMinutoMOD } from '../domain';
import type { ConfiguracionCostos } from '../domain';
import { BotonPrincipal, formatoNumero, SelectorNumerico, Tarjeta, TituloSeccion } from './comunes';

export function PantallaCostos({
  config,
  guardada,
  onCambiar,
}: {
  config: ConfiguracionCostos;
  guardada: boolean;
  onCambiar: (cambio: (c: ConfiguracionCostos) => ConfiguracionCostos) => void;
}) {
  const tasaMOD = tasaMinutoMOD(config);
  const tasaCIF = tasaMinutoCIF(config);
  const horasSemana = redondear(config.horasTrabajoMes / (52 / 12), 1);
  const servicio = (clave: keyof ConfiguracionCostos['servicios']) => (v: number) =>
    onCambiar((c) => ({ ...c, servicios: { ...c.servicios, [clave]: v } }));

  return (
    <div className="flex flex-col gap-4">
      {!guardada && (
        <Tarjeta className="border-rosa-300 bg-rosa-100">
          <p className="text-lg text-cafe-900">
            Revisa tus horas de trabajo y lo que pagas de luz, agua y gas al mes. Con esto la app calcula cuánto vale tu tiempo
            y tus costos indirectos en cada receta.
          </p>
        </Tarjeta>
      )}

      <Tarjeta>
        <TituloSeccion>Mi mano de obra</TituloSeccion>
        <p className="mb-4 text-lg text-cafe-700">
          Sueldo de referencia: <strong className="text-cafe-900">{formatearBs(config.sueldoMensual)}</strong> al mes (salario mínimo nacional).
        </p>
        <SelectorNumerico
          etiqueta="Horas que trabajo al mes en repostería"
          valor={config.horasTrabajoMes}
          onCambio={(v) => onCambiar((c) => ({ ...c, horasTrabajoMes: v }))}
          min={1}
          max={Math.min(300, HORAS_MES_MAXIMO)}
          paso={1}
          formato={(v) => `${v} h`}
          unidad="horas"
          ayuda={`Aproximadamente ${formatoNumero.format(horasSemana)} horas por semana`}
        />
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-rosa-100 p-4">
          <Clock size={30} className="shrink-0 text-cafe-700" aria-hidden />
          <p className="text-lg text-cafe-900">
            Cada minuto de tu trabajo vale <strong>{formatearBs(tasaMOD)}</strong>
          </p>
        </div>
      </Tarjeta>

      <Tarjeta>
        <TituloSeccion>Servicios del mes (costos indirectos)</TituloSeccion>
        <div className="flex flex-col gap-6">
          <SelectorNumerico etiqueta="Luz" valor={config.servicios.luz} onCambio={servicio('luz')} min={0} max={3000} paso={5} formato={formatearBs} unidad="Bs" decimales={2} />
          <SelectorNumerico etiqueta="Agua" valor={config.servicios.agua} onCambio={servicio('agua')} min={0} max={3000} paso={5} formato={formatearBs} unidad="Bs" decimales={2} />
          <SelectorNumerico etiqueta="Gas (garrafas o red)" valor={config.servicios.gas} onCambio={servicio('gas')} min={0} max={3000} paso={5} formato={formatearBs} unidad="Bs" decimales={2} />
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-rosa-100 p-4">
          <Flame size={30} className="shrink-0 text-cafe-700" aria-hidden />
          <p className="text-lg text-cafe-900">
            Cada minuto en la cocina consume <strong>{formatearBs(tasaCIF)}</strong> en servicios
          </p>
        </div>
      </Tarjeta>

      {!guardada && (
        <BotonPrincipal onClick={() => onCambiar((c) => c)} icono={<CheckCircle2 size={24} aria-hidden />}>
          Guardar mis costos
        </BotonPrincipal>
      )}
    </div>
  );
}
