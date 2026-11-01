// Flujos principales en navegador headless (390 px). Uso: node scripts/e2e.cjs
const { chromium } = require('playwright');
const { crear } = require('./serve.cjs');

let fallos = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fallos++;
};

// Reintenta una condición hasta `ms`: la lista se repinta de forma asíncrona tras guardar.
// Navega y espera a que el router muestre la pantalla NUEVA (título incluido): si no, la prueba puede
// leer la lista de la pantalla anterior, que sigue visible un instante.
const TITULOS = { choferes: 'Choferes', vehiculos: 'Vehículos', rutas: 'Rutas', reportes: 'Reportes', ajustes: 'Ajustes', viajes: 'Viajes', combustible: 'Combustible', inicio: 'Inicio' };
async function ir(page, ruta) {
  await page.evaluate((h) => { location.hash = `#/${h}`; }, ruta);
  await page.waitForFunction((t) => document.getElementById('header-title')?.textContent === t, TITULOS[ruta]);
}

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
  await page.dispatchEvent('#f-llegadaReal', 'change');
  // Llega 25 min tarde (> tolerancia 5): el motivo aparece y es obligatorio.
  ok(await page.locator('[data-campo="motivoRetraso"]').isVisible(), 'con retraso aparece el campo "Motivo del retraso"');
  ok((await page.textContent('[data-campo="motivoRetraso"] .field__label')).includes('25 min tarde'), 'el motivo indica cuánto llegó tarde');
  await page.click('dialog.sheet button[type=submit]');
  ok((await page.textContent('#f-motivoRetraso-err')).includes('motivo'), 'sin motivo no deja guardar un viaje retrasado');
  await page.click('[data-motivo-op="Tráfico"]');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const ultimo = (await leer(page, 'viajes')).filter((x) => !x.ejemplo).pop();
  ok(ultimo && ultimo.llegadaProg > ultimo.salidaProg, 'llegada programada guardada al día siguiente');
  ok(ultimo.motivoRetraso === 'Tráfico', 'el chip de motivo rápido se guarda');
  const tarjeta = page.locator('.item', { hasText: '11:50 p. m.' });
  ok((await tarjeta.locator('.chip--error', { hasText: 'Retrasado' }).count()) === 1, 'viaje nocturno muestra "Retrasado" en rojo');
  ok((await tarjeta.first().textContent()).includes('+25 min'), 'retraso de 25 min calculado a través de la medianoche');
  ok((await tarjeta.first().textContent()).includes('Salió 11:52 p. m. (+2 min)'), 'el retraso de salida se muestra como dato');

  // Corregir la llegada a una hora a tiempo: el motivo desaparece y se limpia al guardar.
  await tarjeta.locator('[data-editar]').click();
  await page.fill('#f-llegadaReal', '00:18');
  await page.dispatchEvent('#f-llegadaReal', 'change');
  ok(await page.locator('[data-campo="motivoRetraso"]').isHidden(), 'sin retraso el campo del motivo no aparece');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  ok((await leer(page, 'viajes')).find((x) => x.id === ultimo.id).motivoRetraso === '', 'al quedar a tiempo, el motivo se limpia');

  // Generar viajes desde los horarios fijos (mañana: día sin viajes, resultado independiente de la hora).
  await page.click('[data-dia="1"]');
  await page.waitForSelector('[data-lista] .empty');
  ok((await page.textContent('[data-generar]')).includes('Generar viajes del'), 'el botón indica el día elegido');
  await page.click('[data-generar]');
  ok(await espera(async () => (await page.locator('[data-lista] .item').count()) === 7), 'genera un viaje por cada horario fijo (7)');
  ok((await page.locator('[data-lista] .item', { hasText: 'Sin chofer' }).count()) === 7, 'los viajes generados quedan sin chofer ni vehículo');
  await page.click('[data-generar]');
  ok(await espera(async () => (await page.locator('.toast').last().textContent()).includes('Ya están creados')), 'generar dos veces no duplica');
  ok((await page.locator('[data-lista] .item').count()) === 7, 'siguen siendo 7 viajes');

  // Registrar salida a mano con el atajo "Ahora" (solo rellena; guarda al pulsar Guardar).
  const primero = page.locator('[data-lista] .item', { hasText: 'R1 Alcarrizos' }).first();
  await primero.locator('[data-registrar="salida"]').click();
  await page.click('[data-ahora="salidaReal"]');
  const horaPuesta = await page.inputValue('#f-salidaReal');
  const horaEsperada = await page.evaluate(async () => (await import('/src/core/time.js')).horaAhora());
  ok(horaPuesta === horaEsperada, `"Ahora" rellena la hora actual (${horaPuesta})`);
  const idPrimero = (await leer(page, 'viajes')).filter((x) => !x.ejemplo && !x.choferId).sort((a, b) => a.salidaProg.localeCompare(b.salidaProg))[0].id;
  ok((await leer(page, 'viajes')).find((x) => x.id === idPrimero).salidaReal === null, '"Ahora" no guarda nada por sí solo');
  await page.fill('#f-salidaReal', '05:36'); // escrita a mano
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  ok(await espera(async () => (await primero.textContent()).includes('Salió 5:36 a. m. (+6 min)')), 'salida escrita a mano guardada');

  // Registrar llegada tarde con motivo "Otro" escrito a mano.
  await primero.locator('[data-registrar="llegada"]').click();
  ok(await page.locator('[data-campo="motivoRetraso"]').isHidden(), 'antes de escribir la llegada no se pide motivo');
  await page.fill('#f-llegadaReal', '06:50'); // programada 6:25 → +25
  await page.dispatchEvent('#f-llegadaReal', 'change');
  await page.click('[data-motivo-op="Otro"]');
  ok((await page.inputValue('#f-motivoRetraso')) === '', '"Otro" deja el motivo en blanco para escribirlo');
  await page.fill('#f-motivoRetraso', 'Goma pinchada en la autopista');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const registrado = (await leer(page, 'viajes')).find((x) => x.id === idPrimero);
  ok(registrado.motivoRetraso === 'Goma pinchada en la autopista' && registrado.llegadaReal, 'llegada tarde guardada con su motivo');
  await page.click('[data-dia="-1"]'); // volver a hoy

  // Turnos: marcar entrada y salida.
  await ir(page, 'choferes');
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
  await ir(page, 'vehiculos');
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

  // ---- Fase 2: choferes (ficha, foto, cédula), rutas (horarios), vehículos (vencimientos) ----
  await ir(page, 'choferes');
  await page.waitForSelector('[data-lista] .item');
  await page.locator('.item', { hasText: 'Ramón Antonio Féliz' }).locator('[data-editar]').click();
  await page.waitForSelector('dialog.sheet .ficha');
  const llamar = await page.getAttribute('dialog.sheet .ficha a.btn--primary', 'href');
  const wa = await page.getAttribute('dialog.sheet .ficha a.btn--whatsapp', 'href');
  ok(llamar === 'tel:+18095550102' && wa === 'https://wa.me/18095550102', `ficha con Llamar (${llamar}) y WhatsApp (${wa})`);
  ok((await page.textContent('dialog.sheet .ficha')).includes('Licencia vence en 10 días'), 'ficha muestra la licencia por vencer');

  // Editar desde la ficha: foto (se reduce a 400 px JPEG) y cédula con otro formato (solo advierte).
  await page.click('[data-editar-ficha]');
  await page.waitForSelector('dialog.sheet form #f-nombre');
  ok(await page.locator('[data-quitar-foto]').isHidden(), 'sin foto, el botón "Quitar" no se muestra');
  await page.setInputFiles('#f-fotoId', require('path').resolve(__dirname, '../icons/icon-512.png'));
  await page.waitForSelector('[data-foto-campo="fotoId"] img');
  ok(await page.locator('[data-quitar-foto]').isVisible(), 'con foto nueva aparece "Quitar"');
  await page.fill('#f-cedula', '12345');
  await page.dispatchEvent('#f-cedula', 'change');
  ok((await page.textContent('#f-cedula-warn')).includes('11 dígitos'), 'cédula con otro formato muestra advertencia');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const ramon = (await leer(page, 'choferes')).find((c) => c.nombre === 'Ramón Antonio Féliz');
  ok(ramon.cedula === '12345', 'la cédula se guarda aunque no tenga 11 dígitos (no bloquea)');
  const foto = await page.evaluate(async (id) => {
    const blob = await (await import('/src/data/store.js')).leerFoto(id);
    const bmp = await createImageBitmap(blob);
    return { tipo: blob.type, ancho: bmp.width, alto: bmp.height };
  }, ramon.fotoId);
  ok(foto.tipo === 'image/jpeg' && Math.max(foto.ancho, foto.alto) === 400, `foto del chofer reducida a JPEG ${foto.ancho}×${foto.alto}`);
  ok(await espera(async () => (await page.locator('.item', { hasText: 'Ramón Antonio Féliz' }).locator('.avatar img[src^="blob:"]').count()) === 1), 'la lista muestra la foto del chofer');

  // Quitar la foto la borra del almacén.
  await page.locator('.item', { hasText: 'Ramón Antonio Féliz' }).locator('[data-editar]').click();
  await page.click('[data-editar-ficha]');
  await page.click('[data-quitar-foto]');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const borrada = await page.evaluate(async (id) => (await (await import('/src/data/store.js')).leerFoto(id)) === null, ramon.fotoId);
  ok(borrada && !(await leer(page, 'choferes')).find((c) => c.nombre === 'Ramón Antonio Féliz').fotoId, 'quitar la foto la borra del almacén');

  // Rutas: agregar y quitar horarios fijos.
  await ir(page, 'rutas');
  await page.waitForSelector('[data-lista] .item');
  ok((await page.textContent('[data-lista]')).includes('Salidas: 5:30 a. m., 3:30 p. m.'), 'la lista de rutas muestra los horarios en 12 h');
  await page.locator('.item', { hasText: 'R1 Alcarrizos' }).locator('[data-editar]').click();
  await page.fill('#f-horarios', '07:15');
  await page.click('[data-agregar-hora]');
  await page.click('[data-quitar-hora="05:30"]');
  await page.fill('#f-horarios', '18:45'); // escrita sin pulsar "Agregar": también se guarda
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const r1 = (await leer(page, 'rutas')).find((r) => r.nombre.startsWith('R1'));
  ok(JSON.stringify(r1.horarios) === JSON.stringify(['07:15', '15:30', '18:45']), `horarios guardados en orden: ${r1.horarios.join(', ')}`);

  // Vehículos: avisos de seguro y mantenimiento en la lista.
  await ir(page, 'vehiculos');
  await page.waitForSelector('[data-lista] .item');
  const textoVeh = await page.textContent('[data-lista]');
  ok(textoVeh.includes('Seguro vence en 12 días'), 'vehículo con seguro por vencer avisa');
  ok(/Mantenimiento: faltan 350 km/.test(textoVeh), 'vehículo con mantenimiento próximo por km avisa');

  // Reportes: CSV descargable.
  await ir(page, 'reportes');
  await page.waitForSelector('[data-csv="chofer"]');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-csv="chofer"]')]);
  const contenido = require('fs').readFileSync(await csv.path(), 'utf8');
  ok(contenido.startsWith('﻿Chofer,Viajes,Completados'), `CSV de retrasos por chofer (${csv.suggestedFilename()})`);

  // Ajustes: tolerancia inválida muestra error junto al campo.
  await ir(page, 'ajustes');
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

  // Toasts: varios seguidos no se apilan ni tapan los botones (no capturan toques).
  const toasts = await page.evaluate(async () => {
    const { toast } = await import('/src/core/ui.js');
    for (let i = 0; i < 6; i++) toast(`Aviso de prueba ${i}`);
    const t = document.querySelector('.toast');
    const r = t.getBoundingClientRect();
    const debajo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { visibles: document.querySelectorAll('.toast').length, tocable: !debajo?.closest('.toast') };
  });
  ok(toasts.visibles <= 2, `como máximo 2 toasts a la vez (${toasts.visibles})`);
  ok(toasts.tocable, 'los toasts no se tragan los toques');

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
