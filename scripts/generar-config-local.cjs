// Genera src/config.local.js (el archivo que activa Supabase) para publicar la app. Lo usa .github/workflows/pages.yml.
// Uso:  SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/generar-config-local.cjs <carpeta-del-sitio>
//
// Es la última barrera contra el error más caro de esta app: publicar la clave equivocada. Solo acepta la clave
// pública (anon / publishable). Una clave service_role se salta RLS y daría acceso total a quien abra la página.
const fs = require('fs');
const path = require('path');

/** Devuelve { ok, error } sin lanzar: así se prueba y el flujo imprime un mensaje claro. */
function validar({ url, anonKey }) {
  if (!url || !anonKey) return { ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_ANON_KEY.' };
  let u;
  try { u = new URL(url); } catch { return { ok: false, error: 'SUPABASE_URL no es una URL válida.' }; }
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) return { ok: false, error: 'SUPABASE_URL debe ser https.' };
  if (/^sb_secret_/.test(anonKey)) return { ok: false, error: 'La clave es una clave SECRETA (sb_secret_…). Usa solo la publishable/anon.' };
  const partes = anonKey.split('.');
  if (partes.length === 3) {
    let rol;
    try { rol = JSON.parse(Buffer.from(partes[1], 'base64url').toString()).role; } catch { return { ok: false, error: 'La clave no se pudo leer como JWT.' }; }
    if (rol !== 'anon') return { ok: false, error: `La clave tiene el rol "${rol}", no "anon". Una clave service_role NUNCA debe publicarse.` };
  } else if (!/^sb_publishable_/.test(anonKey)) {
    return { ok: false, error: 'La clave no parece una clave anon (JWT) ni una publishable (sb_publishable_…).' };
  }
  return { ok: true };
}

function generar({ url, anonKey, bucketFotos = 'fotos' }) {
  const v = validar({ url, anonKey });
  if (!v.ok) throw new Error(v.error);
  return `// Generado al publicar. Solo clave pública; la protección real son las políticas RLS del servidor.\nexport const SUPABASE = ${JSON.stringify({ url: url.replace(/\/+$/, ''), anonKey, bucketFotos }, null, 2)};\n`;
}

module.exports = { validar, generar };

if (require.main === module) {
  const destino = process.argv[2];
  if (!destino) { console.error('Uso: node scripts/generar-config-local.cjs <carpeta-del-sitio>'); process.exit(2); }
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey } = process.env;
  if (!url && !anonKey) {
    console.log('Sin SUPABASE_URL ni SUPABASE_ANON_KEY: se publica en modo demostración (sin src/config.local.js).');
    process.exit(0);
  }
  try {
    fs.writeFileSync(path.join(destino, 'src', 'config.local.js'), generar({ url, anonKey }));
    console.log('src/config.local.js generado (modo nube).');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
