// Genera los PNG de la PWA con el logo del cliente (icons/logo-marca.png): node scripts/iconos.cjs
// Para cambiar el logo: python3 scripts/logo.py <imagen> y luego este script.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const dir = path.resolve(__dirname, '../icons');
// [archivo, tamaño, ancho de la marca como fracción del lado]. La versión "maskable" deja el logo dentro de la zona
// segura (un círculo del 80 % del lado): la marca es rectangular, por eso ocupa menos.
const SALIDAS = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-maskable-512.png', 512, 0.62],
  ['apple-touch-icon.png', 180, 0.78],
];

(async () => {
  const marca = `data:image/png;base64,${fs.readFileSync(path.join(dir, 'logo-marca.png')).toString('base64')}`;
  const b = await chromium.launch();
  for (const [png, t, fraccion] of SALIDAS) {
    const p = await b.newPage({ viewport: { width: t, height: t } });
    await p.setContent(`<style>html,body{margin:0;background:#fff}div{width:${t}px;height:${t}px;display:grid;place-items:center}img{width:${Math.round(t * fraccion)}px;height:auto;display:block}</style><div><img src="${marca}"></div>`);
    await p.waitForFunction(() => document.images[0].complete);
    await p.screenshot({ path: path.join(dir, png) });
    await p.close();
    console.log(png);
  }
  await b.close();
})();
