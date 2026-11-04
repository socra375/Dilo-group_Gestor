// Reporte de combustible para enviar al jefe: diario o mensual, con las facturas (cargas) que el supervisor elige.
// Entrega: enviar por WhatsApp (PDF + texto) o descargar (PDF o Excel/CSV). Los cálculos viven en core/reporteCombustible.js.
import * as store from '../data/store.js';
import { cargarRefs, porId } from '../core/crud.js';
import { hoyClave } from '../core/time.js';
import { pref, setPref } from '../core/prefs.js';
import { aCSV } from '../core/agregados.js';
import { cargasDelPeriodo, armarReporte, csvReporte, nombreArchivo } from '../core/reporteCombustible.js';
import { reporteCombustibleTexto, compartirReporteWhatsApp, internacional } from '../core/share.js';
import { pdfReporteCombustible } from '../core/pdfCombustible.js';
import { reducirImagen, pintarFotos } from '../core/fotos.js';
import * as fmt from '../core/format.js';
import { esc, icon, vacio, toast, descargar, conCarga } from '../core/ui.js';

const claveDe = (est) => (est.tipo === 'mes' ? est.mes : est.dia);

export default {
  titulo: 'Reporte de combustible',
  pestana: 'combustible',
  async render(el, params = {}) {
    const hoy = hoyClave();
    const fechaInicial = /^\d{4}-\d{2}-\d{2}$/.test(params.fecha || '') ? params.fecha : hoy;
    const est = { tipo: params.tipo === 'mes' ? 'mes' : 'dia', dia: fechaInicial, mes: fechaInicial.slice(0, 7), marcadas: new Set(), fotos: true, jefe: pref('jefeWhatsapp') || '' };

    el.innerHTML = `
      <p class="muted">Elige el periodo y las facturas que irán en el reporte. Luego envíalo por WhatsApp o descárgalo.</p>
      <div class="segmented" role="group" aria-label="Tipo de reporte">
        <button type="button" data-tipo="dia" aria-pressed="${est.tipo === 'dia'}">Diario</button>
        <button type="button" data-tipo="mes" aria-pressed="${est.tipo === 'mes'}">Mensual</button>
      </div>
      <label class="field" data-campo-dia><span class="field__label">Día</span><input class="input" type="date" data-dia value="${est.dia}" max="${hoy}"></label>
      <label class="field" data-campo-mes hidden><span class="field__label">Mes</span><input class="input" type="month" data-mes value="${est.mes}" max="${hoy.slice(0, 7)}"></label>

      <section class="card section" aria-labelledby="t-facturas">
        <div class="section__head">
          <h2 class="section__title" id="t-facturas">Facturas</h2>
          <button type="button" class="btn btn--ghost btn--sm" data-todas>Quitar todas</button>
        </div>
        <p class="muted" data-conteo aria-live="polite"></p>
        <ul class="list" data-lista></ul>
      </section>

      <section class="card section" aria-labelledby="t-resumen" data-resumen></section>

      <section class="card section" aria-labelledby="t-envio">
        <h2 class="section__title" id="t-envio">Enviar o descargar</h2>
        <label class="check"><input type="checkbox" data-fotos checked> <span>Incluir las fotos de las facturas en el PDF</span></label>
        <p class="field__help" data-ayuda-fotos></p>
        <label class="field"><span class="field__label">WhatsApp del jefe (opcional)</span>
          <input class="input" type="tel" inputmode="tel" autocomplete="off" data-jefe placeholder="809-555-0100" value="${esc(est.jefe)}" aria-describedby="jefe-err jefe-ayuda">
          <span class="field__help" id="jefe-ayuda">Se recuerda en este teléfono. Si tu navegador no permite adjuntar el PDF, el texto se abre directo en su chat.</span>
          <span class="field__error" id="jefe-err" aria-live="polite"></span></label>
        <div class="stack">
          <button type="button" class="btn btn--whatsapp btn--block" data-enviar>${icon('whatsapp')}Enviar por WhatsApp</button>
          <button type="button" class="btn btn--secondary btn--block" data-pdf>${icon('download')}Descargar PDF</button>
          <button type="button" class="btn btn--secondary btn--block" data-csv>${icon('file')}Descargar Excel (CSV)</button>
        </div>
        <details class="graf__tabla"><summary>Ver el mensaje de WhatsApp</summary><pre class="mensaje" data-mensaje></pre></details>
      </section>`;

    const q = (s) => el.querySelector(s);
    const lista = q('[data-lista]');
    const [cargas, refs] = await conCarga(lista, Promise.all([store.list('combustible'), cargarRefs(['vehiculos', 'choferes'])]), 3);
    const placas = new Map([...porId(refs.vehiculos)].map(([id, v]) => [id, v.placa]));
    const nombres = new Map([...porId(refs.choferes)].map(([id, c]) => [id, c.nombre]));

    const delPeriodo = () => cargasDelPeriodo(cargas, est.tipo, claveDe(est));
    const elegidas = () => delPeriodo().filter((c) => est.marcadas.has(c.id));
    const reporte = () => armarReporte({ cargas: elegidas(), todas: cargas, tipo: est.tipo, clave: claveDe(est), vehiculos: placas, choferes: nombres });

    const marcarTodas = () => {
      est.marcadas = new Set(delPeriodo().map((c) => c.id));
    };

    function pintarLista() {
      const filas = delPeriodo();
      lista.innerHTML = filas.length
        ? filas.map((c) => {
            const placa = placas.get(c.vehiculoId) ?? '(vehículo eliminado)';
            const quien = [nombres.get(c.choferId), c.estacion].filter(Boolean).join(' · ');
            return `<li class="item"><label class="seleccion">
              <input type="checkbox" data-carga="${esc(c.id)}" ${est.marcadas.has(c.id) ? 'checked' : ''} aria-label="Incluir la carga de ${esc(placa)} del ${esc(fmt.fecha(c.fecha))}">
              <span class="item__body">
                <span class="item__title">${esc(placa)} · <span class="tabular">${esc(fmt.dinero(c.monto))}</span></span>
                <span class="item__subtitle tabular">${esc(fmt.fecha(c.fecha))}${c.hora ? ` ${esc(fmt.horaTexto(c.hora))}` : ''} · ${esc(fmt.cantidad(c.cantidad))}${quien ? ` · ${esc(quien)}` : ''}${c.fotoId ? '' : ' · sin foto'}</span>
              </span>
              ${c.fotoId ? `<span class="avatar avatar--recibo"><img alt="Factura de ${esc(placa)}" data-foto="${esc(c.fotoId)}"></span>` : ''}
            </label></li>`;
          }).join('')
        : `<li>${vacio({ icono: 'fuel', titulo: est.tipo === 'mes' ? 'No hay cargas este mes' : 'No hay cargas este día', texto: 'Elige otra fecha, o registra las cargas en la pestaña Combustible.' })}</li>`;
      pintarFotos(lista);
    }

    function pintarResumen() {
      const total = delPeriodo().length;
      const rep = reporte();
      const t = rep.totales;
      q('[data-conteo]').textContent = total ? `${t.cargas} de ${fmt.plural(total, 'factura', 'facturas')} elegidas` : '';
      q('[data-todas]').textContent = t.cargas === total ? 'Quitar todas' : 'Marcar todas';
      q('[data-todas]').hidden = total === 0;
      q('[data-resumen]').innerHTML = `
        <h2 class="section__title" id="t-resumen">Resumen del reporte</h2>
        <p class="muted">${esc(rep.periodoTexto)}</p>
        <div class="stats stats--resumen">
          <div class="stat"><span class="stat__label">Cargas</span><span class="stat__value stat__value--sm tabular">${t.cargas}</span></div>
          <div class="stat"><span class="stat__label">${esc(fmt.unidad('larga').replace(/^./, (c) => c.toUpperCase()))}</span><span class="stat__value stat__value--sm tabular">${esc(fmt.numero(t.cantidad, 1))}</span></div>
          <div class="stat"><span class="stat__label">Monto total</span><span class="stat__value stat__value--sm tabular">${esc(fmt.dinero(t.monto))}</span></div>
        </div>
        ${rep.porVehiculo.length ? `<ul class="list">${rep.porVehiculo.map((g) => `<li class="item"><span class="item__title">${esc(g.placa)}</span><span class="item__subtitle tabular">${esc(fmt.cantidad(g.cantidad))} · ${esc(fmt.dinero(g.monto))} · ${esc(fmt.plural(g.cargas, 'carga', 'cargas'))}</span></li>`).join('')}</ul>` : ''}`;
      const sinElegir = t.cargas === 0;
      for (const b of el.querySelectorAll('[data-enviar], [data-pdf], [data-csv]')) b.disabled = sinElegir;
      const fotosCasilla = q('[data-fotos]');
      fotosCasilla.disabled = t.conFoto === 0;
      q('[data-ayuda-fotos]').textContent = t.conFoto === 0
        ? (t.cargas ? 'Ninguna de las facturas elegidas tiene foto.' : '')
        : `${fmt.plural(t.conFoto, 'factura tiene', 'facturas tienen')} foto${t.conFoto === 1 ? '' : 's'}.`;
      q('[data-mensaje]').textContent = sinElegir ? '' : reporteCombustibleTexto(rep);
    }

    function pintar() {
      q('[data-campo-dia]').hidden = est.tipo !== 'dia';
      q('[data-campo-mes]').hidden = est.tipo !== 'mes';
      pintarLista();
      pintarResumen();
    }

    /** Fotos de las cargas elegidas como JPEG (lo único que el PDF sabe incrustar). */
    async function fotosDe(filas) {
      const mapa = new Map();
      for (const f of filas) {
        if (!f.fotoId || mapa.has(f.fotoId)) continue;
        try {
          let blob = await store.leerFoto(f.fotoId);
          if (!blob) continue;
          if (blob.type !== 'image/jpeg') blob = await reducirImagen(blob);
          mapa.set(f.fotoId, new Uint8Array(await blob.arrayBuffer()));
        } catch {
          // Una foto que no se puede leer no debe impedir enviar el reporte: queda marcada en el PDF.
        }
      }
      return mapa;
    }

    async function construir() {
      const rep = reporte();
      const fotos = est.fotos && q('[data-fotos]').checked ? await fotosDe(rep.filas) : new Map();
      return { rep, pdf: pdfReporteCombustible(rep, fotos), texto: reporteCombustibleTexto(rep) };
    }

    const conBoton = async (boton, trabajo) => {
      boton.disabled = true;
      try {
        await trabajo();
      } catch (e) {
        console.error(e);
        toast('No se pudo preparar el reporte. Inténtalo de nuevo.');
      } finally {
        boton.disabled = elegidas().length === 0;
      }
    };

    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-dia]') && e.target.value) {
        est.dia = e.target.value;
        marcarTodas();
        pintar();
      } else if (e.target.matches('[data-mes]') && e.target.value) {
        est.mes = e.target.value;
        marcarTodas();
        pintar();
      } else if (e.target.matches('[data-carga]')) {
        if (e.target.checked) est.marcadas.add(e.target.dataset.carga);
        else est.marcadas.delete(e.target.dataset.carga);
        pintarResumen();
      } else if (e.target.matches('[data-fotos]')) {
        est.fotos = e.target.checked;
      } else if (e.target.matches('[data-jefe]')) {
        const v = e.target.value.trim();
        const ok = !v || internacional(v);
        q('#jefe-err').textContent = ok ? '' : 'Escribe un número de 10 dígitos (809, 829 o 849).';
        e.target.toggleAttribute('aria-invalid', !ok);
        if (ok) {
          est.jefe = v ? internacional(v).slice(-10) : '';
          setPref('jefeWhatsapp', est.jefe);
        }
      }
    });

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tipo) {
        est.tipo = b.dataset.tipo;
        el.querySelectorAll('[data-tipo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        marcarTodas();
        pintar();
      } else if (b.hasAttribute('data-todas')) {
        if (elegidas().length === delPeriodo().length) est.marcadas.clear();
        else marcarTodas();
        pintar();
      } else if (b.hasAttribute('data-pdf')) {
        conBoton(b, async () => {
          const { rep, pdf } = await construir();
          const nombre = nombreArchivo(rep, 'pdf');
          descargar(nombre, pdf, 'application/pdf');
          toast(`Descargado ${nombre}`);
        });
      } else if (b.hasAttribute('data-csv')) {
        const { nombre, encabezados, filas } = csvReporte(reporte());
        descargar(nombre, aCSV(encabezados, filas), 'text/csv;charset=utf-8');
        toast(`Descargado ${nombre}`);
      } else if (b.hasAttribute('data-enviar')) {
        conBoton(b, async () => {
          const { rep, pdf, texto } = await construir();
          const archivo = new File([pdf], nombreArchivo(rep, 'pdf'), { type: 'application/pdf' });
          const r = await compartirReporteWhatsApp({ texto, archivo, numero: est.jefe, titulo: `${rep.titulo} · ${rep.periodoTexto}` });
          if (r === 'texto') toast('Este navegador no permite adjuntar el PDF: se abrió WhatsApp solo con el texto. Descarga el PDF y adjúntalo en el chat.');
        });
      }
    });

    marcarTodas();
    pintar();
  },
};
