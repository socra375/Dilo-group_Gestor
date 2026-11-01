// Todos los archivos de la app deben estar en la lista de precarga del service worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
const lista = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [relative(raiz, p)];
  });
}

test('cada archivo de src/ e icons/ está precargado', () => {
  const faltan = [...archivos(join(raiz, 'src')), ...archivos(join(raiz, 'icons'))]
    .filter((f) => /\.(js|css|png|svg)$/.test(f) && !f.includes('/extensiones/'))
    .filter((f) => !lista.includes(f));
  assert.deepEqual(faltan, []);
});

test('cada archivo precargado existe', () => {
  assert.deepEqual(lista.filter((f) => !existsSync(join(raiz, f))), []);
});
