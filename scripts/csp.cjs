// Política de seguridad de contenido (CSP) de producción, leída de vercel.json (la fuente única).
// Los servidores de prueba la envían para que e2e y QA corran bajo la misma política que el sitio publicado.
const fs = require('fs');
const path = require('path');

function cspProduccion() {
  const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vercel.json'), 'utf8'));
  for (const regla of cfg.headers) {
    const h = regla.headers.find((x) => x.key === 'Content-Security-Policy');
    if (h) return h.value;
  }
  throw new Error('vercel.json no tiene Content-Security-Policy');
}

// En pruebas el Supabase falso vive en http://127.0.0.1:<puerto>, que la política de producción (solo *.supabase.co) bloquearía.
// Es la única diferencia, y solo para conectar/mostrar imágenes hacia localhost / 127.0.0.1.
function cspPruebas() {
  return cspProduccion()
    .replace('img-src ', 'img-src http://localhost:* http://127.0.0.1:* ')
    .replace('connect-src ', 'connect-src http://localhost:* http://127.0.0.1:* ');
}

module.exports = { cspProduccion, cspPruebas };
