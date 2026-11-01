// Ajustes del dispositivo y respaldo (exportar/importar JSON).
import * as store from '../data/store.js';
import { VERSION_APP } from '../core/esquemas.js';
import { pref, setPref, avisosConfig } from '../core/prefs.js';
import { hoyClave, fechaClave } from '../core/time.js';
import * as fmt from '../core/format.js';
import { esc, icon, toast, confirmar, descargar } from '../core/ui.js';
import { refrescar } from '../core/router.js';

const FORMATO = 2; // 2: incluye las fotos (en base64). Los respaldos de formato 1 (sin fotos) se siguen pudiendo importar.
const LETRAS = [['normal', 'Normal'], ['grande', 'Grande'], ['extra', 'Extra grande']];

const segmentadoLetra = (actual) => `<div class="segmented" role="group" aria-label="Tamaño de letra">${LETRAS
  .map(([v, t]) => `<button type="button" data-letra="${v}" aria-pressed="${v === actual}">${esc(t)}</button>`)
  .join('')}</div>`;

const blobADataUrl = (blob) => new Promise((ok, mal) => {
  const lector = new FileReader();
  lector.onload = () => ok(lector.result);
  lector.onerror = () => mal(lector.error);
  lector.readAsDataURL(blob);
});

const dataUrlABlob = async (url) => (await fetch(url)).blob();

async function exportarRespaldo() {
  const datos = await store.exportAll();
  const fotos = await Promise.all((await store.listarFotos()).map(async (f) => ({ id: f.id, tipo: f.tipo, creado: f.creado, datos: await blobADataUrl(f.blob) })));
  const respaldo = { app: 'control-transporte', formato: FORMATO, version: VERSION_APP, exportado: new Date().toISOString(), datos, fotos };
  descargar(`control-transporte-respaldo-${hoyClave()}.json`, JSON.stringify(respaldo), 'application/json');
  setPref('ultimoRespaldo', respaldo.exportado);
  toast(`Respaldo descargado con ${fmt.plural(fotos.length, 'foto', 'fotos')}. Guárdalo fuera del teléfono (correo o Drive).`, 'ok', 4800);
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
  if (!r.datos.asistencia && Array.isArray(r.datos.turnos)) {
    r.datos.asistencia = r.datos.turnos; // respaldo de una versión anterior
    delete r.datos.turnos;
  }
  const n = (c) => (Array.isArray(r.datos[c]) ? r.datos[c].length : 0);
  // Fotos: solo imágenes en base64; cualquier otra cosa se rechaza antes de tocar los datos.
  const fotosEnArchivo = Array.isArray(r.fotos) ? r.fotos : [];
  if (fotosEnArchivo.some((f) => !f?.id || typeof f.datos !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(f.datos))) {
    throw new Error('El respaldo tiene fotos dañadas: no se importó nada.');
  }
  const ok = await confirmar({
    titulo: '¿Reemplazar todos los datos?',
    mensaje: `Se cargará el respaldo del ${fmt.fechaNum(fechaClave(r.exportado))} (${n('viajes')} viajes, ${n('choferes')} choferes, ${n('combustible')} cargas, ${fmt.plural(fotosEnArchivo.length, 'foto', 'fotos')}). Lo que hay ahora en este teléfono se perderá.`,
    confirmar: 'Reemplazar',
    peligro: true,
  });
  if (!ok) return false;
  const fotos = await Promise.all(fotosEnArchivo.map(async (f) => ({ id: f.id, tipo: f.tipo, creado: f.creado, blob: await dataUrlABlob(f.datos) })));
  await store.replaceAll(r.datos, fotos);
  toast('Respaldo restaurado.');
  return true;
}

// Reglas de cada umbral editable: [mínimo, máximo] y cómo se lee.
const REGLAS_AVISO = {
  lista: { min: 1, max: 365, ayuda: 'Escribe de 1 a 5 números enteros de 1 a 365, separados por coma (ej. 30, 15, 7).' },
  dias: { min: 1, max: 60, ayuda: 'Escribe un número entero de 1 a 60.' },
  km: { min: 50, max: 5000, ayuda: 'Escribe un número entero de 50 a 5,000.' },
  pct: { min: 5, max: 100, ayuda: 'Escribe un número entero de 5 a 100.' },
  ventana: { min: 7, max: 180, ayuda: 'Escribe un número entero de 7 a 180.' },
};

/** Lee y valida un umbral. Devuelve { valor } o { error }. */
export function leerUmbral(texto, tipo) {
  const r = REGLAS_AVISO[tipo];
  const partes = String(texto).split(/[,\s]+/).filter(Boolean);
  if (!partes.length || partes.some((p) => !/^\d+$/.test(p))) return { error: r.ayuda };
  const nums = [...new Set(partes.map(Number))];
  if (nums.some((n) => n < r.min || n > r.max)) return { error: r.ayuda };
  if (tipo === 'lista') {
    if (nums.length > 5) return { error: r.ayuda };
    return { valor: nums.sort((a, b) => b - a) };
  }
  if (nums.length !== 1) return { error: r.ayuda };
  return { valor: nums[0] };
}

const campoAviso = (clave, etiqueta, valor, ayuda, tipo) => `<div class="field" data-campo="aviso-${clave}">
  <label class="field__label" for="f-aviso-${clave}">${esc(etiqueta)}</label>
  <input class="input tabular" id="f-aviso-${clave}" type="text" inputmode="${tipo === 'lista' ? 'text' : 'numeric'}" autocomplete="off" data-aviso="${clave}" data-tipo="${tipo}" value="${esc(valor)}" aria-describedby="f-aviso-${clave}-err${ayuda ? ` f-aviso-${clave}-help` : ''}">
  ${ayuda ? `<p class="field__help" id="f-aviso-${clave}-help">${esc(ayuda)}</p>` : ''}
  <p class="field__error" id="f-aviso-${clave}-err" aria-live="polite"></p>
</div>`;

export default {
  titulo: 'Ajustes',
  pestana: 'mas',
  async render(el) {
    const ultimo = pref('ultimoRespaldo');
    const persistente = await navigator.storage?.persisted?.().catch(() => false);
    const avisos = avisosConfig();
    const sesion = store.sesionActual();
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

      <section class="card section" aria-labelledby="t-avisos-cfg">
        <h2 class="section__title" id="t-avisos-cfg">Avisos</h2>
        <p class="muted">Cuándo te avisa la app. Los cambios se aplican al instante en este teléfono.</p>
        ${campoAviso('licenciaDias', 'Licencias: avisar cuando falten (días)', avisos.licencia.dias.join(', '), 'Varios valores separados por coma. El menor es el más urgente.', 'lista')}
        ${campoAviso('seguroDias', 'Seguros: avisar cuando falten (días)', avisos.seguro.dias.join(', '), 'Igual que las licencias.', 'lista')}
        ${campoAviso('mantenimientoDias', 'Mantenimiento: avisar con (días)', avisos.mantenimiento.dias, '', 'dias')}
        ${campoAviso('mantenimientoKm', 'Mantenimiento: avisar cuando falten (km)', avisos.mantenimiento.km, 'Según el último kilometraje registrado en combustible.', 'km')}
        ${campoAviso('combustiblePct', 'Combustible alto: peor que el promedio por más de (%)', avisos.combustible_alto.umbral_pct, 'Compara el rendimiento de la última carga contra el promedio del vehículo.', 'pct')}
        ${campoAviso('combustibleVentana', 'Combustible alto: promedio de los últimos (días)', avisos.combustible_alto.ventana_dias, '', 'ventana')}
        <button type="button" class="btn btn--ghost btn--block" data-restablecer-avisos>Restablecer valores de la configuración</button>
      </section>

      <section class="card section" aria-labelledby="t-respaldo">
        <h2 class="section__title" id="t-respaldo">Respaldo</h2>
        <p class="muted">${store.nubeActiva() ? 'Tus datos están en la nube, protegidos por tu cuenta. Un respaldo es una copia extra que guardas tú.' : 'Los datos viven solo en este teléfono. Exporta un respaldo cada semana y guárdalo fuera del teléfono.'}</p>
        <p><strong>Último respaldo:</strong> ${ultimo ? `${fmt.fechaNum(fechaClave(ultimo))}, ${fmt.hora(ultimo)}` : 'nunca'}</p>
        <div class="stack">
          <button type="button" class="btn btn--primary btn--block" data-exportar>${icon('download')}Exportar respaldo (JSON)</button>
          <label class="btn btn--secondary btn--block" for="f-importar">${icon('upload')}Importar respaldo</label>
          <input class="sr-only" id="f-importar" type="file" accept="application/json,.json">
          <p class="field__error" id="f-importar-err" aria-live="polite"></p>
        </div>
      </section>

      ${store.nubeActiva() ? `<section class="card section" aria-labelledby="t-cuenta">
        <h2 class="section__title" id="t-cuenta">Cuenta</h2>
        <dl class="kv"><dt>Sesión</dt><dd>${esc(sesion?.email || '—')}</dd><dt>Datos</dt><dd>En la nube (protegidos por cuenta)</dd></dl>
        <button type="button" class="btn btn--secondary btn--block" data-cerrar-sesion>${icon('logout')}Cerrar sesión</button>
      </section>` : ''}

      <section class="card section" aria-labelledby="t-disp">
        <h2 class="section__title" id="t-disp">Este dispositivo</h2>
        <dl class="kv">
          <dt>Instalada en inicio</dt><dd>${instalada ? 'Sí' : 'No'}</dd>
          <dt>Almacenamiento protegido</dt><dd>${persistente ? 'Sí' : 'No'}</dd>
          <dt>Versión</dt><dd>${esc(VERSION_APP)}</dd>
          <dt>Compilación</dt><dd data-compilacion>—</dd>
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

    el.addEventListener('change', (e) => {
      const entrada = e.target.closest('[data-aviso]');
      if (!entrada) return;
      const err = el.querySelector(`#f-aviso-${entrada.dataset.aviso}-err`);
      const r = leerUmbral(entrada.value, entrada.dataset.tipo);
      if (r.error) {
        err.textContent = r.error;
        entrada.setAttribute('aria-invalid', 'true');
        return;
      }
      err.textContent = '';
      entrada.removeAttribute('aria-invalid');
      entrada.value = Array.isArray(r.valor) ? r.valor.join(', ') : r.valor;
      setPref('avisos', { ...(pref('avisos') || {}), [entrada.dataset.aviso]: r.valor });
      toast('Aviso actualizado.');
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
      if (b.hasAttribute('data-cerrar-sesion')) {
        await store.salir();
        location.reload(); // vuelve a la pantalla de entrar, sin datos en pantalla
      } else if (b.hasAttribute('data-restablecer-avisos')) {
        setPref('avisos', {});
        toast('Avisos restablecidos a los valores de la configuración.');
        refrescar();
      } else if (b.dataset.letra) {
        setPref('letra', b.dataset.letra);
        el.querySelectorAll('[data-letra]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      } else if (b.hasAttribute('data-exportar')) {
        await exportarRespaldo();
        refrescar();
      }
    });
    // Qué compilación sirve esta página (la versión del service worker): sirve para saber si ya llegó una actualización.
    caches?.keys?.().then((claves) => {
      const v = claves.find((k) => k.startsWith('ct-app-'));
      const campo = el.querySelector('[data-compilacion]');
      if (campo) campo.textContent = v ? v.replace('ct-app-', '') : 'sin instalar';
    }).catch(() => {});
    return () => window.removeEventListener('prefs', alCambiarPref);
  },
};
