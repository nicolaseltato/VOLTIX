# Voltix — Agente de publicidad y rentabilidad (Mercado Ads)

Agente que se conecta a la API de Mercado Ads (Product Ads) de tu cuenta de Mercado Libre, analiza el desempeño de tus campañas y genera un informe en Markdown con los próximos movimientos recomendados, priorizados por impacto.

No accede a nada por defecto: primero tenés que autorizar tu propia aplicación de Mercado Libre (OAuth) para que el agente pueda leer tus campañas en tu nombre.

## 1. Crear la aplicación en Mercado Libre

1. Entrá a [Mis aplicaciones](https://developers.mercadolibre.com.ar/devcenter) logueado con la cuenta **administradora** de Voltix (no un colaborador).
2. Creá una aplicación nueva.
3. En **Permisos funcionales**, activá al menos:
   - **Publicidad** (lectura de Advertising / Product Ads).
   - **Métricas del negocio** (opcional, útil para contexto adicional).
4. Configurá un **Redirect URI**. Como este proyecto corre el flujo manualmente (pegando el `code` a mano), podés usar cualquier URL fija que controles, por ejemplo `https://localhost/callback` — no hace falta que responda nada, solo hace falta copiar el `code` de la barra de direcciones después de autorizar.
5. Guardá el **App ID** (`client_id`) y el **Client Secret**.

Requisitos para poder usar Product Ads en la cuenta: reputación amarilla o superior, al menos 15 días desde el registro, mínimo de ventas (10 para cuenta individual) y sin facturas vencidas.

## 2. Configurar credenciales

```bash
cp .env.example .env
```

Completá `.env` con:

- `ML_APP_ID` / `ML_CLIENT_SECRET`: los de la app que creaste.
- `ML_REDIRECT_URI`: el mismo Redirect URI configurado en la app.
- `ML_SITE_ID`: `MLA` para Argentina (ajustá si Voltix opera en otro país).

`.env` está en `.gitignore`: nunca se sube al repositorio.

## 3. Autorizar la aplicación (una sola vez)

```bash
npm run authorize
```

El script te va a mostrar una URL. Abrila en el navegador, logueado como administrador de la cuenta de Voltix, autorizá la app, y copiá el `code` (y el `state`) que aparecen en la URL a la que te redirige. El script guarda el `access_token`/`refresh_token` en `.credentials.json` (también gitignored) y renueva el token automáticamente cuando genera cada informe.

## 4. (Recomendado) Cargar tu margen real

Mercado Libre reporta ACOS/ROAS sobre **ingresos**, no sobre ganancia. Para que el informe te diga qué campañas son rentables *de verdad* (no solo "cumplen el objetivo que configuraste en Mercado Ads"), cargá tu margen de contribución:

```bash
cp config/margins.example.json config/margins.json
```

Editá `default_margin_pct` con tu margen bruto promedio (%, antes de publicidad). Si querés precisión por campaña puntual, agregá su `id` en `by_campaign`. Con esto el agente calcula el **ACOS de equilibrio** y compara cada campaña contra tu rentabilidad real, no contra un proxy.

Si no cargás este archivo, el informe usa el ROAS objetivo de cada campaña como referencia y lo aclara en el encabezado.

## 5. Generar el informe

```bash
npm run report
```

Por defecto analiza los últimos 30 días. Opciones:

```bash
npm run report -- --days=7
npm run report -- --from=2026-07-01 --to=2026-07-31
```

El informe se guarda en `reports/informe-<fecha>.md` y también se imprime en consola. Incluye:

- **Resumen ejecutivo**: inversión, ventas atribuidas, ACOS/ROAS general de la cuenta, % de ventas que viene de publicidad.
- **Próximos movimientos priorizados**: acciones concretas (escalar presupuesto, bajar objetivo, revisar creatividad, pausar, etc.) ordenadas por prioridad e impacto en $.
- **Detalle por campaña**: tabla completa con las métricas clave.

## Cómo razona el agente

Por cada campaña activa combina las métricas del período (clicks, costo, ROAS, ACOS, CTR, CVR) con el % de subastas perdidas por presupuesto o por ad rank, y las clasifica:

| Situación | Acción sugerida |
|---|---|
| Rentable + pierde subastas por presupuesto | 📈 Escalar presupuesto |
| Rentable + pierde subastas por ad rank | 🎯 Ajustar puja / calidad de la publicación |
| Rentable + sin restricciones | ✅ Mantener |
| No rentable + CTR bajo | 🖼️ Revisar creatividad/precio (no genera clicks) |
| No rentable + CVR bajo | 🏷️ Revisar ficha/precio/stock (genera clicks, no convierte) |
| No rentable, sin causa clara | 🔻 Bajar ROAS objetivo o pausar |
| Casi sin impresiones/inversión | 🔍 Diagnosticar (stock, elegibilidad, presupuesto muy bajo) |

## Estructura del proyecto

```
bin/authorize.js        CLI para el flujo OAuth (una vez, o cuando expire el refresh_token cada 6 meses)
bin/generate-report.js  CLI que descarga datos y genera el informe
src/config.js           Carga de variables de entorno
src/oauth.js            Flujo OAuth2 + PKCE contra Mercado Libre
src/mercadoAdsClient.js Cliente de la API de Product Ads (advertisers, campañas, métricas)
src/analyze.js          Motor de clasificación y priorización de acciones
src/report.js           Generador del informe en Markdown
config/margins.example.json  Plantilla de margen de contribución
reports/                Informes generados (no se versionan)
```

## Notas de seguridad

- `.env` y `.credentials.json` nunca se commitean (ver `.gitignore`).
- El `refresh_token` vence a los 6 meses de inactividad, o antes si cambiás la contraseña de Mercado Libre o revocás el permiso a la app.
- Si algún día necesitás revocar el acceso, hacelo desde Mercado Libre > Mi perfil > Aplicaciones autorizadas.
