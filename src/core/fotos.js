// Fotos: reducción en el navegador antes de guardar y URLs para mostrarlas.
import { leerFoto } from '../data/store.js';

export const LADO_FOTO = 800; // recibos y fotos en general
export const LADO_FOTO_CHOFER = 400;
const CALIDAD = 0.7;

/**
 * Reduce una imagen a `maxLado` px en su lado mayor y la convierte a JPEG (calidad 0.7).
 * Respeta la orientación de la cámara (EXIF). Nunca agranda.
 */
export async function reducirImagen(archivo, maxLado = LADO_FOTO, calidad = CALIDAD) {
  if (!archivo?.type?.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const ancho = Math.max(1, Math.round(bmp.width * escala));
  const alto = Math.max(1, Math.round(bmp.height * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const cx = lienzo.getContext('2d');
  cx.fillStyle = '#fff'; // las PNG transparentes no quedan negras en JPEG
  cx.fillRect(0, 0, ancho, alto);
  cx.drawImage(bmp, 0, 0, ancho, alto);
  bmp.close?.();
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo procesar la foto.'))), 'image/jpeg', calidad));
}

// Una URL por foto durante la sesión (las fotos son pocas; se liberan al recargar).
const urls = new Map();

export async function urlFoto(id) {
  if (!id) return null;
  if (!urls.has(id)) {
    const blob = await leerFoto(id);
    if (!blob) return null;
    urls.set(id, URL.createObjectURL(blob));
  }
  return urls.get(id);
}

export function olvidarFoto(id) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

/** Rellena los <img data-foto="id"> dentro de `raiz` (carga diferida, sin bloquear la lista). */
export async function pintarFotos(raiz) {
  for (const img of raiz.querySelectorAll('img[data-foto]')) {
    const url = await urlFoto(img.dataset.foto);
    if (url) img.src = url;
    else img.removeAttribute('data-foto');
  }
}
