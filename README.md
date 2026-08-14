# Voltix — Agente de publicidad y rentabilidad (Mercado Ads)

Agente que se conecta a la API de Mercado Ads (Product Ads) de tu cuenta de Mercado Libre, analiza el desempeño de tus campañas y genera un informe en Markdown con los próximos movimientos recomendados, priorizados por impacto.

No accede a nada por defecto: primero tenés que autorizar tu propia aplicación de Mercado Libre (OAuth) para que el agente pueda leer tus campañas en tu nombre.

## 1. Crear la aplicación en Mercado Libre

1. Entrá a [Mis aplicaciones](https://developers.mercadolibre.com.ar/devcenter) logueado con la cuenta **administradora** de Voltix (no un colaborador).
2. Creá una aplicación nueva.
3. En **Permisos funcionales**, activá al menos:
   - **Publicidad** (lectura de Advertising / Product Ads).
   - **Métricas del negocio** (opcional, útil para contexto adicional).
   - **Facturación** (opcional, pero recomendado): habilita la comisión real cobrada y las percepciones de IVA/Ingresos Brutos por período. Si lo activás después de haber autorizado la app una vez, tenés que volver a correr `npm run authorize` para que el token nuevo incluya el permiso.
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

## 3. Autorizar la aplicación

```bash
npm run authorize
```

El script te va a mostrar una URL. Abrila en el navegador, logueado como administrador de la cuenta de Voltix, autorizá la app, y copiá el `code` (y el `state`) que aparecen en la URL a la que te redirige. El script guarda el `access_token` en `.credentials.json` (también gitignored).

**Sobre la renovación automática:** normalmente Mercado Libre devuelve junto al `access_token` un `refresh_token` que permite renovar la sesión sola, sin volver a pasar por el navegador. En esta cuenta, por algún motivo puntual de configuración que no pudimos aislar (probamos sin PKCE, pidiendo `offline_access` explícito, y revocando/re-autorizando desde cero — nada cambió el resultado), Mercado Libre no lo está emitiendo. Mientras eso siga así, el acceso dura **6 horas** y hay que repetir este mismo paso (`npm run authorize`) cuando venza — el script te avisa claramente cuando eso pasa en vez de fallar en silencio.

## 4. Generar el primer informe

```bash
npm run report
```

La primera vez que lo corrés **no vas a ver la ganancia real todavía** — el agente no inventa el costo de tus productos. Lo que hace es:

1. Traer tus campañas y productos publicitados reales de Mercado Ads.
2. Calcular automáticamente ACOS, ROAS, inversión y ventas por publicidad (esto no requiere nada tuyo).
3. Calcular automáticamente la **comisión real de Mercado Libre** por cada producto, usando el mismo calculador oficial que usa ML (no hace falta que la sepas de memoria).
4. Generar `config/costos.csv` **precargado con tus productos reales** (item_id, título, precio) y las columnas `costo_producto` y `envio_extra` vacías, listas para completar.

## 5. Completar los costos y volver a correr el informe

Abrí `config/costos.csv` y completá, por cada producto:

- **`costo_producto`** (obligatorio para ese producto): lo que te cuesta a vos producirlo o comprarlo (COGS), sin publicidad ni comisión.
- **`envio_extra`** (opcional, default 0): solo si vos pagás una parte del envío de tu bolsillo (por ejemplo Mercado Envíos Flex o Colecta). Si el envío ya te lo descuenta Mercado Libre en la comisión, dejalo en 0.
- **`comision_pct`** (opcional): el agente intenta calcular la comisión de ML automáticamente; en algunos entornos de red ese cálculo automático no funciona (el calculador público de ML bloquea ciertas IPs) y el producto queda marcado "sin costo" aunque hayas cargado `costo_producto`. En ese caso completá acá el % de comisión de esa publicación — lo ves en tu panel de Mercado Libre, en "Costos por vender" (varía según tipo de publicación: Clásica, Premium, etc.). Se aplica sobre el precio **real** de venta del período, no sobre el precio de lista, así que contempla cualquier descuento activo.

Podés completar solo los productos que te interesen — el informe muestra por separado los que sí tienen costo cargado (con ganancia real calculada) y los que todavía no.

```bash
npm run report
```

`config/costos.csv` nunca se sube al repositorio (está en `.gitignore`): son datos sensibles de tu negocio.

## 6. (Opcional) Margen rápido para el análisis táctico de campañas

Además de la ganancia real por producto, el informe sugiere ajustes de presupuesto/puja por campaña. Por defecto usa el ROAS objetivo de cada campaña como referencia. Si preferís que use tu margen real en su lugar:

```bash
cp config/margins.example.json config/margins.json
```

Editá `default_margin_pct` con tu margen bruto promedio (%). Esto es un atajo rápido a nivel campaña — el análisis de `costos.csv` por producto es siempre más preciso.

## 7. (Opcional, recomendado) Gastos declarados para la Ganancia Neta Real completa

El informe calcula una cascada completa de **Ganancia Neta Real** (ingresos brutos → comisiones → IIBB → COGS → Ads → ganancia neta) que no se puede sacar solo de la API de Mercado Libre: falta la cuota de **Monotributo** y otros gastos fijos/variables del negocio (consultora, herramientas pagas, etc.), que solo vos sabés.

```bash
cp config/gastos.example.json config/gastos.json
```

Completá:

- `monotributo_mensual`: tu cuota de Monotributo del período (varía si te recategorizás).
- `iibb_tasa_estimada_pct`: solo se usa cuando no hay un período de facturación cerrado con el dato real de IIBB — referencia, no dato duro.
- `anulaciones_periodo`: opcional. Mercado Libre no expone el total de anulaciones/reembolsos por API pública; si lo sabés (lo ves en tu panel), cargalo acá.
- `otros_gastos`: lista de gastos fijos/variables adicionales, con el monto correspondiente al período del informe.

`config/gastos.json` nunca se sube al repositorio (está en `.gitignore`). Si no lo creás, el informe sigue funcionando pero muestra Monotributo y otros gastos en $0, y te lo avisa en una alerta.

Nunca se calcula ni descuenta IVA ni retenciones de Ganancias: la cuenta está exenta por Monotributo.

## Uso día a día

```bash
npm run report                                 # últimos 30 días
npm run report -- --days=7                     # últimos 7 días
npm run report -- --from=2026-07-01 --to=2026-07-31
```

El informe se guarda en `reports/informe-<fecha>.md` y también se imprime en consola. Por ahora es 100% manual (lo corrés vos cuando lo necesitás); el código ya está separado en módulos (`src/`) para que el día de mañana se pueda disparar solo (por ejemplo semanal) sin tener que rehacer nada — todavía no está programado ese disparo automático.

Incluye:

- **🧮 Ganancia Neta Real**: arriba de todo, el número que importa — cuánta plata ganó el negocio de verdad y el % de margen neto, con alertas primero (productos con margen negativo, campañas cuyo ACOS supera el margen real del producto, IIBB estimado, gastos sin declarar) y la cascada completa de ingresos brutos a ganancia neta.
- **Resumen ejecutivo**: inversión, ventas atribuidas, ACOS/ROAS general, ganancia real total.
- **Comisiones y percepciones reales**: del último período de facturación cerrado — comisión de venta real, publicidad facturada, envíos, y percepciones de Ingresos Brutos desglosadas por jurisdicción (requiere el permiso "Facturación", ver paso 1).
- **Productos pausados por falta de stock**: productos con historial de venta por publicidad que Mercado Libre puso en pausa automática por no tener stock, ordenados por venta generada — para priorizar reposición.
- **Ganancia real por producto**: tabla con costo de producto, comisión ML, envío extra y ganancia real, más una conclusión corta de qué potenciar y qué está perdiendo plata.
- **Próximos movimientos de campaña**: ajustes tácticos de presupuesto/puja.
- **Detalle por campaña**.

## Cómo razona el agente

### A nivel negocio (Ganancia Neta Real, la cascada completa)

```
Ingresos brutos por ventas                (real, API de Órdenes)
(-) Cargo por venta (comisión ML)         (real; incluye costo fijo y cuotas — ML no las discrimina por API pública a nivel de cada venta)
(-) Costo de envío no cubierto            (real, API de Órdenes)
(-) IIBB retenido                         (real si hay un período de facturación cerrado; si no, estimado)
(-) Anulaciones / reembolsos              (declarado por vos en config/gastos.json; ML no lo expone por API)
= Ingreso neto de Mercado Libre
(-) COGS (solo productos con costo cargado en costos.csv)
= Margen de contribución
(-) Cuota Monotributo                     (declarado en config/gastos.json)
(-) Otros gastos declarados               (declarado en config/gastos.json)
= GANANCIA NETA REAL
```

Como el COGS solo se conoce para los productos que cargaste en `config/costos.csv` **y** que corrieron publicidad en el período, la ganancia neta real es una porción del negocio, no necesariamente el 100% — el informe siempre muestra el % de cobertura (venta con costo cargado ÷ ingresos brutos totales) para que quede claro qué parte está midiendo.

Nunca se asume IVA ni Ganancias: Voltix está exento por Monotributo.

### A nivel producto (ganancia real)

`ganancia real = venta por publicidad − (costo del producto × unidades) − (comisión ML × unidades) − (envío extra × unidades) − inversión en publicidad`

Con eso clasifica cada producto en "conviene potenciar" (ganancia real positiva), "está perdiendo plata" (ganancia real negativa o cero) o "sin costo cargado" (no se puede calcular todavía).

El informe también cruza el **ACOS de cada campaña contra el margen real del producto que promociona** (no solo contra el ROAS objetivo que definiste en Mercado Ads): si el ACOS supera ese margen real, la campaña está perdiendo plata aunque "venda mucho", y aparece como alerta arriba de todo.

### A nivel campaña (táctico: presupuesto y puja)

Por cada campaña activa combina ROAS/ACOS, CTR, CVR y el % de subastas perdidas por presupuesto o por ad rank:

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
bin/authorize.js         CLI para el flujo OAuth (una vez, o cuando expire el refresh_token cada 6 meses)
bin/generate-report.js   CLI que descarga datos, genera costos.csv si falta, y arma el informe
src/config.js            Carga de variables de entorno
src/oauth.js             Flujo OAuth2 + PKCE contra Mercado Libre
src/mercadoAdsClient.js  Cliente de Product Ads (advertisers, campañas y productos + métricas)
src/mlFees.js            Cálculo automático de la comisión real de ML por producto (estimada, vía listing_prices)
src/mlBilling.js         Cliente de Facturación (períodos, comisión/percepciones reales)
src/costs.js             Lectura/generación de config/costos.csv (costo de producto y envío extra)
src/aggregateAds.js      Agrupa anuncios por producto cuando corren en más de una campaña
src/analyze.js           Clasificación táctica por campaña (presupuesto/puja)
src/analyzeProfitability.js  Ganancia real por producto
src/analyzeStock.js      Detección de productos pausados por falta de stock
src/analyzeBilling.js    Comisión real, envíos y percepciones IIBB/IVA por período
src/analyzeRealProfitability.js  Cascada de Ganancia Neta Real del negocio + cruce ACOS vs. margen real por campaña
src/report.js            Generador del informe en Markdown
config/margins.example.json  Plantilla de margen rápido (opcional, a nivel campaña)
config/gastos.example.json   Plantilla de Monotributo, IIBB estimado y otros gastos (opcional, para la Ganancia Neta Real)
reports/                 Informes generados (no se versionan)
```

## Notas de seguridad

- `.env` y `.credentials.json` nunca se commitean (ver `.gitignore`).
- El `refresh_token` vence a los 6 meses de inactividad, o antes si cambiás la contraseña de Mercado Libre o revocás el permiso a la app.
- Si algún día necesitás revocar el acceso, hacelo desde Mercado Libre > Mi perfil > Aplicaciones autorizadas.
