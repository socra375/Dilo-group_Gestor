#!/usr/bin/env bash
# Arma la carpeta publicable (solo lo que usa la página) y, si hay SUPABASE_URL y SUPABASE_ANON_KEY, genera
# src/config.local.js rechazando cualquier clave que no sea la pública (scripts/generar-config-local.cjs).
# Lo usan los dos flujos de publicación (GitHub Pages y Cloudflare Pages).   Uso: bash scripts/armar-sitio.sh <carpeta>
# ORIGEN (opcional): carpeta de donde copiar en vez del repositorio (lo usan las pruebas).
set -euo pipefail
destino="${1:?Uso: bash scripts/armar-sitio.sh <carpeta>}"
mkdir -p "$destino"
destino="$(cd "$destino" && pwd)"
raiz="$(cd "$(dirname "$0")/.." && pwd)"
origen="${ORIGEN:-$raiz}"
rm -rf "$destino"
mkdir -p "$destino"
cd "$origen"
cp -r index.html manifest.webmanifest sw.js icons src LICENSE.md _headers "$destino"/
rm -f "$destino/src/config.local.js" # nunca se publica uno local del desarrollador
node "$raiz/scripts/generar-config-local.cjs" "$destino"
