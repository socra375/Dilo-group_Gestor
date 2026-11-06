// Servidor estático mínimo para desarrollo y QA: node scripts/serve.cjs [puerto]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { cspPruebas } = require('./csp.cjs');

const raiz = path.resolve(__dirname, '..');
const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

function crear() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = path.join(raiz, url.endsWith('/') ? `${url}index.html` : url);
    if (!archivo.startsWith(raiz)) { res.writeHead(403); return res.end(); }
    fs.readFile(archivo, (err, data) => {
      if (err) { res.writeHead(404); return res.end('No encontrado'); }
      res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': cspPruebas() });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const puerto = Number(process.argv[2]) || 8080;
  crear().listen(puerto, () => console.log(`http://localhost:${puerto}/`));
}
module.exports = { crear };
