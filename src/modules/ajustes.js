// Ajustes del dispositivo, respaldo (exportar/importar JSON) y datos de ejemplo.
import * as store from '../data/store.js';
import { VERSION_APP } from '../core/esquemas.js';
import { pref, setPref } from '../core/prefs.js';
import { hoyClave, fechaClave } from '../core/time.js';
import * as fmt from '../core/format.js';
import { esc, icon, toast, confirmar, descargar } from '../core/ui.js';
import { hayDatosEjemplo, borrarDatosEjemplo, referenciasReales } from '../data/seed.js';
import { refrescar } from '../core/router.js';

const FORMATO = 1;
const LETRAS = [['normal', 'Normal'], ['grande', 'Grande'], ['extra', 'Extra grande']];

const segmentadoLetra = (actual) => `<div class="segmented" role="group" aria-label="Tamaño de letra">${LETRAS
  .map(([v, t]) => `<button type="button" data-letra="${v}" aria-pressed="${v === actual}">${esc(t)}</button>`)
  .join('')}</div>`;

async function exportarRespaldo() {
  const datos = await store.exportAll();
  const respaldo = { app: 'control-transporte', formato: FORMATO, version: VERSION_APP, exportado: new Date().toISOString(), datos };
  descargar(`control-transporte-respaldo-${hoyClave()}.json`, JSON.stringify(respaldo, null, 2), 'application/json');
  setPref('ultimoRespaldo', respaldo.exportado);
  toast('Respaldo descargado. Guárdalo fuera del teléfono (correo, Drive o WhatsApp).', 'ok', 4200);
}

async function importarRespaldo(archivo) {
  let r;
  try {
    r = JSON.parse(await archivo.text());
  } catch {
    throw new Error('El archivo no es un respaldo válido (JSON dañado).');
  }
  if (r?.app !== 'control-transporte' || !r.datos) throw new Error('Este archivo no es un respaldo de Control de Transporte.');
  if (r.formato > FORMATO) throw new Error('El respaldo es de una versión más nueva de la app. Actualiza la app primero.');
  const n = (c) => (Array.isArray(r.datos[c]) ? r.datos[c].length : 0);
  const ok = await confirmar({
    titulo: '¿Reemplazar todos los datos?',
    mensaje: `Se cargará el respaldo del ${fmt.fechaNum(fechaClave(r.exportado))} (${n('viajes')} viajes, ${n('choferes')} choferes, ${n('combustible')} cargas). Lo que hay ahora en este teléfono se perderá.`,
    confirmar: 'Reemplazar',
    peligro: true,
  });
  if (!ok) return false;
  await store.replaceAll(r.datos);
  setPref('sembrado', true);
  toast('Respaldo restaurado.');
  return true;
}

export default {
  titulo: 'Ajustes',
  pestana: 'mas',
  async render(el) {
    const ejemplo = await hayDatosEjemplo();
    const ultimo = pref('ultimoRespaldo');
    const persistente = await navigator.storage?.persisted?.().catch(() => false);
    const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    el.innerHTML = `
      <section class="card section" aria-labelledby="t-apariencia">
        <h2 class="section__title" id="t-apariencia">Apariencia</h2>
        <label class="switch"><span><strong>Modo oscuro</strong><br><small class="muted">Útil de noche. Por defecto, claro.</small></span>
          <input type="checkbox" role="switch" id="f-oscuro" ${pref('tema') === 'oscuro' ? 'checked' : ''}></label>
        <div class="field"><span class="field__label">Tamaño de letra</span>${segmentadoLetra(pref('letra'))}
          <p class="field__help">Vista previa: Salida 5:30 a. m. · RD$4,185.00</p></div>
      </section>

      <section class="card section" aria-labelledby="t-reglas">
        <h2 class="section__title" id="t-reglas">Reglas</h2>
        <div class="field" data-campo="tolerancia">
          <label class="field__label" for="f-tolerancia">Tolerancia de retraso (minutos)</label>
          <div class="input-affix input-affix--suffix"><input class="input tabular" id="f-tolerancia" type="text" inputmode="numeric" value="${pref('toleranciaMin')}" aria-describedby="f-tolerancia-help f-tolerancia-err"><span class="input-affix__text">min</span></div>
          <p class="field__help" id="f-tolerancia-help">Un viaje cuenta como “Retrasado” solo si llega más de estos minutos tarde.</p>
          <p class="field__error" id="f-tolerancia-err" aria-live="polite"></p>
        </div>
        <dl class="kv"><dt>Unidad de combustible</dt><dd>${esc(fmt.unidad('larga'))}</dd><dt>Moneda</dt><dd>RD$ (peso dominicano)</dd><dt>Zona horaria</dt><dd>Santo Domingo</dd></dl>
      </section>

      <section class="card section" aria-labelledby="t-respaldo">
        <h2 class="section__title" id="t-respaldo">Respaldo</h2>
        <p class="muted">Los datos viven solo en este teléfono. Exporta un respaldo cada semana y guárdalo fuera del teléfono.</p>
        <p><strong>Último respaldo:</strong> ${ultimo ? `${fmt.fechaNum(fechaClave(ultimo))}, ${fmt.hora(ultimo)}` : 'nunca'}</p>
        <div class="stack">
          <button type="button" class="btn btn--primary btn--block" data-exportar>${icon('download')}Exportar respaldo (JSON)</button>
          <label class="btn btn--secondary btn--block" for="f-importar">${icon('upload')}Importar respaldo</label>
          <input class="sr-only" id="f-importar" type="file" accept="application/json,.json">
          <p class="field__error" id="f-importar-err" aria-live="polite"></p>
        </div>
      </section>

      ${ejemplo ? `<section class="card section" aria-labelledby="t-ejemplo" style="border-color:var(--c-warn)">
        <h2 class="section__title" id="t-ejemplo">Datos de ejemplo</h2>
        <p class="muted">La app trae choferes, rutas, vehículos, viajes y cargas de ejemplo para que veas cómo funciona. Bórralos antes de empezar a usarla en serio.</p>
        <button type="button" class="btn btn--danger btn--block" data-borrar-ejemplo>${icon('trash')}Borrar todos los datos de ejemplo</button>
      </section>` : ''}

      <section class="card section" aria-labelledby="t-disp">
        <h2 class="section__title" id="t-disp">Este dispositivo</h2>
        <dl class="kv">
          <dt>Instalada en inicio</dt><dd>${instalada ? 'Sí' : 'No'}</dd>
          <dt>Almacenamiento protegido</dt><dd>${persistente ? 'Sí' : 'No'}</dd>
          <dt>Versión</dt><dd>${esc(VERSION_APP)}</dd>
        </dl>
        ${instalada ? '' : `<div class="alert alert--info">${icon('info')}<span class="alert__body"><span class="alert__title">Instálala en la pantalla de inicio</span><span class="alert__text">iPhone: Compartir → “Agregar a inicio”. Android: menú ⋮ → “Instalar app”. Así funciona sin internet y el navegador no borra los datos.</span></span></div>`}
      </section>`;

    el.querySelector('#f-oscuro').addEventListener('change', (e) => setPref('tema', e.target.checked ? 'oscuro' : 'claro'));
    // El botón rápido del encabezado también cambia el tema: mantener el interruptor al día.
    const alCambiarPref = (e) => {
      if (e.detail.clave === 'tema') el.querySelector('#f-oscuro').checked = e.detail.valor === 'oscuro';
    };
    window.addEventListener('prefs', alCambiarPref);

    const tol = el.querySelector('#f-tolerancia');
    tol.addEventListener('change', () => {
      const err = el.querySelector('#f-tolerancia-err');
      const n = Number(tol.value.trim());
      if (!/^\d{1,2}$/.test(tol.value.trim()) || n > 60) {
        err.textContent = 'Escribe un número entero entre 0 y 60.';
        tol.setAttribute('aria-invalid', 'true');
        return;
      }
      err.textContent = '';
      tol.removeAttribute('aria-invalid');
      setPref('toleranciaMin', n);
      toast(`Tolerancia: ${n} min`);
    });

    el.querySelector('#f-importar').addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      e.target.value = '';
      const err = el.querySelector('#f-importar-err');
      err.textContent = '';
      if (!archivo) return;
      try {
        if (await importarRespaldo(archivo)) refrescar();
      } catch (x) {
        err.textContent = x.message;
      }
    });

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.letra) {
        setPref('letra', b.dataset.letra);
        el.querySelectorAll('[data-letra]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      } else if (b.hasAttribute('data-exportar')) {
        await exportarRespaldo();
        refrescar();
      } else if (b.hasAttribute('data-borrar-ejemplo')) {
        const refs = await referenciasReales();
        const ok = await confirmar({
          titulo: '¿Borrar los datos de ejemplo?',
          mensaje: `Se borran los choferes, rutas, vehículos, viajes, turnos y cargas de ejemplo. Lo que tú registraste se queda.${refs ? ` Ojo: ${refs} registro(s) tuyos usan datos de ejemplo y mostrarán “(eliminado)”.` : ''}`,
          confirmar: 'Borrar',
          peligro: true,
        });
        if (!ok) return;
        const n = await borrarDatosEjemplo();
        toast(`${fmt.plural(n, 'registro borrado', 'registros borrados')}.`);
        refrescar();
      }
    });
    return () => window.removeEventListener('prefs', alCambiarPref);
  },
};
