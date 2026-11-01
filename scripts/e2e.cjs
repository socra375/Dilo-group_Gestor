// Flujos principales en navegador headless (390 px). Uso: node scripts/e2e.cjs
const { chromium } = require('playwright');
const { crear } = require('./serve.cjs');

let fallos = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fallos++;
};

// Reintenta una condición hasta `ms`: la lista se repinta de forma asíncrona tras guardar.
// Lee una colección con el mismo store.js que usa la app (IndexedDB), dentro de la página.
const leer = (page, col) => page.evaluate(async (c) => (await import('/src/data/store.js')).list(c, { archivados: 'todos' }), col);

async function espera(cond, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) {
    if (await cond()) return true;
    if (Date.now() > fin) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
}

(async () => {
  const servidor = crear().listen(0);
  const base = `http://localhost:${servidor.address().port}/index.html`;
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'America/Santo_Domingo', hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('dialog', (d) => { errores.push(`alert() usado: ${d.message()}`); d.dismiss(); });

  await page.goto(`${base}#/viajes`);
  await page.waitForSelector('[data-lista] .item');

  // Validación: formulario vacío muestra errores junto a los campos, sin alert().
  await page.click('[data-nuevo]');
  await page.click('dialog.sheet button[type=submit]');
  const errRuta = await page.textContent('#f-rutaId-err');
  ok(errRuta.includes('Selecciona'), `error junto al campo Ruta: "${errRuta}"`);
  ok((await page.getAttribute('#f-rutaId', 'aria-invalid')) === 'true', 'campo inválido marcado con aria-invalid');

  // Viaje que cruza la medianoche, llegada autocompletada con la duración de la ruta (R5 = 25 min).
  await page.selectOption('#f-rutaId', { label: 'R5 Boca Chica – AILA' });
  await page.selectOption('#f-choferId', { index: 1 });
  await page.selectOption('#f-vehiculoId', { index: 1 });
  await page.fill('#f-salidaProg', '23:50');
  await page.dispatchEvent('#f-salidaProg', 'change');
  ok((await page.inputValue('#f-llegadaProg')) === '00:15', 'llegada programada autocompletada 00:15');
  await page.fill('#f-salidaReal', '23:52');
  await page.fill('#f-llegadaReal', '00:40');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const ultimo = (await leer(page, 'viajes')).filter((x) => !x.ejemplo).pop();
  ok(ultimo && ultimo.llegadaProg > ultimo.salidaProg, 'llegada programada guardada al día siguiente');
  const tarjeta = page.locator('.item', { hasText: '11:50 p. m.' }).filter({ hasText: 'Retrasado' });
  ok((await tarjeta.count()) === 1, 'viaje nocturno muestra "Retrasado (+25 min)"');
  ok((await tarjeta.first().textContent()).includes('+25 min'), 'retraso de 25 min calculado a través de la medianoche');

  // Botón rápido "Salió ahora" → pasa a "En ruta" y aparece "Llegó ahora".
  const antes = await page.locator('[data-rapido="salio"]').count();
  if (antes) {
    await page.locator('[data-rapido="salio"]').first().click();
    ok(await espera(async () => (await page.locator('[data-rapido="salio"]').count()) === antes - 1), '"Salió ahora" registra la salida');
    ok((await page.locator('.toast').last().textContent()).includes('Salida registrada'), 'toast de salida');
  } else console.log('· sin viajes pendientes de salir hoy (depende de la hora)');

  // Llegó ahora sobre un viaje "Sin llegada registrada" → pide motivo si va tarde.
  const llego = page.locator('[data-rapido="llego"]').first();
  if (await llego.count()) {
    await llego.click();
    // El toast dice si llegó tarde; solo entonces se abre la hoja del motivo.
    await espera(async () => /retraso|A tiempo/.test(await page.locator('.toast').last().textContent().catch(() => '')));
    const tarde = /retraso/.test(await page.locator('.toast').last().textContent());
    const pide = tarde ? await espera(async () => (await page.locator('dialog.sheet', { hasText: 'Motivo del retraso' }).count()) === 1) : false;
    if (pide) {
      await page.fill('#f-motivoRetraso', 'Tapón en la 27');
      await page.click('dialog.sheet button[type=submit]');
      await page.waitForSelector('dialog.sheet', { state: 'detached' });
      const guardado = await espera(async () => (await page.locator('.item', { hasText: 'Tapón en la 27' }).count()) === 1);
      ok(guardado, 'motivo del retraso guardado');
      if (!guardado) {
        // Diagnóstico para el log de CI: qué había en pantalla y en el almacenamiento.
        console.log('   tarjetas:', JSON.stringify(await page.locator('.item').allTextContents()));
        console.log('   en almacenamiento:', (await leer(page, 'viajes')).filter((v) => v.motivoRetraso).map((v) => `${v.id}: ${v.motivoRetraso}`).join(' | '));
      }
    } else ok(true, 'llegada registrada a tiempo');
  }

  // Turnos: marcar entrada y salida.
  await page.evaluate(() => { location.hash = '#/choferes'; });
  await page.waitForSelector('[data-lista] .item');
  const card = page.locator('.item', { hasText: 'Luis Manuel' });
  await card.locator('[data-accion="entrada"]').click();
  ok(await espera(async () => (await card.textContent()).includes('En turno desde')), 'marcar entrada abre el turno');
  await card.locator('[data-accion="salida"]').click();
  ok(await espera(async () => (await card.locator('[data-accion="entrada"]').count()) === 1), 'marcar salida cierra el turno');

  // Corregir un turno nocturno (22:00 → 06:00 al día siguiente).
  await card.locator('[data-accion="turnos"]').click();
  await page.click('[data-agregar]');
  await page.fill('#f-entrada', '22:00');
  await page.fill('#f-salida', '06:00');
  await page.locator('dialog.sheet button[type=submit]').last().click();
  ok(await espera(async () => (await page.locator('dialog.sheet', { hasText: '(día sig.)' }).count()) === 1), 'turno nocturno de 8 h cruza la medianoche');

  // Archivar y restaurar un vehículo, con confirmación dentro de la página.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/vehiculos'; });
  await page.waitForSelector('[data-lista] .item');
  const vehiculosAntes = await page.locator('[data-lista] .item').count();
  await page.locator('[data-editar]').first().click();
  await page.click('[data-accion="archivar"]');
  await page.click('dialog.modal [data-r="1"]');
  ok(await espera(async () => (await page.locator('[data-lista] .item').count()) === vehiculosAntes - 1), 'vehículo archivado sale de la lista de activos');
  await page.click('[data-filtro="1"]');
  ok(await espera(async () => (await page.locator('[data-lista] .item').count()) === 1), 'aparece en Archivados');

  // Placa duplicada.
  await page.click('[data-filtro="0"]');
  await page.click('[data-nuevo]');
  await page.fill('#f-placa', 'i067310');
  await page.click('dialog.sheet button[type=submit]');
  ok(await espera(async () => (await page.textContent('#f-placa-err')).includes('Ya existe')), 'placa duplicada rechazada');

  // Reportes: CSV descargable.
  await page.evaluate(() => { location.hash = '#/reportes'; });
  await page.waitForSelector('[data-csv="chofer"]');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-csv="chofer"]')]);
  const contenido = require('fs').readFileSync(await csv.path(), 'utf8');
  ok(contenido.startsWith('﻿Chofer,Viajes,Completados'), `CSV de retrasos por chofer (${csv.suggestedFilename()})`);

  // Ajustes: tolerancia inválida muestra error junto al campo.
  await page.evaluate(() => { location.hash = '#/ajustes'; });
  await page.waitForSelector('#f-tolerancia');
  await page.fill('#f-tolerancia', '90');
  await page.dispatchEvent('#f-tolerancia', 'change');
  ok((await page.textContent('#f-tolerancia-err')).includes('entre 0 y 60'), 'tolerancia fuera de rango rechazada');
  await page.fill('#f-tolerancia', '10');
  await page.dispatchEvent('#f-tolerancia', 'change');
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('ct:prefs')).toleranciaMin)) === 10, 'tolerancia guardada');

  // Tema oscuro manual.
  await page.check('#f-oscuro');
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'oscuro', 'tema oscuro aplicado');
  await page.click('[data-letra="extra"]');
  ok((await page.evaluate(() => document.documentElement.style.fontSize)) === '21px', 'tamaño de letra aplicado');

  // Respaldo: exportar → borrar ejemplo → importar restaura.
  const [resp] = await Promise.all([page.waitForEvent('download'), page.click('[data-exportar]')]);
  const rutaResp = await resp.path();
  const totalAntes = (await leer(page, 'viajes')).length;
  await page.click('[data-borrar-ejemplo]');
  await page.click('dialog.modal [data-r="1"]');
  await espera(async () => (await leer(page, 'viajes')).every((v) => !v.ejemplo));
  // Ajustes se repinta tras borrar (la pantalla queda vacía un instante): esperar a que la nueva ya esté
  // completa —sin la sección de ejemplo y con el campo de importar— antes de actuar.
  await espera(async () => (await page.locator('[data-borrar-ejemplo]').count()) === 0 && (await page.locator('#f-importar').count()) === 1);
  const quedan = await leer(page, 'viajes');
  ok(quedan.length >= 1 && quedan.every((v) => !v.ejemplo), `datos de ejemplo borrados; quedan ${quedan.length} viaje(s) del usuario`);
  ok(await espera(() => page.locator('#badge-ejemplo').isHidden()), 'franja "datos de ejemplo" desaparece');
  const campoViejo = await page.$('#f-importar');
  await page.setInputFiles('#f-importar', rutaResp);
  await page.click('dialog.modal [data-r="1"]');
  ok(await espera(async () => (await leer(page, 'viajes')).length === totalAntes), 'importar respaldo restaura todos los viajes');
  // Importar repinta Ajustes: esperar a que el campo anterior se desmonte antes de seguir.
  ok(await espera(() => campoViejo.evaluate((el) => !el.isConnected)), 'Ajustes se repinta tras importar');
  await page.setInputFiles('#f-importar', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
  ok(await espera(async () => (await page.textContent('#f-importar-err')).includes('no es un respaldo')), 'archivo ajeno rechazado con mensaje');

  ok(!errores.length, `sin errores de consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  // Migración: datos de la versión anterior (localStorage) pasan a IndexedDB una sola vez.
  {
    const ctx2 = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await ctx2.addInitScript(() => {
      if (sessionStorage.getItem('sembrado-prueba')) return; // solo en la primera carga
      sessionStorage.setItem('sembrado-prueba', '1');
      localStorage.setItem('ct:prefs', JSON.stringify({ sembrado: true }));
      localStorage.setItem('ct:v1:choferes', JSON.stringify([{ id: 'viejo-1', nombre: 'Chofer de la versión anterior', archivado: false }]));
    });
    const p2 = await ctx2.newPage();
    await p2.goto(`${base}#/choferes`);
    await p2.waitForSelector('[data-lista] .item');
    const choferes = await leer(p2, 'choferes');
    ok(choferes.length === 1 && choferes[0].nombre === 'Chofer de la versión anterior', 'datos de localStorage migrados a IndexedDB');
    ok((await p2.evaluate(() => localStorage.getItem('ct:v1:choferes'))) === null, 'claves viejas de localStorage borradas');
    await ctx2.close();
  }

  await navegador.close();
  servidor.close();
  console.log(fallos ? `\n${fallos} fallo(s).` : '\nFlujos OK.');
  process.exit(fallos ? 1 : 0);
})();
