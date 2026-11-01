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

module.exports = { abrirConEjemplo, esperarArranque };
