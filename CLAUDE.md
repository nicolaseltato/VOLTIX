# Contexto del negocio (Voltix)

- Nicolás es Monotributista, **Categoría H** (recategorizado el 2026-08-18). Antes de esa fecha, categoría desconocida/no registrada acá — no asumir cuál era.
- Los pagos de monotributo (y otros gastos fijos del negocio, no atados a una venta puntual) se registran en `config/gastos-fijos.csv` (columnas: fecha, concepto, detalle, monto). Este archivo está gitignoreado (datos financieros reales) — igual que `config/costos.csv`.
- Al calcular ganancia neta **mensual** (no por venta, porque el monotributo es un costo fijo del negocio, no de una venta individual), restar los gastos fijos de `config/gastos-fijos.csv` correspondientes al mes, además de comisión ML real + envío real + IIBB real + costo de producto.
- Ver el resto de contexto técnico y de negocio (permisos de la app de ML, estructura de reportes, limitaciones conocidas de la API) en `README.md`.
