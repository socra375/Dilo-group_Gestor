// QA en navegador headless: 390 px, tema claro y oscuro. Revisa errores de consola y desbordes
// horizontales, y guarda capturas en qa/capturas/. Uso: node scripts/qa.cjs
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { crear } = require('./serve.cjs');
const { abrirConEjemplo } = require('./ayudas.cjs');

const SALIDA = path.resolve(__dirname, '../qa/capturas');

// [nombre, ruta, acción opcional antes de la captura]
const PANTALLAS = [
  ['inicio', '#/inicio'],
  ['viajes', '#/viajes'],
  ['viajes-formulario', '#/viajes', async (p) => { await p.click('[data-nuevo]'); await p.waitForSelector('dialog.sheet[open]'); }],
  ['choferes', '#/choferes'],
  ['chofer-ficha', '#/choferes', async (p) => { await p.click('[data-editar]'); await p.waitForSelector('dialog.sheet[open] .ficha'); }],
  ['chofer-formulario', '#/choferes', async (p) => { await p.click('[data-editar]'); await p.click('[data-editar-ficha]'); await p.waitForSelector('dialog.sheet[open] form #f-nombre'); }],
  ['rutas', '#/rutas'],
  ['vehiculos', '#/vehiculos'],
  ['combustible', '#/combustible'],
  ['reporte-combustible', '#/reporte-combustible'],
  ['reporte-combustible-mensual', '#/reporte-combustible', async (p) => { await p.click('[data-tipo="mes"]'); await p.waitForSelector('[data-carga]'); }],
  ['asistencia', '#/asistencia'],
  ['reportes', '#/reportes'],
  ['ajustes', '#/ajustes'],
  ['mas', '#/mas'],
];

async function desbordes(page) {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [];
    if (document.documentElement.scrollWidth > ancho) fuera.push(`documento: scrollWidth ${document.documentElement.scrollWidth} > ${ancho}`);
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.filters, .table-wrap, svg, .sr-only, [hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > ancho + 1 || r.left < -1)) fuera.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(r.left)}–${Math.round(r.right)})`);
    }
    return fuera.slice(0, 8);
  });
}

// Contraste WCAG AA de cada texto visible contra su fondo efectivo. Los colores se leen pintándolos
// en un canvas para resolver color-mix()/oklab a sRGB.
async function contraste(page) {
  return page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = (c) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      return [...cx.getImageData(0, 0, 1, 1).data];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fondo = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none' && !n.classList.contains('select')) return null; // degradados: no evaluable
        const c = rgba(cs.backgroundColor);
        if (c[3] > 200) return c;
      }
      return rgba(getComputedStyle(document.body).backgroundColor);
    };
    const malos = [];
    const vistos = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const el = t.parentElement;
      if (!t.textContent.trim() || vistos.has(el) || el.closest('[hidden], .sr-only, svg, option, script, style, .skeleton')) continue;
      vistos.add(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      if (el.closest('.item--archived, :disabled, [inert]')) continue;
      if (document.querySelector('dialog[open]') && !el.closest('dialog[open]')) continue; // tapado por el velo
      const bg = fondo(el);
      if (!bg) continue;
      const fg = rgba(cs.color);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (grande ? 3 : 4.5)) malos.push(`${ratio.toFixed(2)}:1 "${t.textContent.trim().slice(0, 30)}" (${el.className || el.tagName})`);
    }
    return [...new Set(malos)].slice(0, 6);
  });
}

// Accesibilidad con axe-core (solo para pruebas; la app no tiene dependencias). Si no está instalado
// (`npm i --no-save axe-core`), se avisa y se omite: en CI siempre se instala.
let AXE = null;
try { AXE = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* sin axe */ }

/** Violaciones WCAG 2.1 A/AA en lo que hay en pantalla (incluye hojas y diálogos abiertos). */
async function accesibilidad(page) {
  if (!AXE) return [];
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    // El contraste ya lo mide `contraste()` con la superficie real; axe no resuelve color-mix().
    rules: { 'color-contrast': { enabled: false } },
  })).violations.map((v) => ({ id: v.id, impacto: v.impact, ayuda: v.help, n: v.nodes.length, ej: v.nodes[0].target.join(' ').slice(0, 90) })));
  return r;
}

// Espera a que el router muestre la pantalla pedida (si no, se revisaría la anterior y daría un falso verde).
const TITULOS = { '#/inicio': 'Dilo group', '#/viajes': 'Viajes', '#/choferes': 'Choferes', '#/rutas': 'Rutas', '#/vehiculos': 'Vehículos', '#/combustible': 'Combustible', '#/reporte-combustible': 'Reporte de combustible', '#/reportes': 'Reportes', '#/ajustes': 'Ajustes', '#/asistencia': 'Asistencia', '#/mas': 'Más' };
async function ir(page, ruta) {
  await page.evaluate((h) => { location.hash = h; }, ruta);
  await page.waitForFunction((t) => document.getElementById('header-title')?.textContent === t, TITULOS[ruta]);
}

// El tema de la app no sigue al sistema (claro por defecto; oscuro con el interruptor de Ajustes),
// así que cada pasada fija la preferencia antes de cargar la página.
async function fijarTema(ctx, tema) {
  await ctx.addInitScript((oscuro) => {
    const p = JSON.parse(localStorage.getItem('ct:prefs') || '{}');
    localStorage.setItem('ct:prefs', JSON.stringify({ ...p, tema: oscuro ? 'oscuro' : 'claro' }));
  }, tema === 'dark');
}

// Verifica que la página quedó en el tema esperado (evita "pasadas oscuras" que en realidad son claras).
async function verificarTema(page, tema) {
  const actual = await page.evaluate(() => document.documentElement.dataset.theme);
  return actual === (tema === 'dark' ? 'oscuro' : 'claro');
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const servidor = crear().listen(0);
  const puerto = servidor.address().port;
  const navegador = await chromium.launch();
  // Esperado: en modo demostración src/config.local.js no existe (está en .gitignore) y el navegador registra su 404. Solo ese recurso.
const esperado404 = (m) => /status of 404/.test(m.text()) && /config\.local\.js/.test(m.location().url);
// Sin internet (p. ej. un entorno aislado) las fuentes de Google no cargan; el QA ya lo ignoraba en `requestfailed`. Solo esos dominios.
const esperadoFuentes = (m) => /fonts\.g(oogleapis|static)\.com/.test(m.location().url) || /^Couldn't load preload assets/.test(m.text());

let fallos = 0;

  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: tema, reducedMotion: 'reduce',
      locale: 'es-DO', timezoneId: 'America/Santo_Domingo', serviceWorkers: 'allow',
    });
    await fijarTema(ctx, tema);
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const errores = [];
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !esperado404(m) && !esperadoFuentes(m)) errores.push(`[${m.type()}] ${m.text()} ${m.location().url}`); });
    page.on('pageerror', (e) => errores.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) => { if (!r.url().includes('fonts.g') && !r.url().includes('config.local.js')) errores.push(`[request] ${r.url()} ${r.failure()?.errorText}`); });

    await abrirConEjemplo(page, `http://localhost:${puerto}/index.html`, '#/inicio'); // la app arranca vacía: se cargan los datos de prueba
    await page.waitForLoadState('networkidle');
    if (!(await verificarTema(page, tema))) {
      fallos++;
      console.log(`✗ ${tema}: la página no quedó en el tema esperado`);
    }

    for (const [nombre, ruta, accion] of PANTALLAS) {
      await ir(page, ruta);
      await page.waitForTimeout(250);
      if (accion) {
        try { await accion(page); } catch (e) { fallos++; console.log(`✗ ${tema} ${nombre}: la acción falló (${e.message.split('\n')[0]})`); continue; }
      }
      await page.waitForTimeout(250);
      const fuera = await desbordes(page);
      const bajos = await contraste(page);
      const a11y = await accesibilidad(page);
      if (a11y.length) {
        fallos++;
        console.log(`✗ ${tema} ${nombre}: accesibilidad\n   ${a11y.map((v) => `${v.id} (${v.impacto}, ${v.n}): ${v.ayuda} → ${v.ej}`).join('\n   ')}`);
      }
      if (bajos.length) {
        fallos++;
        console.log(`✗ ${tema} ${nombre}: contraste insuficiente\n   ${bajos.join('\n   ')}`);
      }
      const archivo = path.join(SALIDA, `${tema === 'light' ? 'claro' : 'oscuro'}-${nombre}.png`);
      await page.screenshot({ path: archivo, fullPage: !accion });
      if (fuera.length) {
        fallos++;
        console.log(`✗ ${tema} ${nombre}: desborde\n   ${fuera.join('\n   ')}`);
      } else console.log(`✓ ${tema} ${nombre}`);
      if (accion) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
    if (errores.length) {
      fallos++;
      console.log(`✗ ${tema}: errores de consola\n   ${[...new Set(errores)].join('\n   ')}`);
    }
    await ctx.close();
  }

  // Peor caso de diseño: teléfono de 360 px con la letra más grande de Ajustes.
  {
    const ctx = await navegador.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce', timezoneId: 'America/Santo_Domingo' });
    await ctx.addInitScript(() => {
      const p = JSON.parse(localStorage.getItem('ct:prefs') || '{}');
      localStorage.setItem('ct:prefs', JSON.stringify({ ...p, letra: 'extra' }));
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    await abrirConEjemplo(page, `http://localhost:${puerto}/index.html`, '#/inicio'); // la app arranca vacía: se cargan los datos de prueba
    await page.waitForSelector('.stat');
    for (const [nombre, ruta, accion] of PANTALLAS) {
      await ir(page, ruta);
      await page.waitForTimeout(250);
      if (accion) await accion(page).catch(() => {});
      const fuera = await desbordes(page);
      if (fuera.length) {
        fallos++;
        console.log(`✗ 360px/21px ${nombre}: desborde\n   ${fuera.join('\n   ')}`);
      } else console.log(`✓ 360px/21px ${nombre}`);
      if (accion) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
    await ctx.close();
  }

  // Escritorio (1280 px, con mouse): riel lateral solo con íconos que se despliega al pasar el mouse.
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: tema, reducedMotion: 'reduce', locale: 'es-DO', timezoneId: 'America/Santo_Domingo' });
    await fijarTema(ctx, tema);
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !esperado404(m) && !esperadoFuentes(m)) errores.push(m.text()); });
    await abrirConEjemplo(page, `http://localhost:${puerto}/index.html`, '#/inicio'); // la app arranca vacía: se cargan los datos de prueba
    await page.waitForSelector('.stat');
    const nombreTema = tema === 'light' ? 'claro' : 'oscuro';
    const chequear = (cond, msg) => {
      console.log(`${cond ? '✓' : '✗'} ${tema} escritorio: ${msg}`);
      if (!cond) fallos++;
    };
    const medir = () => page.evaluate(() => {
      const nav = document.querySelector('.tabbar').getBoundingClientRect();
      const main = document.getElementById('main').getBoundingClientRect();
      const etiqueta = document.querySelector('.tabbar a[data-tab="viajes"] span:last-child');
      return {
        ancho: Math.round(nav.width), alto: Math.round(nav.height), izq: Math.round(nav.left),
        mainIzq: Math.round(main.left), opacidad: Number(getComputedStyle(etiqueta).opacity),
        marca: getComputedStyle(document.querySelector('.tabbar__brand')).display,
        etiquetaVisible: etiqueta.getBoundingClientRect().right <= nav.right + 1,
      };
    });

    await page.mouse.move(700, 400); // mouse lejos del riel
    await page.waitForTimeout(350); // deja terminar el plegado del riel
    const reposo = await medir();
    chequear(reposo.ancho === 72 && reposo.izq === 0 && reposo.alto === 800, `riel plegado a la izquierda (${reposo.ancho}×${reposo.alto})`);
    chequear(reposo.opacidad === 0, 'en reposo solo se ven los íconos (nombres ocultos)');
    chequear(reposo.marca !== 'none', 'logo de la marca presente');
    await page.screenshot({ path: path.join(SALIDA, `${nombreTema}-escritorio-riel.png`) });

    await page.mouse.move(30, 300); // mouse sobre el riel
    await page.waitForTimeout(350);
    const abierto = await medir();
    chequear(abierto.ancho === 248, `con el mouse encima se despliega (${abierto.ancho} px)`);
    chequear(abierto.opacidad === 1 && abierto.etiquetaVisible, 'se ven los nombres de las secciones');
    chequear(abierto.mainIzq === reposo.mainIzq, 'el contenido no se desplaza al desplegar');
    const a11yRiel = await accesibilidad(page);
    chequear(!a11yRiel.length, `accesibilidad del riel desplegado${a11yRiel.length ? `: ${a11yRiel.map((v) => `${v.id} → ${v.ej}`).join(' | ')}` : ''}`);
    const bajosAbierto = await contraste(page);
    chequear(!bajosAbierto.length, `contraste del riel desplegado${bajosAbierto.length ? `: ${bajosAbierto.join(' | ')}` : ''}`);
    await page.screenshot({ path: path.join(SALIDA, `${nombreTema}-escritorio-riel-abierto.png`) });

    // Navegar con el riel y recorrer pantallas: sin desbordes ni problemas de contraste.
    await page.click('.tabbar a[data-tab="viajes"]');
    await page.waitForSelector('#header-title:has-text("Viajes")');
    chequear((await page.evaluate(() => document.querySelector('.tabbar a[aria-current="page"]')?.dataset.tab)) === 'viajes', 'la sección activa queda marcada');
    await page.mouse.move(700, 400);
    await page.waitForTimeout(350);
    for (const [nombre, ruta, accion] of PANTALLAS) {
      await ir(page, ruta);
      await page.waitForTimeout(250);
      if (accion) { try { await accion(page); } catch { /* el formulario ya se cubre a 390 px */ continue; } }
      const fuera = await desbordes(page);
      const bajos = await contraste(page);
      const a11yEsc = await accesibilidad(page);
      chequear(!a11yEsc.length, `${nombre}: accesibilidad${a11yEsc.length ? ` ${a11yEsc.map((v) => `${v.id} → ${v.ej}`).join(' | ')}` : ''}`);
      chequear(!fuera.length && !bajos.length, `${nombre}${fuera.length ? ` desborde: ${fuera.join(', ')}` : ''}${bajos.length ? ` contraste: ${bajos.join(' | ')}` : ''}`);
      if (nombre === 'viajes') await page.screenshot({ path: path.join(SALIDA, `${nombreTema}-escritorio-viajes.png`) });
      if (accion) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    }

    // Rejilla de escritorio: Inicio en «bento» (avisos y gráfica lado a lado) y las listas en varias columnas.
    await ir(page, '#/inicio');
    await page.waitForSelector('.view--bento .bento-avisos');
    await page.mouse.move(700, 400);
    await page.waitForTimeout(350);
    const bento = await page.evaluate(() => {
      const r = (q) => document.querySelector(q)?.getBoundingClientRect();
      const a = r('.bento-avisos'); const g = r('.bento-graf'); const main = r('#main');
      return { mismaFila: Math.abs(a.top - g.top) < 4 && g.left > a.right - 2, avisosAncho: Math.round(a.width), principal: Math.round(main.width) };
    });
    chequear(bento.mismaFila && bento.avisosAncho > bento.principal * 0.5, `Inicio en rejilla: avisos y gráfica lado a lado (${bento.avisosAncho} de ${bento.principal} px)`);
    const fuera0 = await desbordes(page);
    const bajos0 = await contraste(page);
    const a11y0 = await accesibilidad(page);
    chequear(!fuera0.length && !bajos0.length && !a11y0.length, `Inicio en rejilla: sin desbordes, contraste ni accesibilidad${[...fuera0, ...bajos0, ...a11y0.map((v) => `${v.id} → ${v.ej}`)].map((x) => ` | ${x}`).join('')}`);
    await page.screenshot({ path: path.join(SALIDA, `${nombreTema}-escritorio-inicio.png`), fullPage: true });
    await ir(page, '#/viajes');
    await page.waitForSelector('[data-lista] .item');
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('[data-lista] > .item')].map((i) => Math.round(i.getBoundingClientRect().left))).size);
    chequear(cols >= 2, `Viajes en escritorio usa varias columnas (${cols})`);
    await ir(page, '#/choferes');
    await page.waitForSelector('[data-lista] .item');
    const colsC = await page.evaluate(() => new Set([...document.querySelectorAll('[data-lista] > .item')].map((i) => Math.round(i.getBoundingClientRect().left))).size);
    chequear(colsC >= 2, `Choferes en escritorio usa varias columnas (${colsC})`);

    // Teclado: el foco dentro del riel también lo despliega.
    await page.evaluate(() => { location.hash = '#/inicio'; });
    await page.waitForTimeout(250);
    await page.focus('.tabbar a[data-tab="choferes"]');
    await page.waitForTimeout(350);
    chequear((await medir()).ancho === 248, 'con foco de teclado también se despliega');
    chequear(!errores.length, `sin errores de consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
    await ctx.close();
  }

  // Móvil: la barra inferior no cambia (el riel lateral es solo para mouse).
  {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
    await page.waitForSelector('.stat');
    const m = await page.evaluate(() => {
      const r = document.querySelector('.tabbar').getBoundingClientRect();
      return { ancho: Math.round(r.width), abajo: Math.round(r.bottom), alto: window.innerHeight, marca: getComputedStyle(document.querySelector('.tabbar__brand')).display };
    });
    const ok = m.ancho === 390 && m.abajo === m.alto && m.marca === 'none';
    console.log(`${ok ? '✓' : '✗'} móvil: barra inferior intacta (${m.ancho} px de ancho, sin logo lateral)`);
    if (!ok) fallos++;
    await ctx.close();
  }

  // Movimiento: con "reducir movimiento" todo queda sin animación; sin esa preferencia, las animaciones existen.
  for (const reducir of [true, false]) {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reducir ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(() => localStorage.setItem('ct:prefs', JSON.stringify({ sembrado: true })));
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
    await page.waitForSelector('.graf svg');
    await page.evaluate(() => { location.hash = '#/viajes'; });
    await page.waitForFunction(() => document.getElementById('header-title')?.textContent === 'Viajes');
    // El router pone el título antes de terminar de pintar la pantalla; la clase de entrada se añade al final.
    if (!reducir) await page.waitForSelector('.view--enter');
    const m = await page.evaluate(() => {
      const seg =(el) => parseFloat(getComputedStyle(el).animationDuration) * (getComputedStyle(el).animationDuration.endsWith('ms') ? 0.001 : 1);
      const vista = document.querySelector('.view');
      const hijo = vista.children[2]; // las tarjetas entran escalonadas (movimiento.js), salvo con reducir movimiento
      return { vista: seg(vista), nombre: getComputedStyle(vista).animationName, hijo: getComputedStyle(hijo).animationName };
    });
    const ok = reducir ? m.vista <= 0.002 : m.vista >= 0.15 && m.vista <= 0.25 && m.nombre.includes('view-in');
    console.log(`${ok ? '✓' : '✗'} movimiento ${reducir ? 'reducido: sin animación' : 'normal: cambio de pantalla de 160–200 ms'} (${m.nombre}, ${(m.vista * 1000).toFixed(0)} ms)`);
    if (!ok) fallos++;
    await ctx.close();
  }

  // Primera vez: la app arranca VACÍA. Es lo primero que ve el cliente, así que se revisa igual que lo demás
  // (desbordes, contraste, accesibilidad, errores de consola), en claro y oscuro.
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: tema, reducedMotion: 'reduce', locale: 'es-DO', timezoneId: 'America/Santo_Domingo', serviceWorkers: 'block' });
    await fijarTema(ctx, tema);
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !esperado404(m) && !esperadoFuentes(m)) errores.push(m.text()); });
    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
    await page.waitForSelector('[data-pasos]');
    for (const ruta of ['#/inicio', '#/viajes', '#/choferes', '#/vehiculos', '#/rutas', '#/combustible', '#/reportes', '#/asistencia', '#/ajustes', '#/mas']) {
      await ir(page, ruta);
      await page.waitForTimeout(250);
      const fuera = await desbordes(page);
      const bajos = await contraste(page);
      const a11y = await accesibilidad(page);
      const problemas = [...fuera.map((x) => `desborde: ${x}`), ...bajos.map((x) => `contraste: ${x}`), ...a11y.map((v) => `${v.id} (${v.impacto}): ${v.ayuda} → ${v.ej}`)];
      const nombre = ruta.slice(2);
      if (['inicio', 'choferes', 'viajes'].includes(nombre)) await page.screenshot({ path: path.join(SALIDA, `${tema === 'light' ? 'claro' : 'oscuro'}-vacio-${nombre}.png`), fullPage: true });
      if (problemas.length) { fallos++; console.log(`✗ ${tema} vacío ${nombre}\n   ${problemas.join('\n   ')}`); } else console.log(`✓ ${tema} vacío ${nombre}`);
    }
    if (errores.length) { fallos++; console.log(`✗ ${tema} vacío: errores de consola\n   ${[...new Set(errores)].join('\n   ')}`); }
    await ctx.close();
  }

  // Pantalla de entrar (modo nube, fase 8): vacía y con el error de contraseña, en claro y oscuro, a 390 px y a 360 px con letra extra grande.
  {
    const falso = await require('./supabase-falso.cjs').crear({ usuarios: { 'ana@dilo.test': 'clave-ana' } });
    const configLocal = `export const SUPABASE = { url: ${JSON.stringify(falso.url)}, anonKey: 'anon-publica-de-prueba', bucketFotos: 'fotos' };`;
    for (const [tema, ancho, letra] of [['light', 390, null], ['dark', 390, null], ['light', 360, 'extra'], ['dark', 360, 'extra'], ['light', 1280, null], ['dark', 1280, null]]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 }, deviceScaleFactor: 2, colorScheme: tema, reducedMotion: 'reduce', locale: 'es-DO', serviceWorkers: 'block' });
      await fijarTema(ctx, tema);
      if (letra) await ctx.addInitScript((l) => { const p = JSON.parse(localStorage.getItem('ct:prefs') || '{}'); localStorage.setItem('ct:prefs', JSON.stringify({ ...p, letra: l })); }, letra);
      await ctx.route('**/src/config.local.js', (r) => r.fulfill({ contentType: 'text/javascript', body: configLocal }));
      const page = await ctx.newPage();
      page.setDefaultTimeout(5000);
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[01]/.test(m.text())) errores.push(m.text()); });
      await page.goto(`http://localhost:${puerto}/index.html`);
      await page.waitForSelector('.login');
      const etiqueta = `${tema} entrar ${ancho}px${letra ? '/letra extra' : ''}`;
      for (const [vista, antes] of [['vacia', null], ['error', async () => { await page.fill('#f-email', 'ana@dilo.test'); await page.fill('#f-password', 'mala'); await page.click('.login button[type=submit]'); await page.waitForFunction(() => document.getElementById('login-err')?.textContent); }]]) {
        if (antes) await antes();
        await page.waitForTimeout(200);
        const fuera = await desbordes(page);
        const bajos = await contraste(page);
        const a11y = await accesibilidad(page);
        const problemas = [...fuera.map((x) => `desborde: ${x}`), ...bajos.map((x) => `contraste: ${x}`), ...a11y.map((v) => `${v.id} (${v.impacto}): ${v.ayuda} → ${v.ej}`)];
        if (problemas.length) { fallos++; console.log(`✗ ${etiqueta} (${vista})\n   ${problemas.join('\n   ')}`); } else console.log(`✓ ${etiqueta} (${vista})`);
        if (ancho === 390 || ancho === 1280) await page.screenshot({ path: path.join(SALIDA, `${tema === 'light' ? 'claro' : 'oscuro'}-entrar${ancho === 1280 ? '-escritorio' : ''}-${vista}.png`) });
      }
      if (errores.length) { fallos++; console.log(`✗ ${etiqueta}: errores de consola\n   ${[...new Set(errores)].join('\n   ')}`); }
      await ctx.close();
    }
    await falso.cerrar();
  }

  // PWA: el service worker precarga la app y abre sin conexión.
  {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForLoadState('networkidle');
    const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
    await ctx.setOffline(true);
    await page.reload();
    const ok = await page.waitForSelector('.stat', { timeout: 5000 }).then(() => true, () => false);
    console.log(`${ok ? '✓' : '✗'} PWA: abre sin conexión (manifest "${manifest.short_name}", ${manifest.icons.length} íconos)`);
    if (!ok) fallos++;
    await ctx.close();
  }

  if (!AXE) console.log('· axe-core no está instalado: se omitió la revisión de accesibilidad (npm i --no-save axe-core)');
  await navegador.close();
  servidor.close();
  console.log(fallos ? `\n${fallos} problema(s).` : '\nQA sin problemas.');
  process.exit(fallos ? 1 : 0);
})();
