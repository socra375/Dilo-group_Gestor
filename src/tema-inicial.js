// Aplica tema y tamaño de letra antes de pintar para evitar parpadeo.
// Va en un archivo aparte (no en línea) para que la política de seguridad pueda prohibir scripts en línea.
try {
  var p = JSON.parse(localStorage.getItem('ct:prefs') || '{}');
  // Mismas reglas que src/core/prefs.js: por defecto claro y letra normal (17 px).
  document.documentElement.dataset.theme = p.tema === 'oscuro' ? 'oscuro' : 'claro';
  var px = { normal: 17, grande: 19, extra: 21 }[p.letra];
  if (px) document.documentElement.style.fontSize = px + 'px';
} catch (e) {}
