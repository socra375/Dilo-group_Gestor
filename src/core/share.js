// Enlaces de contacto y compartir (WhatsApp, llamada).
// Los teléfonos dominicanos (809/829/849) se marcan con el código de país 1.

const digitos = (tel) => String(tel || '').replace(/\D/g, '');

/** Número en formato internacional para RD: '8095550101' → '18095550101'. null si no es un número usable. */
export function internacional(tel) {
  const d = digitos(tel);
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith('1')) return d;
  return null;
}

export function enlaceLlamada(tel) {
  const n = internacional(tel);
  return n ? `tel:+${n}` : null;
}

/** Chat de WhatsApp con un número (y texto opcional). Sin número abre "elegir contacto". */
export function enlaceWhatsApp(tel, texto = '') {
  const n = tel ? internacional(tel) : '';
  if (tel && !n) return null;
  return `https://wa.me/${n || ''}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
