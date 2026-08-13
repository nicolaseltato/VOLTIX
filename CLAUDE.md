# Voltix — instrucciones para Claude

Este repo es un agente que genera informes de rendimiento de Mercado Ads /
Mercado Libre para la cuenta de Voltix. El dueño del negocio interactúa con
este agente **por chat**, no por terminal — cuando pida un informe, corré vos
los comandos y devolvele el resultado en la conversación. Nunca le respondas
"corré `npm run report` vos" ni le pidas que abra una terminal: para eso está
este archivo.

## Cuando piden un informe

Frases típicas: "dame el reporte", "cómo van las campañas", "quiero el
informe de la semana", "mandame las métricas de ML", etc. (puede ser en
cualquier momento, sin aviso previo).

1. Traducí el pedido a argumentos de `npm run report`:
   - Sin período explícito → default (últimos 30 días).
   - "de la semana" / "últimos 7 días" → `-- --days=7`.
   - Rango de fechas explícito → `-- --from=YYYY-MM-DD --to=YYYY-MM-DD`.
2. Corré `npm run report [-- --días...]` con la tool de Bash.
3. Pegá el contenido del informe generado (`reports/informe-<fecha>.md`) directo
   en la respuesta al usuario — no le digas simplemente "listo, revisá el
   archivo", mostrale el contenido relevante (resumen ejecutivo como mínimo).

## Si falta `.env` (credenciales de la app ML)

Cada sesión nueva arranca en un contenedor efímero: `.env` y
`.credentials.json` **no persisten** entre sesiones (están en `.gitignore` a
propósito, son secretos — nunca los commitees).

Si falta `.env`, avisale al usuario y pedile los 4 valores por chat (no hace
falta terminal de su lado):

- `ML_APP_ID`, `ML_CLIENT_SECRET` (de developers.mercadolibre.com.ar/devcenter)
- `ML_REDIRECT_URI` (el mismo configurado en la app)
- `ML_SITE_ID` (`MLA` para Argentina si no dice otra cosa)

Con esos datos, creá vos `.env` en el contenedor (a partir de
`.env.example`) y seguí.

**Mejor solución de fondo**: si el usuario quiere evitar repetir esto en cada
sesión nueva, sugerile configurar esas 4 variables como *environment
variables* a nivel del Environment de Claude Code (no del repo) desde
claude.ai/code — eso sí persiste entre sesiones y contenedores.

## Si falta `.credentials.json` o el token venció (dura 6 horas)

Esta cuenta de ML no emite `refresh_token` (ver README, sección "Sobre la
renovación automática"), así que hay que re-autorizar a mano cada ~6 horas o
al empezar una sesión nueva. Hacé esto conversacionalmente, sin que el
usuario toque una terminal:

1. Corré `node bin/authorize.js` (con Bash) — imprime una URL de autorización.
2. Pasále esa URL al usuario en el chat para que la abra logueado como
   **administrador** de la cuenta de Voltix.
3. Pedile que te copie el `code` de la URL a la que lo redirige (aunque esa
   página no cargue nada, es esperado).
4. Corré `node bin/authorize.js --code=EL_CODE` para completar el intercambio.
5. Listo, ya podés generar el informe.

No inventes ni reutilices codes viejos: cada `code` sirve una sola vez.

## Notas

- El informe también se guarda en `reports/informe-<fecha>.md`, pero ese
  archivo no se commitea (está en `.gitignore`).
- `config/costos.csv` (costo real de producto) tampoco se commitea — es
  información sensible del negocio. Si no existe, `npm run report` lo genera
  vacío la primera vez; avisale al usuario que tiene que completarlo para ver
  ganancia real.
