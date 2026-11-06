// Ayudas compartidas de e2e y QA.
// La app arranca VACÍA. Las pruebas que necesitan datos cargan los de tests/fixtures/ejemplo.js dentro de la página
// (con el mismo store.js que usa la app) y recargan.

/** Espera a que la app haya terminado de arrancar y, si registró un service worker, a que termine de precargar:
 *  recargar a medio precargar interrumpe esas descargas y el navegador lo registra como error de consola. */
async function esperarArranque(page) {
  await page.waitForFunction(() => document.querySelector('#view .view, #view [data-cuerpo], #view .login'));
  await page.evaluate(async () => {
    if (!navigator.serviceWorker) return;
    let reg = null;
    for (let i = 0; i < 20 && !reg; i++) { // el registro ocurre justo al final del arranque
      reg = await navigator.serviceWorker.getRegistration();
      if (!reg) await new Promise((r) => setTimeout(r, 100));
    }
    if (reg) await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 5000))]);
  });
}

/** Abre la app, carga los datos de prueba y deja la pantalla `hash` (p. ej. '#/viajes') ya pintada con ellos. */
async function abrirConEjemplo(page, base, hash = '#/inicio') {
  await page.goto(base);
  await esperarArranque(page);
  await page.evaluate(async () => (await import('/tests/fixtures/ejemplo.js')).sembrar());
  await page.goto(`${base}${hash}`);
  await page.reload(); // el cambio de hash por sí solo no vuelve a cargar los datos
}

/** Servidor estático del repositorio cuyo sw.js se puede "publicar" con otra VERSION (simula una actualización). */
function servidorConVersion() {
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const raiz = path.resolve(__dirname, '..');
  const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  let sufijo = '';
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    const archivo = path.join(raiz, u.endsWith('/') ? `${u}index.html` : u);
    fs.readFile(archivo, (e, d) => {
      if (e || !archivo.startsWith(raiz)) { r.writeHead(404); return r.end(); }
      let cuerpo = d;
      if (u === '/sw.js' && sufijo) cuerpo = Buffer.from(d.toString().replace(/const VERSION = '([^']+)'/, `const VERSION = '$1${sufijo}'`));
      r.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Security-Policy': require('./csp.cjs').cspPruebas() });
      r.end(cuerpo);
    });
  }).listen(0);
  return { base: `http://localhost:${srv.address().port}/index.html`, publicar: (s) => { sufijo = s; }, cerrar: () => srv.close() };
}

module.exports = { abrirConEjemplo, esperarArranque, servidorConVersion };
