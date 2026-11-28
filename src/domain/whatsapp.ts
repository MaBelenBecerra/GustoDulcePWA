import { formatearBs } from './numeros';

export function normalizarCelular(texto: string): { ok: true; numero: string | null } | { ok: false; mensaje: string } {
  const digitos = texto.replace(/\D/g, '');
  if (digitos === '') return { ok: true, numero: null };
  if (/^[67]\d{7}$/.test(digitos)) return { ok: true, numero: `591${digitos}` };
  if (/^591[67]\d{7}$/.test(digitos)) return { ok: true, numero: digitos };
  return { ok: false, mensaje: 'El celular debe tener 8 dígitos y empezar con 6 o 7, por ejemplo 71234567.' };
}

export interface DatosMensajeCotizacion {
  readonly negocio: string;
  readonly cliente: string;
  readonly producto: string;
  readonly porciones: number;
  readonly precioPorcion: number;
  readonly precioTotal: number;
  readonly diasValidez: number;
}

export function mensajeCotizacion(d: DatosMensajeCotizacion): string {
  const saludo = d.cliente.trim() ? `¡Hola, ${d.cliente.trim()}!` : '¡Hola!';
  return [
    `${saludo} 🧁 Te paso la cotización de *${d.negocio.trim() || 'GustoDulce'}*:`,
    '',
    `• Producto: ${d.producto}`,
    `• Porciones: ${d.porciones}`,
    `• Precio por porción: ${formatearBs(d.precioPorcion)}`,
    '',
    `*Total: ${formatearBs(d.precioTotal)}*`,
    '',
    `Precio válido por ${d.diasValidez} días. ¡Gracias por tu pedido!`,
  ].join('\n');
}

export function enlaceWhatsApp(numero: string | null, texto: string): string {
  const base = numero ? `https://wa.me/${numero}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(texto)}`;
}
