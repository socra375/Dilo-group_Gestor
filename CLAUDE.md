# Instrucciones para Claude en este repositorio

## Fusión automática (regla del dueño del repositorio)

Al terminar un cambio, ejecutar las tres suites:

```bash
npm test          # pruebas unitarias
npm run e2e       # flujos en navegador headless
npm run qa        # pantallas a 390 px, claro/oscuro, contraste, offline, letra grande
```

- **Si las tres pasan en local Y el check `CI` de GitHub Actions (`.github/workflows/ci.yml`) está en verde en el último commit:** fusionar el cambio a `main` sin pedir confirmación.
- **Si alguna falla o no se puede ejecutar:** no fusionar. Corregir, o informar qué falla y por qué.
- Nunca saltar, desactivar ni debilitar una prueba para conseguir el verde.

## Flujo de agentes (pedido del dueño)

Reparto de roles con subagentes (`Agent`, parámetro `model`):

- **Haiku 5.5** (`model: haiku`, tipo `Explore`, solo lectura): auditoría lectora del proyecto. Devuelve hallazgos con `archivo:línea`; nunca edita.
- **Opus 5.5**: planifica y busca fuentes de referencia (documentación oficial, estándares), citándolas. Si la sesión no corre en Opus, se lanza un subagente `model: opus` solo para planificar.
- **Sonnet 5.5** (`model: sonnet`): escribe el código, solo lo que indica el plan aprobado y en los archivos que se le nombren.

Reglas: orden Haiku lee → Opus planifica → el dueño aprueba → Sonnet implementa → se verifica. Lo que reporta Haiku es una afirmación, no un hecho: se comprueba leyendo el archivo citado antes de planificar sobre ello. Cada subagente arranca en frío: su prompt lleva rutas, convenciones y qué NO tocar. El código de un subagente no se da por bueno hasta que pasan las tres suites y el CI (ver arriba). Usar subagentes solo cuando aporten, no para cambios de una línea.

## Convenciones

- Interfaz y documentación en español (RD). Ver `README.md` y `DECISIONES.md`.
- Lo configurable va en `src/config.js`; las decisiones por defecto se anotan en `DECISIONES.md`.
- Al agregar un archivo `.js`/`.css`, añadirlo a `ARCHIVOS` en `sw.js` (lo verifica `npm test`) y subir `VERSION`.
