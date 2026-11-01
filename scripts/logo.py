"""Genera los logos de la app a partir de la imagen que entregó el cliente.
Uso:  python3 scripts/logo.py <imagen-original.png>
Salida: icons/logo.png (marca + texto) e icons/logo-marca.png (solo la marca), con fondo transparente.
Limpia la franja oscura que traen las capturas de pantalla en el borde derecho y separa el fondo blanco
modelando los dos colores del logo (gris y ámbar), para conservar los bordes suaves sin halo blanco."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

raiz = Path(__file__).resolve().parent.parent
a = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(float)
h, w, _ = a.shape

# 1) franja oscura del borde derecho (artefacto de captura)
oscura = (a.mean(axis=2) < 90).mean(axis=0)
corte = min([x for x in range(w) if oscura[x] > 0.9] or [w])
a = a[:, :corte]

# 2) colores del logo: centros de los dos grupos (gris y ámbar)
px = a.reshape(-1, 3)
solido = px[px.min(axis=1) < 200]
ambar = solido[(solido[:, 0] > 200) & (solido[:, 2] < 120)]
gris = solido[(abs(solido[:, 0] - solido[:, 2]) < 20) & (solido.max(axis=1) < 150)]
C = [np.median(gris, axis=0), np.median(ambar, axis=0)]
print('gris', C[0], 'ámbar', C[1])

# 3) alfa por proyección sobre la línea blanco→color; se elige el color con menor residuo
blanco = np.array([255.0, 255.0, 255.0])
mejor_res = np.full(a.shape[:2], np.inf)
alfa = np.zeros(a.shape[:2])
color = np.zeros(a.shape)
for c in C:
    d = blanco - c
    t = np.clip(((blanco - a) @ d) / (d @ d), 0, 1)
    res = np.linalg.norm((blanco - a) - t[..., None] * d, axis=2)
    mas = res < mejor_res
    mejor_res = np.where(mas, res, mejor_res)
    alfa = np.where(mas, t, alfa)
    color = np.where(mas[..., None], c, color)
alfa[alfa < 0.04] = 0  # ruido de compresión del fondo
rgba = np.dstack([color, alfa * 255]).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')

def recortar(im, caja_y=None, margen=0.06):
    arr = np.array(im)[..., 3] > 0
    for b in bloques:  # ignora el ruido diminuto
        if b[1] - b[0] < 12: arr[b[0]: b[1] + 1] = False
    if caja_y:
        arr[: caja_y[0]] = False
        arr[caja_y[1] + 1:] = False
    ys, xs = np.where(arr)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    m = int(max(x1 - x0, y1 - y0) * margen)
    return im.crop((max(x0 - m, 0), max(y0 - m, 0), min(x1 + m + 1, im.width), min(y1 + m + 1, im.height)))

filas = (np.array(img)[..., 3] > 0).any(axis=1)
bloques, ini = [], None
for y, v in enumerate(filas):
    if v and ini is None: ini = y
    if not v and ini is not None: bloques.append((ini, y - 1)); ini = None
if ini is not None: bloques.append((ini, len(filas) - 1))
marca_y = max(bloques, key=lambda b: b[1] - b[0])  # el bloque más alto es la marca (el otro, el texto "DILO GROUP"; el ruido es diminuto)
print('bloques', bloques)

(raiz / 'icons').mkdir(exist_ok=True)
recortar(img).save(raiz / 'icons' / 'logo.png', optimize=True)
recortar(img, marca_y).save(raiz / 'icons' / 'logo-marca.png', optimize=True)
print('listo:', (raiz / 'icons' / 'logo.png').stat().st_size, 'y', (raiz / 'icons' / 'logo-marca.png').stat().st_size, 'bytes')
