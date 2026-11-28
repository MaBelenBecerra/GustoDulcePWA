import { describe, expect, it } from 'vitest';
import { enlaceWhatsApp, mensajeCotizacion, normalizarCelular } from '..';

describe('WhatsApp', () => {
  it('normaliza celulares bolivianos', () => {
    expect(normalizarCelular('712 345 67')).toEqual({ ok: true, numero: '59171234567' });
    expect(normalizarCelular('+591 61234567')).toEqual({ ok: true, numero: '59161234567' });
    expect(normalizarCelular('')).toEqual({ ok: true, numero: null });
    expect(normalizarCelular('3456789').ok).toBe(false);
    expect(normalizarCelular('81234567').ok).toBe(false);
  });

  it('el mensaje muestra precio pero nunca costos ni ganancia', () => {
    const texto = mensajeCotizacion({ negocio: 'Dulces Belén', cliente: 'Rosa', producto: 'Torta tres leches', porciones: 15, precioPorcion: 9.5, precioTotal: 142.5, diasValidez: 7 });
    expect(texto).toContain('¡Hola, Rosa!');
    expect(texto).toContain('Torta tres leches');
    expect(texto).toMatch(/Total: Bs\s142,50/);
    expect(texto.toLowerCase()).not.toMatch(/costo|ganancia|mano de obra/);
  });

  it('arma el enlace wa.me con el texto codificado', () => {
    expect(enlaceWhatsApp('59171234567', 'Hola & chau')).toBe('https://wa.me/59171234567?text=Hola%20%26%20chau');
    expect(enlaceWhatsApp(null, 'x')).toBe('https://wa.me/?text=x');
  });
});
