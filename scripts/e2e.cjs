// Flujos principales en navegador headless (390 px). Uso: node scripts/e2e.cjs
const { chromium } = require('playwright');
const { crear } = require('./serve.cjs');
const { abrirConEjemplo, servidorConVersion } = require('./ayudas.cjs');

// Esperado: en modo demostración src/config.local.js no existe (está en .gitignore) y el navegador registra su 404. Solo ese recurso.
const esperado404 = (m) => /status of 404/.test(m.text()) && /config\.local\.js/.test(m.location().url);

let fallos = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fallos++;
};

// Reintenta una condición hasta `ms`: la lista se repinta de forma asíncrona tras guardar.
// Navega y espera a que el router muestre la pantalla NUEVA (título incluido): si no, la prueba puede
// leer la lista de la pantalla anterior, que sigue visible un instante.
const TITULOS = { choferes: 'Choferes', vehiculos: 'Vehículos', rutas: 'Rutas', reportes: 'Reportes', ajustes: 'Ajustes', viajes: 'Viajes', combustible: 'Combustible', 'reporte-combustible': 'Reporte de combustible', asistencia: 'Asistencia', inicio: 'Dilo group' };
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
  page.on('console', (m) => { if (m.type() === 'error' && !esperado404(m)) errores.push(m.text()); });
  page.on('dialog', (d) => { errores.push(`alert() usado: ${d.message()}`); d.dismiss(); });

  await abrirConEjemplo(page, base, '#/viajes'); // la app arranca vacía: se cargan los datos de prueba
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

  // ---- Fase 7: asistencia del chofer (marcar entrada y salida con hora editable) ----
  await page.evaluate(() => { location.hash = '#/mas'; });
  await page.waitForSelector('.menu');
  ok((await page.locator('.menu a', { hasText: 'Asistencia' }).count()) === 1, '"Asistencia" aparece en el menú Más (CONFIG.modulos.asistencia)');
  // Estado inicial explícito: los datos de ejemplo traen entradas desde las 5:00 a. m., así que sin esto
  // el resultado dependería de la hora a la que corre la prueba.
  await page.evaluate(async () => {
    const st = await import('/src/data/store.js');
    const pedro = (await st.list('choferes')).find((c) => c.nombre.startsWith('Pedro José'));
    for (const r of await st.list('asistencia')) if (r.choferId === pedro.id) await st.remove('asistencia', r.id);
  });
  await ir(page, 'asistencia');
  await page.waitForSelector('[data-lista] .item');
  const hoyClaveE2E = await page.evaluate(async () => (await import('/src/core/time.js')).hoyClave());
  const fila = page.locator('[data-lista] .item', { hasText: 'Pedro José Almonte' });
  ok((await page.locator('[data-lista] > li').count()) === 5, 'la lista del día muestra a los 5 choferes');
  ok((await fila.textContent()).includes('Sin registro'), 'un chofer sin entrada hoy figura "Sin registro"');
  await fila.locator('[data-marcar="entrada"]').click();
  await page.waitForSelector('dialog.sheet form #f-entrada');
  ok(/^\d{2}:\d{2}$/.test(await page.inputValue('#f-entrada')), 'hoy la hora de entrada viene propuesta (se puede cambiar)');
  await page.fill('#f-entrada', '08:15');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  ok(await espera(async () => (await fila.textContent()).includes('Entró 8:15 a. m. · en turno')), 'marcar entrada con la hora escrita a mano');
  ok((await fila.textContent()).includes('En turno'), 'y el chofer queda "En turno"');
  // No se puede marcar otra entrada con una abierta; la salida se marca desde el mismo botón.
  ok((await fila.locator('[data-marcar="entrada"]').count()) === 0 && (await fila.locator('[data-marcar="salida"]').count()) === 1, 'con el turno abierto solo se ofrece "Marcar salida"');
  await fila.locator('[data-marcar="salida"]').click();
  await page.waitForSelector('dialog.sheet form #f-salida');
  await page.fill('#f-salida', '08:15');
  await page.click('dialog.sheet button[type=submit]');
  ok((await page.textContent('#f-salida-err')).includes('distinta'), 'la salida igual a la entrada se rechaza junto al campo');
  await page.fill('#f-salida', '17:40');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  ok(await espera(async () => (await fila.textContent()).includes('Salió 5:40 p. m. · 9 h 25 min') && (await fila.textContent()).includes('Completo')), 'marcar salida: 9 h 25 min de turno');

  // Corregir/agregar un registro desde el historial: turno nocturno 22:00 → 06:00 (cruza la medianoche).
  await fila.locator('[data-historial]').click();
  await page.waitForSelector('dialog.sheet [data-agregar]');
  await page.click('[data-agregar]');
  await page.waitForSelector('dialog.sheet form #f-entrada');
  await page.fill('#f-fecha', await page.evaluate(async () => (await import('/src/core/time.js')).sumarDias((await import('/src/core/time.js')).hoyClave(), -3)));
  await page.fill('#f-entrada', '22:00');
  await page.fill('#f-salida', '06:00');
  await page.locator('dialog.sheet form button[type=submit], dialog.sheet button[type=submit]').last().click();
  ok(await espera(async () => (await page.locator('dialog.sheet[open] [data-historial]', { hasText: '(día sig.)' }).count()) >= 0 && (await page.textContent('dialog.sheet[open]')).includes('Salió 6:00 a. m. (día sig.) · 8 h')), 'turno nocturno de 8 h cruza la medianoche');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });

  // Un turno nocturno abierto ayer sigue "En turno" hoy y se cierra con la salida del día siguiente.
  await page.evaluate(async () => {
    const st = await import('/src/data/store.js'); const t = await import('/src/core/time.js');
    const chofer = (await st.list('choferes')).find((c) => c.nombre.startsWith('Luis Manuel'));
    const ayer = t.sumarDias(t.hoyClave(), -1);
    // Se cierran los de ejemplo de este chofer para que el único abierto sea el nocturno de la prueba.
    for (const r of (await st.list('asistencia')).filter((x) => x.choferId === chofer.id && !x.salida)) await st.update('asistencia', r.id, { salida: t.sumarMinutos(r.entrada, 480) });
    await st.create('asistencia', { choferId: chofer.id, fecha: ayer, entrada: t.aISO(ayer, '22:00'), salida: null });
  });
  await ir(page, 'inicio');
  await ir(page, 'asistencia');
  await page.waitForSelector('[data-lista] .item');
  const nocturno = page.locator('[data-lista] .item', { hasText: 'Luis Manuel' });
  ok(await espera(async () => (await nocturno.textContent()).includes('Desde ayer · Entró 10:00 p. m.')), 'el turno que empezó ayer y sigue abierto aparece hoy como "Desde ayer"');
  await nocturno.locator('[data-marcar="salida"]').click();
  await page.waitForSelector('dialog.sheet form #f-salida');
  await page.fill('#f-salida', '06:10');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const cerrado = (await leer(page, 'asistencia')).find((r) => r.fecha !== hoyClaveE2E && r.entrada.includes('T02:00:00') && r.salida);
  ok(cerrado && cerrado.salida > cerrado.entrada, 'la salida de madrugada se guarda al día siguiente de la entrada');

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

  // ---- Fase 4: combustible (rendimiento, precio por galón, recibo) y avisos ----
  await ir(page, 'combustible');
  await page.waitForSelector('[data-lista] .item');
  ok((await page.locator('.item', { hasText: 'I067310' }).first().textContent()).includes('más alto de lo normal'), 'la carga anómala de los datos de ejemplo se marca');
  const kmAntes = Math.max(...(await leer(page, 'combustible')).filter((c) => c.vehiculoId === 'ej-vehiculo-1').map((c) => c.km));
  await page.click('[data-nuevo]');
  await page.waitForSelector('dialog.sheet form #f-cantidad');
  ok((await page.inputValue('#f-fecha')) === (await page.evaluate(async () => (await import('/src/core/time.js')).hoyClave())), 'la carga nueva trae la fecha de hoy');
  ok(await page.isChecked('#f-tanqueLleno'), '"Tanque lleno" viene marcado');
  ok((await page.inputValue('#f-tipo')) === 'Gasoil', 'tipo por defecto: Gasoil');
  await page.selectOption('#f-vehiculoId', { label: 'I045821' });
  await page.fill('#f-cantidad', '20');
  await page.fill('#f-monto', '4,702');
  await page.fill('#f-km', String(kmAntes + 480));
  await page.fill('#f-estacion', 'Estación de prueba');
  await page.setInputFiles('#f-fotoId', require('path').resolve(__dirname, '../icons/icon-512.png'));
  await page.waitForSelector('[data-foto-campo="fotoId"] img');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const nueva = page.locator('[data-lista] .item', { hasText: 'Estación de prueba' });
  ok(await espera(async () => (await nueva.count()) === 1), 'carga guardada');
  const textoCarga = await nueva.textContent();
  ok(textoCarga.includes('24.0 km/gal'), 'rendimiento calculado: 480 km ÷ 20 gal = 24.0 km/gal');
  ok(textoCarga.includes('RD$235.10/gal'), 'precio por galón: RD$235.10');
  const cargaGuardada = (await leer(page, 'combustible')).find((c) => c.estacion === 'Estación de prueba');
  const recibo = await page.evaluate(async (id) => {
    const blob = await (await import('/src/data/store.js')).leerFoto(id);
    const bmp = await createImageBitmap(blob);
    return Math.max(bmp.width, bmp.height);
  }, cargaGuardada.fotoId);
  ok(recibo <= 800 && cargaGuardada.monto === 4702, `foto del recibo guardada (${recibo} px) y monto leído con separador de miles`);

  // Avisos en Inicio y cada uno abre su ficha.
  await ir(page, 'inicio');
  await page.waitForSelector('.stat');
  // La tarjeta muestra los 3 primeros; la lista completa está en "Ver todos".
  await page.click('[data-ver-avisos]');
  await page.waitForSelector('dialog.sheet[open] li');
  const avisosTexto = await page.textContent('dialog.sheet[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  ok(avisosTexto.includes('Licencia vence en 10 días'), 'aviso: licencia por vencer');
  ok(avisosTexto.includes('Seguro vence en 12 días'), 'aviso: seguro por vencer');
  ok(/Mantenimiento: faltan 350 km/.test(avisosTexto), 'aviso: mantenimiento por kilometraje');
  ok(/peor que su promedio/.test(avisosTexto), 'aviso: combustible más alto de lo normal');
  await page.click('[data-ver-avisos]');
  await page.locator('dialog.sheet[open] a', { hasText: 'Seguro vence' }).click();
  ok(await espera(async () => (await page.locator('dialog.sheet[open] #f-placa').count()) === 1 && (await page.inputValue('#f-placa')) === 'I067310'), 'el aviso de seguro abre la ficha del vehículo');
  await page.keyboard.press('Escape');

  // ---- Fase 5: Inicio "Resumen con números" ----
  await ir(page, 'inicio');
  await page.waitForSelector('.graf svg');
  ok((await page.textContent('#header-title')) === 'Dilo group', 'el encabezado de Inicio muestra la empresa');
  const fechaEnc = await page.textContent('#header-company');
  const fechaEsp = await page.evaluate(async () => { const f = await import('/src/core/format.js'); const t = await import('/src/core/time.js'); const x = f.fechaLarga(t.hoyClave()); return x[0].toUpperCase() + x.slice(1); });
  ok(fechaEnc === fechaEsp, `y la fecha de hoy (${fechaEnc})`);
  const tarjetas = await page.locator('.stat__label').allTextContents();
  ok(JSON.stringify(tarjetas) === JSON.stringify(['Viajes de hoy', 'Retrasos de hoy', 'Combustible de hoy', 'Choferes activos']), 'cuatro tarjetas: ' + tarjetas.join(' · '));
  const esperado = await page.evaluate(async () => {
    const st = await import('/src/data/store.js'); const t = await import('/src/core/time.js');
    const hoy = t.hoyClave();
    const viajes = (await st.list('viajes')).filter((v) => t.fechaClave(v.salidaProg) === hoy);
    const gal = (await st.list('combustible')).filter((c) => c.fecha === hoy).reduce((a, c) => a + c.cantidad, 0);
    return { viajes: viajes.length, choferes: (await st.list('choferes')).length, gal: Math.round(gal * 10) / 10 };
  });
  const valores = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-contador]')].map((n) => [n.dataset.contador, n.textContent])));
  ok(valores.viajes === String(esperado.viajes) && valores.choferes === String(esperado.choferes), `totales coinciden con los datos (viajes ${valores.viajes}, choferes ${valores.choferes})`);
  ok(valores.combustible === esperado.gal.toFixed(1), `combustible de hoy en galones (${valores.combustible})`);
  // Avisos: lista corta (3) con "Ver todos" que abre la lista completa.
  ok((await page.locator('[data-avisos] > li').count()) === 3, 'la tarjeta de avisos muestra 3');
  const total = Number((await page.textContent('[data-ver-avisos]')).match(/\((\d+)\)/)[1]);
  await page.click('[data-ver-avisos]');
  await page.waitForSelector('dialog.sheet[open]');
  ok((await page.locator('dialog.sheet[open] li').count()) === total && total > 3, `"Ver todos" abre la lista completa (${total})`);
  ok((await page.textContent('dialog.sheet[open]')).includes('Urgente') || (await page.textContent('dialog.sheet[open]')).includes('Atención'), 'cada aviso indica su nivel con texto');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });

  // Gráfica: 7 columnas, la última (hoy) resaltada, tooltip con teclado y tabla alternativa.
  ok((await page.locator('.graf__col').count()) === 7, 'la gráfica tiene 7 días');
  ok((await page.locator('.graf__col--hoy').count()) === 1 && (await page.locator('.graf__col').last().getAttribute('class')).includes('graf__col--hoy'), 'solo la barra de hoy está resaltada (la última)');
  ok((await page.locator('.graf__x--hoy').first().textContent()) === 'hoy', 'el eje marca "hoy"');
  const colorHoy = await page.evaluate(() => {
    const css = (el) => getComputedStyle(el).fill;
    const barras = [...document.querySelectorAll('.graf__col')].map((c) => c.querySelector('.graf__barra')).filter(Boolean);
    return { n: barras.length, distintas: new Set(barras.map(css)).size };
  });
  ok(colorHoy.n >= 1, `hay barras dibujadas (${colorHoy.n})`);
  const alturas = await page.evaluate(() => [...document.querySelectorAll('.graf__barra')].map((b) => Math.round(b.getBBox().width)));
  ok(alturas.every((w) => w <= 24), 'ninguna barra pasa de 24 px de grosor');
  await page.focus('.graf__col >> nth=0');
  ok(await page.locator('.graf__tip').isVisible(), 'el tooltip aparece al enfocar una columna con el teclado');
  ok(/retraso/.test(await page.textContent('.graf__tip')), 'el tooltip da el valor');
  await page.keyboard.press('Escape');
  ok(await page.locator('.graf__tip').isHidden(), 'Escape cierra el tooltip');
  await page.click('.graf__tabla summary');
  ok((await page.locator('.graf__tabla tbody tr').count()) === 7, 'la tabla alternativa lista los 7 días');
  const sumaTabla = await page.evaluate(() => [...document.querySelectorAll('.graf__tabla tbody tr')].reduce((a, tr) => a + Number(tr.cells[2].textContent), 0));
  const sumaBarras = await page.evaluate(async () => {
    const st = await import('/src/data/store.js'); const t = await import('/src/core/time.js'); const ag = await import('/src/core/agregados.js'); const pr = JSON.parse(localStorage.getItem('ct:prefs'));
    return ag.retrasosPorDia(await st.list('viajes'), { hoy: t.hoyClave(), tolerancia: pr.toleranciaMin }).reduce((a, d) => a + d.retrasos, 0);
  });
  ok(sumaTabla === sumaBarras, `la tabla suma lo mismo que los datos (${sumaTabla})`);
  // Lista de los viajes de hoy con su estado.
  ok((await page.locator('[data-lista] .item').count()) === esperado.viajes, 'la lista muestra los viajes de hoy con su estado');
  ok((await page.locator('[data-lista] .item .chip').count()) >= esperado.viajes, 'cada viaje lleva su chip de estado');

  // ---- Fase 6: reportes, compartir por WhatsApp y CSV ----
  // Se instrumenta la página para capturar lo que se comparte (sin abrir nada de verdad).
  await ir(page, 'reportes');
  await page.waitForSelector('[data-whatsapp="resumen"]');
  const titulosReportes = await page.locator('main .section__title').allTextContents();
  ok(['Resumen del día', 'Retrasos por chofer', 'Retrasos por ruta', 'Combustible por semana o mes', 'Combustible por vehículo'].every((t) => titulosReportes.includes(t)), 'están los 5 reportes: ' + titulosReportes.join(' · '));
  ok((await page.locator('[data-whatsapp]').count()) === 5, 'cada reporte tiene "Compartir por WhatsApp"');
  ok((await page.locator('[data-csv]').count()) === 4, 'y CSV como extra (4: el resumen diario solo se comparte)');

  // Con Web Share API: se comparte el texto limpio.
  await page.evaluate(() => { window.__compartido = []; navigator.share = (d) => { window.__compartido.push(d.text); return Promise.resolve(); }; });
  await page.click('[data-whatsapp="resumen"]');
  await espera(async () => (await page.evaluate(() => window.__compartido.length)) === 1);
  const texto = await page.evaluate(() => window.__compartido[0]);
  ok(texto.startsWith('*Dilo group · Resumen del día*') && /\*Viajes:\* \d+/.test(texto) && texto.includes('*Combustible:*') && texto.includes('*Avisos:*'), 'el resumen diario se comparte con la Web Share API');
  ok(texto.split('\n').every((l) => l.length <= 112) && !/[|\t]/.test(texto), 'el texto son líneas cortas, sin tablas');
  const ayer = await page.evaluate(async () => (await import('/src/core/time.js')).sumarDias((await import('/src/core/time.js')).hoyClave(), -1));
  await page.fill('[data-dia]', ayer);
  await page.dispatchEvent('[data-dia]', 'change');
  await page.waitForSelector('[data-whatsapp="resumen"]');
  await page.click('[data-whatsapp="resumen"]');
  await espera(async () => (await page.evaluate(() => window.__compartido.length)) === 2);
  ok(!(await page.evaluate(() => window.__compartido[1])).includes('*Avisos:*'), 'un día pasado no lleva avisos (son del presente)');

  // Cancelar la hoja de compartir no es un error ni abre otra cosa.
  await page.evaluate(() => { window.__abiertas = []; window.open = (u) => { window.__abiertas.push(u); return null; }; navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })); });
  await page.click('[data-whatsapp="retrasos-chofer"]');
  await page.waitForTimeout(150);
  ok((await page.evaluate(() => window.__abiertas.length)) === 0, 'cancelar la hoja de compartir no abre WhatsApp');

  // Sin Web Share API: abre https://wa.me/?text=… con el texto codificado.
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('[data-whatsapp="retrasos-chofer"]');
  await espera(async () => (await page.evaluate(() => window.__abiertas.length)) === 1);
  const url = await page.evaluate(() => window.__abiertas[0]);
  ok(url.startsWith('https://wa.me/?text=') && decodeURIComponent(url.slice(20)).startsWith('*Dilo group · Retrasos por chofer*'), 'sin Web Share API se abre wa.me con el texto codificado');

  // Combustible por vehículo: tabla con rendimiento y CSV.
  const filaVeh = page.locator('#t-combustible-vehiculo').locator('xpath=ancestor::section').locator('tbody tr', { hasText: 'I045821' });
  await page.click('[data-periodo="30d"]');
  ok(await espera(async () => /\d+\.\d/.test(await filaVeh.locator('td').last().textContent())), 'combustible por vehículo muestra el rendimiento km/gal');
  for (const [id, cabecera] of [['retrasos-chofer', 'Chofer,Viajes'], ['retrasos-ruta', 'Ruta,Viajes'], ['combustible-periodo', 'Semana (lunes),Cargas'], ['combustible-vehiculo', 'Vehículo,Cargas']]) {
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click(`[data-csv="${id}"]`)]);
    const csvTexto = require('fs').readFileSync(await descarga.path(), 'utf8');
    ok(csvTexto.startsWith(`﻿${cabecera}`), `CSV ${id} (${descarga.suggestedFilename()})`);
  }

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

  // Umbrales de avisos editables: validan junto al campo y se aplican al instante.
  await page.fill('#f-aviso-licenciaDias', '0');
  await page.dispatchEvent('#f-aviso-licenciaDias', 'change');
  ok((await page.textContent('#f-aviso-licenciaDias-err')).includes('1 a 5 números'), 'umbral de licencia inválido se rechaza junto al campo');
  await page.fill('#f-aviso-licenciaDias', '7, 3');
  await page.dispatchEvent('#f-aviso-licenciaDias', 'change');
  ok((await page.inputValue('#f-aviso-licenciaDias')) === '7, 3', 'el umbral válido se ordena y se guarda (7, 3)');
  await ir(page, 'inicio');
  await page.waitForSelector('.graf svg');
  // Si quedan 3 avisos o menos, Inicio los muestra todos y no hay botón "Ver todos" (depende de cuántos viajes estén retrasados a esa hora).
  let textoAvisos;
  if ((await page.locator('[data-ver-avisos]').count()) > 0) {
    await page.click('[data-ver-avisos]');
    textoAvisos = await page.textContent('dialog.sheet[open]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.sheet', { state: 'detached' });
  } else {
    textoAvisos = await page.textContent('[data-avisos]');
  }
  ok(!textoAvisos.includes('Licencia vence en 10 días'), 'con umbral de 7 días, la licencia que vence en 10 ya no avisa');
  await ir(page, 'ajustes');
  await page.click('[data-restablecer-avisos]');
  await page.waitForSelector('#f-aviso-licenciaDias');
  ok(await espera(async () => (await page.inputValue('#f-aviso-licenciaDias')) === '30, 15, 7'), 'restablecer vuelve a los valores de la configuración');

  // Respaldo: exportar → borrar los datos de prueba → importar restaura.
  const fotosAntes = await page.evaluate(async () => (await (await import('/src/data/store.js')).listarFotos()).length);
  const [resp] = await Promise.all([page.waitForEvent('download'), page.click('[data-exportar]')]);
  const rutaResp = await resp.path();
  const respaldoJson = JSON.parse(require('fs').readFileSync(rutaResp, 'utf8'));
  ok(respaldoJson.formato === 2 && respaldoJson.fotos.length === fotosAntes && fotosAntes >= 1, `el respaldo incluye las fotos (${respaldoJson.fotos.length})`);
  ok(respaldoJson.fotos.every((f) => /^data:image\/jpeg;base64,/.test(f.datos)), 'las fotos van en base64 (JPEG)');
  const totalAntes = (await leer(page, 'viajes')).length;
  await page.evaluate(async () => (await import('/tests/fixtures/ejemplo.js')).borrarDatosEjemplo());
  await espera(async () => (await leer(page, 'viajes')).every((v) => !v.ejemplo));
  const quedan = await leer(page, 'viajes');
  ok(quedan.length >= 1 && quedan.every((v) => !v.ejemplo), `se borraron los datos de prueba; quedan ${quedan.length} viaje(s) creados por la prueba`);
  ok((await page.locator('[data-borrar-ejemplo]').count()) === 0 && (await page.locator('#badge-ejemplo').count()) === 0, 'la app ya no tiene botón ni franja de "datos de ejemplo"');
  const campoViejo = await page.$('#f-importar');
  await page.setInputFiles('#f-importar', rutaResp);
  await page.click('dialog.modal [data-r="1"]');
  ok(await espera(async () => (await leer(page, 'viajes')).length === totalAntes), 'importar respaldo restaura todos los viajes');
  ok(await espera(async () => (await page.evaluate(async () => (await (await import('/src/data/store.js')).listarFotos()).length)) === fotosAntes), 'importar el respaldo restaura también las fotos');
  const restauradaOk = await page.evaluate(async () => {
    const st = await import('/src/data/store.js');
    const carga = (await st.list('combustible')).find((c) => c.fotoId);
    const blob = carga ? await st.leerFoto(carga.fotoId) : null;
    return Boolean(blob && blob.type === 'image/jpeg' && blob.size > 100);
  });
  ok(restauradaOk, 'la foto restaurada sigue ligada a su carga y es un JPEG válido');
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
  // Actualización de la base v1 → v2: lo que había en 'turnos' pasa a 'asistencia' sin perderse.
  {
    const ctx4 = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p4 = await ctx4.newPage();
    const origen = new URL(base).origin;
    await p4.goto(`${origen}/manifest.webmanifest`); // mismo origen, sin código de la app: así se crea la base vieja primero
    await p4.evaluate(async () => {
      await new Promise((ok, mal) => {
        const pet = indexedDB.open('dilo-transporte', 1);
        pet.onupgradeneeded = () => {
          const db = pet.result;
          for (const n of ['choferes', 'rutas', 'vehiculos', 'viajes', 'combustible', 'turnos', 'fotos']) db.createObjectStore(n, { keyPath: 'id' });
        };
        pet.onsuccess = () => {
          const db = pet.result;
          const t = db.transaction(['choferes', 'turnos'], 'readwrite');
          t.objectStore('choferes').put({ id: 'c1', nombre: 'Chofer de la base vieja', archivado: false });
          t.objectStore('turnos').put({ id: 't1', choferId: 'c1', fecha: '2026-10-01', entrada: '2026-10-01T09:00:00.000Z', salida: '2026-10-01T17:00:00.000Z' });
          t.oncomplete = () => { db.close(); ok(); };
          t.onerror = () => mal(t.error);
        };
        pet.onerror = () => mal(pet.error);
      });
      localStorage.setItem('ct:prefs', JSON.stringify({ sembrado: true }));
    });
    await p4.goto(`${base}#/asistencia`);
    await p4.waitForSelector('[data-lista] .item');
    const migrado = await p4.evaluate(async () => {
      const st = await import('/src/data/store.js');
      const nombres = await new Promise((ok) => { const r = indexedDB.open('dilo-transporte'); r.onsuccess = () => { const n = [...r.result.objectStoreNames]; r.result.close(); ok(n); }; });
      return { asistencia: (await st.list('asistencia')).map((x) => x.id), chofer: (await st.list('choferes')).map((c) => c.nombre), almacenes: nombres };
    });
    ok(JSON.stringify(migrado.asistencia) === '["t1"]' && migrado.chofer[0] === 'Chofer de la base vieja', 'al actualizar la base, los turnos pasan a asistencia sin perderse');
    ok(!migrado.almacenes.includes('turnos') && migrado.almacenes.includes('asistencia'), 'y el almacén viejo "turnos" desaparece');
    await ctx4.close();
  }

  // El módulo se oculta con CONFIG.modulos.asistencia = false (menú y ruta).
  {
    const ctx5 = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await ctx5.route('**/src/config.js', async (route) => {
      const resp = await route.fetch();
      await route.fulfill({ response: resp, body: (await resp.text()).replace('asistencia: true', 'asistencia: false') });
    });
    await ctx5.addInitScript(() => localStorage.setItem('ct:prefs', JSON.stringify({ sembrado: true })));
    const p5 = await ctx5.newPage();
    await p5.goto(`${base}#/mas`);
    await p5.waitForSelector('.menu');
    ok((await p5.locator('.menu a', { hasText: 'Asistencia' }).count()) === 0, 'con asistencia en false desaparece del menú');
    await p5.evaluate(() => { location.hash = '#/asistencia'; });
    await p5.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Dilo group');
    ok(true, 'y su dirección lleva a Inicio');
    await ctx5.close();
  }

  // Inicio sin datos: todo en cero y estado vacío positivo (no depende de la hora del día).
  {
    const ctx3 = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'America/Santo_Domingo' });
    await ctx3.addInitScript(() => localStorage.setItem('ct:prefs', JSON.stringify({ sembrado: true })));
    const p3 = await ctx3.newPage();
    await p3.goto(`${base}#/inicio`);
    await p3.waitForSelector('.graf svg');
    ok((await p3.textContent('[data-avisos], #t-avisos ~ .empty, .empty__title')).includes('Todo en orden'), 'sin avisos: estado vacío positivo "Todo en orden"');
    const ceros = await p3.evaluate(() => [...document.querySelectorAll('[data-contador]')].map((n) => n.textContent).join(','));
    ok(ceros.split(',').every((x) => Number(x) === 0) && ceros.split(',').length === 4, `con la base vacía las cuatro tarjetas están en 0 (${ceros})`);
    ok((await p3.locator('.graf__barra').count()) === 0 && (await p3.locator('.graf__col').count()) === 7, 'la gráfica muestra 7 días sin barras');
    ok((await p3.textContent('.section:last-of-type')).includes('No hay viajes programados hoy'), 'sin viajes: estado vacío con instrucción');
    // La app arranca vacía: Inicio guía el orden (vehículos → choferes → rutas → viajes) y cada paso lleva a su pantalla.
    ok((await p3.locator('[data-pasos] [data-paso]').count()) === 4 && (await p3.locator('[data-pasos] .paso--hecho').count()) === 0, 'Inicio vacío muestra los 4 primeros pasos, ninguno hecho');
    ok((await p3.getAttribute('[data-paso="vehiculos"]', 'href')) === '#/vehiculos' && (await p3.getAttribute('[data-paso="rutas"]', 'href')) === '#/rutas', 'cada paso lleva a su pantalla');
    ok((await p3.locator('.badge-ejemplo, #badge-ejemplo').count()) === 0 && (await p3.locator('.item').count()) === 0, 'sin datos inventados en ninguna parte');
    ok(await p3.locator('#demo-note').isVisible(), 'sigue el aviso "Modo demostración: guardado solo en este dispositivo"');
    // Al agregar un vehículo, un chofer y una ruta con horario, la guía desaparece sola.
    await p3.evaluate(async () => {
      const st = await import('/src/data/store.js');
      await st.create('vehiculos', { placa: 'A123456', estado: 'disponible' });
      await st.create('choferes', { nombre: 'Primer chofer' });
      await st.create('rutas', { nombre: 'Ruta 1', origen: 'A', destino: 'B', duracionMin: 30, horarios: ['06:00'] });
    });
    await p3.reload();
    await p3.waitForSelector('.graf svg');
    ok(await espera(async () => (await p3.locator('[data-pasos]').count()) === 0), 'con vehículo, chofer y ruta con horario la guía de primeros pasos desaparece');
    await ctx3.close();
  }

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

  // Reporte de combustible para el jefe: elegir periodo y facturas; enviar por WhatsApp o descargar (PDF / CSV).
  {
    await ir(page, 'combustible');
    await page.click('a[href="#/reporte-combustible"]');
    await page.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Reporte de combustible');
    await page.waitForSelector('[data-carga]');
    const esperadas = await page.evaluate(async () => {
      const st = await import('/src/data/store.js');
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
      const todas = (await st.list('combustible')).filter((c) => !c.archivado);
      return { dia: todas.filter((c) => c.fecha === hoy).length, mes: todas.filter((c) => c.fecha.slice(0, 7) === hoy.slice(0, 7)).length, hoy };
    });
    const nCargas = () => page.locator('[data-carga]').count();
    ok(esperadas.dia >= 1 && (await nCargas()) === esperadas.dia, `diario: lista las ${esperadas.dia} carga(s) de hoy, todas marcadas`);
    ok((await page.locator('[data-carga]:checked').count()) === esperadas.dia, 'por defecto van todas las facturas');

    await page.click('[data-tipo="mes"]');
    ok(await espera(async () => (await nCargas()) === esperadas.mes), `mensual: lista las ${esperadas.mes} cargas del mes`);
    const cargasStat = () => page.evaluate(() => Number(document.querySelector('[data-resumen] .stat__value')?.textContent));
    ok((await cargasStat()) === esperadas.mes, 'el resumen cuenta todas las cargas');

    // Quitar una factura: el resumen y el mensaje cambian.
    const msgAntes = await page.textContent('[data-mensaje]');
    await page.locator('[data-carga]').first().uncheck();
    ok(await espera(async () => (await cargasStat()) === esperadas.mes - 1), 'al quitar una factura el resumen baja en una carga');
    ok((await page.textContent('[data-conteo]')).includes(`${esperadas.mes - 1} de ${esperadas.mes}`), 'el conteo dice cuántas van elegidas');
    ok((await page.textContent('[data-mensaje]')) !== msgAntes, 'el mensaje de WhatsApp cambia con la selección');

    // Con una factura quitada el botón dice "Marcar todas"; con todas marcadas, "Quitar todas". Sin ninguna elegida no se envía.
    ok((await page.textContent('[data-todas]')) === 'Marcar todas', 'con una factura quitada, el botón ofrece "Marcar todas"');
    await page.click('[data-todas]');
    ok(await espera(async () => (await cargasStat()) === esperadas.mes && (await page.textContent('[data-todas]')) === 'Quitar todas'), '"Marcar todas" las elige todas');
    await page.click('[data-todas]');
    ok(await espera(async () => (await page.locator('[data-enviar]').isDisabled()) && (await page.locator('[data-pdf]').isDisabled()) && (await page.locator('[data-csv]').isDisabled())), 'sin facturas elegidas no se puede enviar ni descargar');
    await page.click('[data-todas]');
    ok(await espera(async () => (await cargasStat()) === esperadas.mes && !(await page.locator('[data-enviar]').isDisabled())), 'marcar todas lo reactiva');

    // Descargas: PDF y CSV con el nombre y el contenido esperados.
    const mesClave = esperadas.hoy.slice(0, 7);
    const [dPdf] = await Promise.all([page.waitForEvent('download'), page.click('[data-pdf]')]);
    ok(dPdf.suggestedFilename() === `combustible-mensual-${mesClave}.pdf`, `PDF mensual descargado: ${dPdf.suggestedFilename()}`);
    const pdf = require('fs').readFileSync(await dPdf.path()).toString('latin1');
    ok(pdf.startsWith('%PDF-1.4') && pdf.includes('Reporte mensual de combustible') && pdf.trimEnd().endsWith('%%EOF'), 'el archivo es un PDF con el título del reporte');
    const [dCsv] = await Promise.all([page.waitForEvent('download'), page.click('[data-csv]')]);
    ok(dCsv.suggestedFilename() === `combustible-mensual-${mesClave}.csv`, `CSV mensual descargado: ${dCsv.suggestedFilename()}`);
    const csv = require('fs').readFileSync(await dCsv.path(), 'utf8');
    ok(csv.includes('TOTAL') && csv.split('\r\n').filter(Boolean).length === esperadas.mes + 2, 'el CSV trae una fila por carga más encabezado y total');

    // Una factura con foto real (JPEG) entra al PDF.
    await page.evaluate(async () => {
      const st = await import('/src/data/store.js');
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
      const lienzo = document.createElement('canvas');
      lienzo.width = 200; lienzo.height = 300;
      const cx = lienzo.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 200, 300); cx.fillStyle = '#12334a'; cx.fillRect(20, 20, 160, 40);
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.7));
      const id = await st.guardarFoto(blob);
      const carga = (await st.list('combustible')).find((c) => c.fecha === hoy);
      await st.update('combustible', carga.id, { fotoId: id });
    });
    await page.reload();
    await page.waitForSelector('[data-carga]');
    ok(await espera(async () => (await page.locator('[data-lista] .avatar--recibo img').count()) >= 1), 'la lista muestra la miniatura de la factura con foto');
    ok(!(await page.locator('[data-fotos]').isDisabled()), 'con una factura con foto se puede incluir las fotos');
    const [dPdf2] = await Promise.all([page.waitForEvent('download'), page.click('[data-pdf]')]);
    const pdfFoto = require('fs').readFileSync(await dPdf2.path()).toString('latin1');
    ok(pdfFoto.includes('/DCTDecode') && pdfFoto.includes('/Subtype /Image'), 'el PDF incluye la foto de la factura');
    await page.uncheck('[data-fotos]');
    const [dPdf3] = await Promise.all([page.waitForEvent('download'), page.click('[data-pdf]')]);
    ok(!require('fs').readFileSync(await dPdf3.path()).toString('latin1').includes('/DCTDecode'), 'sin marcar "incluir fotos" el PDF no lleva imágenes');
    await page.check('[data-fotos]');

    // WhatsApp con la hoja de compartir (se simula): comparte el PDF junto con el texto.
    await page.evaluate(() => {
      window.__comp = null;
      navigator.canShare = () => true;
      navigator.share = async (d) => { window.__comp = { archivos: (d.files || []).map((f) => ({ nombre: f.name, tipo: f.type, tam: f.size })), texto: d.text }; };
    });
    await page.click('[data-enviar]');
    ok(await espera(() => page.evaluate(() => window.__comp !== null)), 'enviar por WhatsApp abre la hoja de compartir');
    const comp = await page.evaluate(() => window.__comp);
    ok(comp.archivos.length === 1 && comp.archivos[0].tipo === 'application/pdf' && comp.archivos[0].nombre.endsWith('.pdf') && comp.archivos[0].tam > 1000, `comparte el PDF adjunto (${comp.archivos[0]?.nombre}, ${comp.archivos[0]?.tam} bytes)`);
    ok(comp.texto.includes('Combustible del día') && comp.texto.includes('*Total:*'), 'y el texto del reporte (al recargar, vuelve a Diario)');

    // Sin soporte de archivos: abre WhatsApp con el texto, directo al chat del jefe si se indicó su número.
    await page.fill('[data-jefe]', '809-555-0100');
    await page.dispatchEvent('[data-jefe]', 'change');
    ok((await page.evaluate(() => JSON.parse(localStorage.getItem('ct:prefs')).jefeWhatsapp)) === '8095550100', 'el número del jefe se recuerda en el teléfono');
    await page.fill('[data-jefe]', '12345');
    await page.dispatchEvent('[data-jefe]', 'change');
    ok((await page.textContent('#jefe-err')).includes('10 dígitos'), 'un número inválido muestra el error junto al campo');
    await page.fill('[data-jefe]', '809-555-0100');
    await page.dispatchEvent('[data-jefe]', 'change');
    await page.evaluate(() => {
      navigator.canShare = undefined;
      navigator.share = undefined;
      window.__abierto = null;
      window.open = (u) => { window.__abierto = u; return null; };
    });
    await page.click('[data-enviar]');
    ok(await espera(() => page.evaluate(() => window.__abierto !== null)), 'sin hoja de compartir se abre WhatsApp');
    const abierto = await page.evaluate(() => window.__abierto);
    ok(abierto.startsWith('https://wa.me/18095550100?text=') && decodeURIComponent(abierto).includes('Combustible del día'), 'al chat del jefe, con el texto ya escrito');
    ok((await page.textContent('#toasts')).includes('no permite adjuntar el PDF'), 'y avisa que el PDF hay que adjuntarlo a mano');
  }

  // Movimiento (sin "reducir movimiento"): tarjetas que entran escalonadas, indicador que se desliza y onda al cambiar de tema.
  {
    const ctxM = await navegador.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Santo_Domingo' });
    const pM = await ctxM.newPage();
    pM.setDefaultTimeout(8000);
    const erroresM = [];
    pM.on('pageerror', (e) => erroresM.push(e.message));
    await abrirConEjemplo(pM, base, '#/inicio');
    await pM.waitForSelector('.view--bento.entra');
    const entrada = await pM.evaluate(() => {
      const hijos = [...document.querySelector('.view--bento').children];
      return { indices: hijos.slice(0, 4).map((c) => c.style.getPropertyValue('--i')), nombre: getComputedStyle(hijos[2]).animationName, retraso: getComputedStyle(hijos[2]).animationDelay };
    });
    ok(entrada.indices.join(',') === '0,1,2,3' && entrada.nombre === 'tarjeta-in' && parseFloat(entrada.retraso) > 0, `las tarjetas de Inicio entran escalonadas (${entrada.indices.join(',')}, retraso ${entrada.retraso})`);

    // Indicador deslizante del selector Diario / Mensual.
    await pM.evaluate(() => { location.hash = '#/reporte-combustible'; });
    await pM.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Reporte de combustible');
    await pM.waitForSelector('.segmented[data-pill]');
    const xAntes = await pM.evaluate(() => document.querySelector('.segmented').style.getPropertyValue('--pill-x'));
    await pM.click('[data-tipo="mes"]');
    ok(await espera(async () => (await pM.evaluate(() => document.querySelector('.segmented').style.getPropertyValue('--pill-x'))) !== xAntes), 'al elegir otra opción el indicador cambia de lugar');
    const trans = await pM.evaluate(() => getComputedStyle(document.querySelector('.segmented'), '::before').transitionDuration);
    ok(trans.includes('0.28s'), `y se desliza en vez de saltar (${trans})`);
    ok((await pM.evaluate(() => getComputedStyle(document.querySelector('[data-tipo="mes"]')).backgroundColor)) === 'rgba(0, 0, 0, 0)', 'la opción elegida no pinta su propio fondo (lo pone el indicador)');

    // Cambio de tema con onda circular desde el botón.
    ok((await pM.evaluate(() => document.documentElement.dataset.theme)) === 'claro', 'empieza en tema claro');
    await pM.click('#tema-rapido');
    const hubo = await espera(() => pM.evaluate(() => document.getAnimations().some((a) => String(a.effect?.pseudoElement || '').includes('view-transition'))), 1500);
    ok(hubo, 'al cambiar de tema se dibuja la onda circular (View Transition)');
    ok(await espera(async () => (await pM.evaluate(() => document.documentElement.dataset.theme)) === 'oscuro'), 'y el tema pasa a oscuro');
    await pM.click('#tema-rapido');
    ok(await espera(async () => (await pM.evaluate(() => document.documentElement.dataset.theme)) === 'claro'), 'y vuelve a claro');
    ok(!erroresM.length, `sin errores durante el movimiento${erroresM.length ? `: ${erroresM.join(' | ')}` : ''}`);
    await ctxM.close();
  }

  // Actualización: cuando se publica una versión nueva, el service worker nuevo toma el control y la página se recarga
  // sola UNA vez (antes se seguía viendo la copia vieja hasta recargar a mano). Si alguien está escribiendo, espera.
  {
    const act = servidorConVersion();
    const ctxS = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const pS = await ctxS.newPage();
    pS.setDefaultTimeout(8000);
    const versionActual = () => pS.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('ct-app-')).sort().join(','));
    await pS.goto(act.base);
    await pS.evaluate(() => navigator.serviceWorker.ready);
    await pS.reload();
    await pS.waitForFunction(() => navigator.serviceWorker.controller && document.querySelector('#view .view, #view [data-cuerpo]'));
    const v0 = await versionActual();
    await pS.evaluate(() => { window.__marca = 'original'; });
    act.publicar('-a');
    await pS.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    ok(await espera(async () => (await pS.evaluate(() => window.__marca).catch(() => 'recargando')) !== 'original', 8000), 'una versión nueva recarga la página sola');
    await pS.waitForFunction(() => document.querySelector('#view .view, #view [data-cuerpo]'));
    ok(await espera(async () => (await versionActual()).endsWith('-a') && !(await versionActual()).includes(','), 4000), `la caché vieja se reemplaza por la nueva (${v0} → ${await versionActual()})`);

    // Con un formulario abierto no se interrumpe: recarga al cambiar de pantalla.
    await pS.evaluate(() => { location.hash = '#/choferes'; });
    await pS.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Choferes');
    await pS.click('[data-nuevo]');
    await pS.waitForSelector('dialog.sheet form #f-nombre');
    await pS.evaluate(() => { window.__marca = 'con-formulario'; });
    act.publicar('-b');
    await pS.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await pS.waitForTimeout(2500);
    ok((await pS.evaluate(() => window.__marca)) === 'con-formulario', 'con un formulario abierto NO recarga (no se pierde lo que se escribe)');
    await pS.evaluate(() => { location.hash = '#/inicio'; });
    ok(await espera(async () => (await pS.evaluate(() => window.__marca).catch(() => 'recargando')) !== 'con-formulario', 6000), 'y recarga al cambiar de pantalla');
    await ctxS.close();
    act.cerrar();
  }

  await navegador.close();
  servidor.close();
  console.log(fallos ? `\n${fallos} fallo(s).` : '\nFlujos OK.');
  process.exit(fallos ? 1 : 0);
})();
