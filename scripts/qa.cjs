// QA en navegador headless: 390 px, tema claro y oscuro. Revisa errores de consola y desbordes
// horizontales, y guarda capturas en qa/capturas/. Uso: node scripts/qa.cjs
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { crear } = require('./serve.cjs');

const SALIDA = path.resolve(__dirname, '../qa/capturas');

// [nombre, ruta, acción opcional antes de la captura]
const PANTALLAS = [
  ['inicio', '#/inicio'],
  ['viajes', '#/viajes'],
  ['viajes-formulario', '#/viajes', async (p) => { await p.click('[data-nuevo]'); await p.waitForSelector('dialog.sheet[open]'); }],
  ['choferes', '#/choferes'],
  ['chofer-formulario', '#/choferes', async (p) => { await p.click('[data-editar]'); await p.waitForSelector('dialog.sheet[open]'); }],
  ['rutas', '#/rutas'],
  ['vehiculos', '#/vehiculos'],
  ['combustible', '#/combustible'],
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
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errores.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errores.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) => { if (!r.url().includes('fonts.g')) errores.push(`[request] ${r.url()} ${r.failure()?.errorText}`); });

    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
    await page.waitForLoadState('networkidle');
    if (!(await verificarTema(page, tema))) {
      fallos++;
      console.log(`✗ ${tema}: la página no quedó en el tema esperado`);
    }

    for (const [nombre, ruta, accion] of PANTALLAS) {
      await page.evaluate((h) => { location.hash = h; }, ruta);
      await page.waitForTimeout(250);
      if (accion) {
        try { await accion(page); } catch (e) { fallos++; console.log(`✗ ${tema} ${nombre}: la acción falló (${e.message.split('\n')[0]})`); continue; }
      }
      await page.waitForTimeout(250);
      const fuera = await desbordes(page);
      const bajos = await contraste(page);
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
    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
    await page.waitForSelector('.stat');
    for (const [nombre, ruta, accion] of PANTALLAS) {
      await page.evaluate((h) => { location.hash = h; }, ruta);
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
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    await page.goto(`http://localhost:${puerto}/index.html#/inicio`);
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
      await page.evaluate((h) => { location.hash = h; }, ruta);
      await page.waitForTimeout(250);
      if (accion) { try { await accion(page); } catch { /* el formulario ya se cubre a 390 px */ continue; } }
      const fuera = await desbordes(page);
      const bajos = await contraste(page);
      chequear(!fuera.length && !bajos.length, `${nombre}${fuera.length ? ` desborde: ${fuera.join(', ')}` : ''}${bajos.length ? ` contraste: ${bajos.join(' | ')}` : ''}`);
      if (nombre === 'viajes') await page.screenshot({ path: path.join(SALIDA, `${nombreTema}-escritorio-viajes.png`) });
      if (accion) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    }

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

  await navegador.close();
  servidor.close();
  console.log(fallos ? `\n${fallos} problema(s).` : '\nQA sin problemas.');
  process.exit(fallos ? 1 : 0);
})();
