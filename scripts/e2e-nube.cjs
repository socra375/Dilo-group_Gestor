// Flujos en modo nube (fase 8) contra un Supabase FALSO (scripts/supabase-falso.cjs). Uso: node scripts/e2e-nube.cjs
// Demuestra que la app, con src/config.local.js presente: pide sesión, no muestra ni crea datos de demostración,
// guarda en la API (con fotos en un bucket privado), restaura la sesión, renueva el token, aísla usuarios y cierra sesión.
// NO demuestra que el SQL corra en un Postgres real ni que RLS esté bien configurada en un proyecto: eso se verifica
// aplicando supabase/001_tablas_y_seguridad.sql en un proyecto y repitiendo la prueba de aislamiento (README, fase 8).
const path = require('path');
const { chromium } = require('playwright');
const { crear: crearEstatico } = require('./serve.cjs');
const { crear: crearFalso } = require('./supabase-falso.cjs');

let fallos = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fallos++;
};
async function espera(cond, ms = 5000) {
  const fin = Date.now() + ms;
  for (;;) {
    if (await cond()) return true;
    if (Date.now() > fin) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
}
const titulo = (page) => page.evaluate(() => document.getElementById('header-title')?.textContent);

(async () => {
  const estatico = crearEstatico().listen(0);
  const base = `http://localhost:${estatico.address().port}/index.html`;
  const falso = await crearFalso({ usuarios: { 'ana@dilo.test': 'clave-ana', 'luis@dilo.test': 'clave-luis' } });
  const configLocal = `export const SUPABASE = { url: ${JSON.stringify(falso.url)}, anonKey: 'anon-publica-de-prueba', bucketFotos: 'fotos' };`;
  const navegador = await chromium.launch();

  // config.local.js no existe en el repositorio (está en .gitignore): la prueba lo inyecta, como haría el despliegue.
  // serviceWorkers:'block' para que Playwright vea y pueda interceptar esa petición.
  const nuevoContexto = async () => {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'America/Santo_Domingo', serviceWorkers: 'block' });
    await ctx.route('**/src/config.local.js', (r) => r.fulfill({ contentType: 'text/javascript', body: configLocal }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    page.errores = [];
    page.on('pageerror', (e) => page.errores.push(`${e.message} @ ${(e.stack || '').split('\\n')[1] || ''}`));
    // Los 400/401 de un inicio de sesión fallido o un token vencido son esperados; cualquier otro error de consola, no.
    // Además de esos, el router registra "La sesión terminó" cuando una pantalla se pide justo al perder la sesión
    // (la app responde con la pantalla de entrar; la prueba lo comprueba).
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/status of 401|status of 400/.test(m.text()) || (/La sesión terminó/.test(m.text()) && page.sesionPerdida)) return;
      if (/status of 403/.test(m.text()) && page.ataque) return; // la prueba de aislamiento provoca 403 a propósito
      if (/status of 409/.test(m.text()) && page.rechazoEsperado) return; // la prueba de importación provoca un 409 a propósito (placa repetida)
      page.errores.push(m.text());
    });
    return { ctx, page };
  };
  const entrar = async (page, correo, clave) => {
    await page.fill('#f-email', correo);
    await page.fill('#f-password', clave);
    await page.click('.login button[type=submit]');
  };

  // El service worker se registra al arrancar, ANTES de iniciar sesión (si no, sin sesión nunca llegarían las actualizaciones).
  {
    const ctxR = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    await ctxR.route('**/src/config.local.js', (r) => r.fulfill({ contentType: 'text/javascript', body: configLocal }));
    const pr = await ctxR.newPage();
    pr.setDefaultTimeout(5000);
    await pr.goto(base);
    await pr.waitForSelector('.login');
    ok(await espera(() => pr.evaluate(() => navigator.serviceWorker.getRegistration().then(Boolean))), 'en modo nube el service worker se registra mientras se ve la pantalla de entrar');
    await ctxR.close();
  }

  // ---------- Ana: primera visita ----------
  const A = await nuevoContexto();
  const pa = A.page;
  await pa.goto(base);
  await pa.waitForSelector('.login');
  ok((await titulo(pa)) === 'Entrar' && (await pa.evaluate(() => document.body.classList.contains('modo-nube'))), 'con config.local.js la app arranca en modo nube y pide entrar');
  ok((await pa.locator('#badge-ejemplo').count()) === 0 && (await pa.locator('#demo-note').isHidden()), 'no hay franja de ejemplo ni aviso de demostración en modo nube');
  ok(!(await pa.evaluate(() => [...document.querySelectorAll('.tabbar a, .rail a')].some((a) => a.offsetParent !== null))), 'sin sesión no se ve la navegación (nadie llega a las pantallas)');
  ok((await pa.evaluate(async () => (await indexedDB.databases()).length)) === 0, 'no se creó ninguna base local ni datos de demostración');
  ok(falso.estado.peticiones.every((p) => !p.ruta.startsWith('/rest/')), 'antes de entrar no se pidió ningún dato a la API');

  // Validación y credenciales malas
  await pa.click('.login button[type=submit]');
  ok((await pa.textContent('#f-email-err')).includes('correo válido') && (await pa.textContent('#f-password-err')).includes('contraseña'), 'formulario vacío: errores junto a los campos');
  await entrar(pa, 'ana@dilo.test', 'mala');
  await pa.waitForFunction(() => document.getElementById('login-err')?.textContent);
  ok((await pa.textContent('#login-err')).includes('Correo o contraseña incorrectos'), 'contraseña mala: mensaje claro y sin entrar');
  ok((await pa.inputValue('#f-password')) === '', 'la contraseña se limpia tras el fallo');
  // Mostrar / ocultar la contraseña (al escribirla en el teléfono se falla menos).
  await pa.fill('#f-password', 'secreta');
  ok((await pa.getAttribute('#f-password', 'type')) === 'password', 'la contraseña empieza oculta');
  await pa.click('[data-ver-clave]');
  ok((await pa.getAttribute('#f-password', 'type')) === 'text' && (await pa.textContent('[data-ver-clave]')) === 'Ocultar' && (await pa.getAttribute('[data-ver-clave]', 'aria-label')) === 'Ocultar la contraseña', '"Mostrar" la deja visible y el botón pasa a "Ocultar"');
  await pa.click('[data-ver-clave]');
  ok((await pa.getAttribute('#f-password', 'type')) === 'password' && (await pa.inputValue('#f-password')) === 'secreta', 'y vuelve a ocultarla sin perder lo escrito');
  await pa.fill('#f-password', '');

  // Entrar bien
  await entrar(pa, 'ana@dilo.test', 'clave-ana');
  await pa.waitForSelector('[data-contador]');
  ok(await espera(async () => (await titulo(pa)) === 'Dilo group'), 'con la sesión correcta se llega a Inicio');
  const ceros = await pa.evaluate(() => [...document.querySelectorAll('[data-contador]')].map((n) => n.textContent));
  ok(ceros.length === 4 && ceros.every((x) => Number(x) === 0), 'cuenta nueva: todo en cero, sin datos de ejemplo');
  ok(await pa.locator('[data-pasos]').isVisible(), 'cuenta nueva: Inicio guía los primeros pasos');

  // Crear un chofer con cédula y foto
  await pa.evaluate(() => { location.hash = '#/choferes'; });
  await pa.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Choferes');
  await pa.click('[data-nuevo]');
  await pa.fill('#f-nombre', 'Chofer de Ana');
  await pa.fill('#f-telefono', '809-555-0188');
  await pa.fill('#f-cedula', '001-1234567-8');
  await pa.setInputFiles('#f-fotoId', path.resolve(__dirname, '../icons/icon-512.png'));
  await pa.waitForSelector('[data-foto-campo="fotoId"] img');
  await pa.click('dialog.sheet button[type=submit]');
  await pa.waitForSelector('dialog.sheet', { state: 'detached' });
  ok(await espera(async () => (await pa.locator('.item', { hasText: 'Chofer de Ana' }).count()) === 1), 'el chofer aparece en la lista');
  const uidAna = await pa.evaluate(() => JSON.parse(localStorage.getItem('ct:sesion')).usuario.id);
  const fila = falso.estado.tablas.choferes[0];
  console.log('  fila recibida:', JSON.stringify({ ...fila, foto_id: '…' }));
  ok(falso.estado.tablas.choferes.length === 1 && fila.owner === uidAna && fila.nombre === 'Chofer de Ana' && fila.cedula === '00112345678' && fila.telefono === '8095550188', 'la API recibió la fila a nombre de Ana (columnas snake_case)');
  ok(/^[0-9a-f-]{36}$/.test(fila.id) && /^[0-9a-f-]{36}$/.test(fila.foto_id), 'id y foto_id son UUID');
  const objeto = falso.estado.objetos.get(`fotos/${uidAna}/${fila.foto_id}`);
  ok(Boolean(objeto) && objeto.tipo === 'image/jpeg' && objeto.blob.length > 500, `la foto quedó en el bucket, carpeta de Ana, como JPEG (${objeto?.blob.length} bytes)`);
  ok(await espera(async () => (await pa.locator('.item', { hasText: 'Chofer de Ana' }).locator('.avatar img[src^="blob:"]').count()) === 1), 'la lista muestra la foto (descargada con URL firmada)');
  ok(falso.estado.peticiones.some((p) => p.ruta.includes('/object/sign/fotos/')), 'la foto se pidió con URL firmada, no con enlace público');
  ok(!falso.estado.peticiones.some((p) => p.ruta.includes('/object/public/')), 'nunca se usó la ruta pública del bucket');

  // Recargar: la sesión y los datos persisten, sin pedir contraseña
  await pa.reload();
  await pa.waitForSelector('[data-lista] .item');
  ok((await titulo(pa)) === 'Choferes' && (await pa.locator('.item', { hasText: 'Chofer de Ana' }).count()) === 1, 'al recargar sigue dentro y el chofer persiste');
  ok(await espera(async () => (await pa.locator('.item', { hasText: 'Chofer de Ana' }).locator('.avatar img[src^="blob:"]').count()) === 1), 'y la foto vuelve a mostrarse');

  // Un viaje con chofer, ruta y fechas: el formato de horas y UUID viaja bien por la API
  await pa.evaluate(() => { location.hash = '#/rutas'; });
  await pa.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Rutas');
  await pa.click('[data-nuevo]');
  await pa.fill('#f-nombre', 'R1 Prueba');
  await pa.fill('#f-origen', 'Punto A');
  await pa.fill('#f-destino', 'Punto B');
  await pa.fill('#f-duracionMin', '45');
  await pa.click('dialog.sheet button[type=submit]');
  await pa.waitForSelector('dialog.sheet', { state: 'detached' });
  ok(await espera(async () => falso.estado.tablas.rutas.length === 1 && falso.estado.tablas.rutas[0].duracion_min === 45), 'una ruta se guarda con duracion_min numérico');

  // Token vencido en el servidor: la app renueva sola y sigue funcionando
  falso.estado.tokens.clear();
  await pa.evaluate(() => { location.hash = '#/choferes'; });
  await pa.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Choferes');
  ok(await espera(async () => (await pa.locator('.item', { hasText: 'Chofer de Ana' }).count()) === 1), 'token vencido en el servidor: se renueva solo y la lista carga');
  ok(falso.estado.peticiones.some((p) => p.ruta === '/auth/v1/token'), 'se usó el refresh token');
  ok(!(await pa.locator('.login').count()), 'sin pedir contraseña de nuevo');

  // Sesión perdida del todo: vuelve a pedir entrar y, al entrar, repinta
  falso.estado.tokens.clear();
  falso.estado.refrescos.clear();
  pa.sesionPerdida = true;
  await pa.evaluate(() => { location.hash = '#/vehiculos'; });
  await pa.waitForSelector('.login');
  ok(true, 'sesión irrecuperable: aparece la pantalla de entrar');
  await entrar(pa, 'ana@dilo.test', 'clave-ana');
  ok(await espera(async () => !(await pa.locator('.login').count()) && (await titulo(pa)) === 'Vehículos'), 'al volver a entrar se repinta la pantalla donde estaba');

  // Importar respaldos en la nube: un respaldo de la demostración se rechaza sin tocar nada, uno válido reemplaza,
  // y si la base rechaza algo a mitad de carga se restauran los datos anteriores (nunca se queda sin datos).
  const importar = (datos) => pa.evaluate(async (d) => {
    const st = await import('/src/data/store.js');
    try { await st.replaceAll(d); return { ok: true }; } catch (e) { return { ok: false, mensaje: e.message }; }
  }, datos);
  const idsAna = () => falso.estado.tablas.choferes.map((c) => c.nombre).sort().join('|');
  const u = () => crypto.randomUUID();
  const marcas = { archivado: false, creado: new Date().toISOString(), actualizado: new Date().toISOString() };
  const vacio = { choferes: [], rutas: [], vehiculos: [], viajes: [], combustible: [], asistencia: [] };
  const rDemo = await importar({ ...vacio, choferes: [{ id: 'ej-chofer-1', nombre: 'De la demo', ...marcas }] });
  ok(!rDemo.ok && rDemo.mensaje.includes('demostración') && idsAna() === 'Chofer de Ana', 'respaldo de la demostración (ids no UUID): se rechaza y no se toca nada');
  const [v1, c1] = [u(), u()];
  const rBueno = await importar({ ...vacio, vehiculos: [{ id: v1, placa: 'A111111', estado: 'disponible', ...marcas }], choferes: [{ id: c1, nombre: 'Del respaldo', vehiculoId: v1, ...marcas }], rutas: [] });
  ok(rBueno.ok && idsAna() === 'Del respaldo' && falso.estado.tablas.vehiculos.some((v) => v.placa === 'A111111'), 'un respaldo válido reemplaza los datos de la cuenta');
  ok(falso.estado.tablas.choferes[0].vehiculo_id === v1, 'y conserva la relación chofer → vehículo');
  pa.rechazoEsperado = true;
  const rMalo = await importar({ ...vacio, vehiculos: [{ id: u(), placa: 'B222222', ...marcas }, { id: u(), placa: 'B222222', ...marcas }], choferes: [{ id: u(), nombre: 'No debe quedar', ...marcas }] });
  pa.rechazoEsperado = false;
  ok(!rMalo.ok && rMalo.mensaje.includes('Tus datos anteriores se conservaron'), `carga rechazada a mitad (placa repetida): ${rMalo.mensaje?.slice(0, 70)}…`);
  ok(idsAna() === 'Del respaldo' && falso.estado.tablas.vehiculos.length === 1 && falso.estado.tablas.vehiculos[0].placa === 'A111111', 'los datos anteriores quedaron intactos tras el fallo (se restauraron)');

  // Cerrar sesión
  await pa.evaluate(() => { location.hash = '#/ajustes'; });
  await pa.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Ajustes');
  ok((await pa.textContent('#t-cuenta + dl, [aria-labelledby="t-cuenta"]')).includes('ana@dilo.test'), 'Ajustes muestra la cuenta activa');
  await pa.click('[data-cerrar-sesion]');
  await pa.waitForSelector('.login');
  ok((await pa.evaluate(() => localStorage.getItem('ct:sesion'))) === null, 'cerrar sesión borra la sesión guardada');
  ok(!(await pa.content()).includes('Del respaldo'), 'tras cerrar sesión no queda ningún dato en pantalla');
  ok(falso.estado.tokens.size === 0, 'el servidor invalidó el token');
  await pa.evaluate(() => { location.hash = '#/choferes'; });
  ok(await pa.locator('.login').count() === 1 && (await pa.locator('.item', { hasText: 'Del respaldo' }).count()) === 0, 'cambiar la URL sin sesión no muestra datos');
  ok(A.page.errores.length === 0, `sin errores en consola (${A.page.errores.join(' | ') || 'ninguno'})`);
  await A.ctx.close();

  // ---------- Luis: otro usuario, otro navegador ----------
  const L = await nuevoContexto();
  const pl = L.page;
  await pl.goto(`${base}#/choferes`);
  await pl.waitForSelector('.login');
  await entrar(pl, 'luis@dilo.test', 'clave-luis');
  await pl.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Choferes');
  ok(await espera(async () => (await pl.locator('.item').count()) === 0), 'Luis no ve los choferes de Ana (aislamiento por usuario)');
  const uidLuis = await pl.evaluate(() => JSON.parse(localStorage.getItem('ct:sesion')).usuario.id);
  // Intento directo contra la API con la sesión de Luis: leer la foto de Ana por su ruta y subir a su carpeta
  pl.ataque = true;
  const intento = await pl.evaluate(async ({ url, uidAna, fotoAna }) => {
    const s = JSON.parse(localStorage.getItem('ct:sesion'));
    const h = { apikey: 'anon-publica-de-prueba', Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' };
    const firma = await fetch(`${url}/storage/v1/object/sign/fotos/${uidAna}/${fotoAna}`, { method: 'POST', headers: h, body: '{"expiresIn":60}' });
    const sube = await fetch(`${url}/storage/v1/object/fotos/${uidAna}/x`, { method: 'POST', headers: { ...h, 'Content-Type': 'image/jpeg' }, body: new Blob(['x']) });
    const filas = await (await fetch(`${url}/rest/v1/choferes?select=*`, { headers: h })).json();
    return { firma: firma.status, sube: sube.status, filas: filas.length };
  }, { url: falso.url, uidAna, fotoAna: fila.foto_id });
  ok(intento.firma !== 200 && intento.sube === 403 && intento.filas === 0, `Luis no puede firmar la foto de Ana (${intento.firma}), ni subir a su carpeta (${intento.sube}), ni leer sus filas (${intento.filas})`);
  ok(uidLuis !== uidAna, 'cada usuario tiene su propio id');
  ok(pl.errores.length === 0, `sin errores en consola (${pl.errores.join(' | ') || 'ninguno'})`);
  await L.ctx.close();

  // ---------- Sin config.local.js: modo demostración intacto ----------
  const ctxD = await navegador.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const pd = await ctxD.newPage();
  await pd.goto(`${base}#/choferes`);
  await pd.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Choferes');
  ok(!(await pd.evaluate(() => document.body.classList.contains('modo-nube'))) && (await pd.locator('#demo-note').isVisible()), 'sin config.local.js sigue el modo demostración (con su aviso)');
  await ctxD.close();

  await navegador.close();
  estatico.close();
  await falso.cerrar();
  console.log(fallos ? `\n${fallos} fallo(s).` : '\nFlujos en la nube OK.');
  process.exit(fallos ? 1 : 0);
})();
