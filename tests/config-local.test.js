// Barrera de publicación: solo la clave pública llega a la página. Ver scripts/generar-config-local.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import generador from '../scripts/generar-config-local.cjs';

const { validar, generar } = generador;
const jwt = (rol) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role: rol, iss: 'supabase' })).toString('base64url')}.firma`;
const URL_OK = 'https://abcdefgh.supabase.co';

test('acepta una clave anon (JWT) y una publishable', () => {
  assert.equal(validar({ url: URL_OK, anonKey: jwt('anon') }).ok, true);
  assert.equal(validar({ url: URL_OK, anonKey: 'sb_publishable_abc123' }).ok, true);
});

test('rechaza una clave service_role, una secreta y cualquier cosa rara', () => {
  assert.match(validar({ url: URL_OK, anonKey: jwt('service_role') }).error, /service_role.*NUNCA/);
  assert.match(validar({ url: URL_OK, anonKey: 'sb_secret_abc123' }).error, /SECRETA/);
  assert.equal(validar({ url: URL_OK, anonKey: 'una-clave-cualquiera' }).ok, false);
  assert.equal(validar({ url: URL_OK, anonKey: 'a.b.c' }).ok, false, 'JWT ilegible');
});

test('rechaza URL ausente, mal formada o sin https', () => {
  assert.equal(validar({ url: '', anonKey: jwt('anon') }).ok, false);
  assert.equal(validar({ url: 'no es url', anonKey: jwt('anon') }).ok, false);
  assert.match(validar({ url: 'http://abcdefgh.supabase.co', anonKey: jwt('anon') }).error, /https/);
});

test('generar produce un módulo ES válido con la URL sin barra final, y lanza ante una clave peligrosa', () => {
  const codigo = generar({ url: `${URL_OK}/`, anonKey: jwt('anon') });
  assert.match(codigo, /export const SUPABASE = \{/);
  assert.match(codigo, /"url": "https:\/\/abcdefgh\.supabase\.co"/);
  assert.match(codigo, /"bucketFotos": "fotos"/);
  assert.throws(() => generar({ url: URL_OK, anonKey: jwt('service_role') }), /service_role/);
});
