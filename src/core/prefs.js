// Preferencias de ESTE dispositivo (tema, letra, tolerancia, marcas internas).
// No forman parte de la capa de datos: al migrar a Supabase siguen en localStorage.
import { CONFIG } from '../config.js';
import { TAMANOS_LETRA } from './esquemas.js';

const CLAVE = 'ct:prefs';

const porDefecto = () => ({
  tema: CONFIG.tema.modo, // 'claro' | 'oscuro'
  letra: CONFIG.tema.letra, // 'normal' | 'grande' | 'extra'
  toleranciaMin: CONFIG.viajes.tolerancia_min,
  ultimoRespaldo: null,
});

let actual = null;

// La versión anterior guardaba tema 'sistema' y el tamaño en px; se traducen al formato nuevo.
function normalizar(p) {
  if (p.tema !== 'claro' && p.tema !== 'oscuro') delete p.tema;
  if (!p.letra && p.tamanoLetra) {
    p.letra = Object.entries(TAMANOS_LETRA).find(([, px]) => px === Number(p.tamanoLetra))?.[0];
  }
  if (!TAMANOS_LETRA[p.letra]) delete p.letra;
  delete p.tamanoLetra;
  return p;
}

function cargar() {
  if (actual) return actual;
  let guardado = {};
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}');
  } catch {
    guardado = {};
  }
  actual = { ...porDefecto(), ...normalizar(guardado) };
  return actual;
}

export function pref(clave) {
  return cargar()[clave];
}

export function setPref(clave, valor) {
  cargar()[clave] = valor;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    // Sin espacio o almacenamiento bloqueado: la preferencia vive solo en esta sesión.
  }
  window.dispatchEvent(new CustomEvent('prefs', { detail: { clave, valor } }));
}

export const tolerancia = () => Number(pref('toleranciaMin')) || 0;
export const letraPx = () => TAMANOS_LETRA[pref('letra')] ?? TAMANOS_LETRA.normal;

/**
 * Umbrales de avisos: los de CONFIG.avisos con lo que el supervisor cambió en Ajustes por encima.
 * Solo se pueden cambiar los umbrales (días, %, km); encender o apagar un aviso se hace en CONFIG.
 */
export function avisosConfig() {
  const base = CONFIG.avisos;
  const o = pref('avisos') || {};
  return {
    ...base,
    licencia: { ...base.licencia, dias: o.licenciaDias ?? base.licencia.dias },
    seguro: { ...base.seguro, dias: o.seguroDias ?? base.seguro.dias },
    combustible_alto: { ...base.combustible_alto, umbral_pct: o.combustiblePct ?? base.combustible_alto.umbral_pct, ventana_dias: o.combustibleVentana ?? base.combustible_alto.ventana_dias },
    mantenimiento: { ...base.mantenimiento, dias: o.mantenimientoDias ?? base.mantenimiento.dias, km: o.mantenimientoKm ?? base.mantenimiento.km },
  };
}
