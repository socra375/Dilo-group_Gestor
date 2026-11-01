// Publicación: lo que se sube al servidor y las reglas de caché que evitan que una versión nueva no llegue.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

test('_headers: index, sw.js, manifiesto y src/ se revalidan siempre; hay nosniff y X-Frame-Options', () => {
  const h = leer('_headers');
  for (const ruta of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/src/*']) {
    assert.match(h, new RegExp(`^${ruta.replace(/[/*.]/g, '\\$&')}\\n  Cache-Control: no-cache$`, 'm'), `${ruta} debe ser no-cache`);
  }
  assert.match(h, /X-Content-Type-Options: nosniff/);
  assert.match(h, /X-Frame-Options: DENY/);
});

test('sw.js: la precarga ignora la caché HTTP (si no, una versión nueva podría guardar archivos viejos)', () => {
  const sw = leer('sw.js');
  assert.match(sw, /cache: 'reload'/);
  assert.doesNotMatch(sw, /\.addAll\(ARCHIVOS\)/);
});

// Copia del repositorio en una carpeta temporal: las pruebas no escriben nunca dentro del repo (corren en paralelo).
function copiaDelRepo() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'origen-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'LICENSE.md', '_headers']) fs.copyFileSync(path.join(raiz, f), path.join(t, f));
  for (const d of ['icons', 'src']) fs.cpSync(path.join(raiz, d), path.join(t, d), { recursive: true });
  fs.mkdirSync(path.join(t, 'tests'));
  fs.writeFileSync(path.join(t, 'src', 'config.local.js'), 'export const SUPABASE = { url: "https://x" }; // del desarrollador');
  return t;
}
const armar = (origen, destino, env = {}) => {
  const base = { ...process.env, ORIGEN: origen, ...env };
  if (!('SUPABASE_URL' in env)) { delete base.SUPABASE_URL; delete base.SUPABASE_ANON_KEY; }
  return execFileSync('bash', [path.join(raiz, 'scripts', 'armar-sitio.sh'), destino], { cwd: raiz, env: base, stdio: 'pipe' });
};

test('armar-sitio: solo copia lo que usa la página, sin el config.local.js del desarrollador ni pruebas', () => {
  const origen = copiaDelRepo();
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'sitio-'));
  armar(origen, destino);
  assert.deepEqual(fs.readdirSync(destino).sort(), ['LICENSE.md', '_headers', 'icons', 'index.html', 'manifest.webmanifest', 'src', 'sw.js']);
  assert.ok(!fs.existsSync(path.join(destino, 'src', 'config.local.js')), 'sin variables no se publica configuración de la nube');
  assert.ok(fs.existsSync(path.join(destino, 'icons', 'logo.png')) && fs.existsSync(path.join(destino, 'icons', 'logo-marca.png')), 'el logo va en el sitio');
  fs.rmSync(origen, { recursive: true, force: true });
  fs.rmSync(destino, { recursive: true, force: true });
});

test('armar-sitio: con variables válidas genera config.local.js; con una clave service_role se detiene', () => {
  const origen = copiaDelRepo();
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'sitio-'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const clave = (role) => `${b64({ alg: 'HS256' })}.${b64({ role })}.firma`;
  armar(origen, destino, { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: clave('anon') });
  assert.match(fs.readFileSync(path.join(destino, 'src', 'config.local.js'), 'utf8'), /"url": "https:\/\/abc\.supabase\.co"/);
  assert.throws(() => armar(origen, destino, { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: clave('service_role') }), /./);
  assert.ok(!fs.existsSync(path.join(destino, 'src', 'config.local.js')), 'tras el rechazo no queda nada publicable con la clave peligrosa');
  fs.rmSync(origen, { recursive: true, force: true });
  fs.rmSync(destino, { recursive: true, force: true });
});

test('Vercel: vercel.json construye con armar-sitio, publica public/ y tiene las cabeceras de caché', () => {
  const v = JSON.parse(leer('vercel.json'));
  assert.equal(v.buildCommand, 'bash scripts/armar-sitio.sh public');
  assert.equal(v.outputDirectory, 'public');
  const cab = (src) => v.headers.find((h) => h.source === src)?.headers.find((h) => h.key === 'Cache-Control')?.value;
  assert.equal(cab('/sw.js'), 'no-cache');
  assert.equal(cab('/index.html'), 'no-cache');
  assert.ok(v.headers.some((h) => h.headers.some((x) => x.key === 'X-Content-Type-Options' && x.value === 'nosniff')));
});
