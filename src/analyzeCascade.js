// Arma la cascada completa de rentabilidad (Ingresos brutos → Ganancia Neta Real)
// combinando lo que ya calculamos por producto (revenue, comisión ML, envío extra,
// COGS, inversión en ads) con datos de cuenta (IIBB real del último período de
// facturación cerrado) y los gastos fijos que declara el usuario (Monotributo, otros).
//
// Mercado Libre no discrimina "costo fijo por venta" ni "costo por ofrecer cuotas"
// como líneas separadas en las APIs que usa este agente (quedan bundleados dentro de
// la comisión de venta), y este agente no trae anulaciones/reembolsos todavía (la API
// de Órdenes se consulta filtrada a status=paid). En vez de estimarlos, estas líneas
// se marcan explícitamente como no disponibles.
export function buildProfitabilityCascade({ productAnalysis, billingAnalysis, gastosFijos }) {
  if (!productAnalysis || productAnalysis.withCost.length === 0) return null;

  const { withCost } = productAnalysis;

  const ingresosBrutos = withCost.reduce((acc, r) => acc + r.revenue, 0);
  const cargoPorVenta = withCost.reduce((acc, r) => acc + r.mlFeePerUnit * r.units, 0);
  const envioNoCubierto = withCost.reduce((acc, r) => acc + r.extraShippingPerUnit * r.units, 0);
  const cogsTotal = withCost.reduce((acc, r) => acc + r.cogsPerUnit * r.units, 0);
  const adSpendTotal = withCost.reduce((acc, r) => acc + r.adSpend, 0);

  const iibbRetenido = billingAnalysis?.totalIibb ?? null;
  const iibbEsReal = billingAnalysis != null;

  const cuotaMonotributo = gastosFijos?.cuotaMonotributo ?? null;
  const otrosGastos = gastosFijos?.otrosGastos ?? [];
  const otrosGastosTotal = otrosGastos.reduce((acc, g) => acc + (g.monto ?? 0), 0);

  // Líneas del prompt de referencia que este agente todavía no puede traer solo:
  // se dejan afuera de la resta (no se estiman) y se avisa explícitamente.
  const costoFijoPorVentaDisponible = false;
  const costoPorCuotasDisponible = false;
  const anulacionesDisponible = false;

  const ingresoNetoMl = ingresosBrutos - cargoPorVenta - envioNoCubierto - (iibbRetenido ?? 0);
  const margenContribucion = ingresoNetoMl - cogsTotal;
  const gananciaNetaReal = margenContribucion - adSpendTotal - (cuotaMonotributo ?? 0) - otrosGastosTotal;
  const gananciaNetaRealPct = ingresosBrutos > 0 ? (gananciaNetaReal / ingresosBrutos) * 100 : null;

  const missingInputs = [];
  if (!iibbEsReal) missingInputs.push("IIBB retenido (falta el permiso Facturación / período cerrado)");
  if (cuotaMonotributo == null) missingInputs.push("Cuota Monotributo (completá config/gastos-fijos.json)");
  if (!costoFijoPorVentaDisponible) missingInputs.push("Costo fijo por venta (ML no lo discrimina en esta integración)");
  if (!costoPorCuotasDisponible) missingInputs.push("Costo por ofrecer cuotas (ML no lo discrimina en esta integración)");
  if (!anulacionesDisponible) missingInputs.push("Anulaciones / reembolsos (no se traen todavía)");

  return {
    ingresosBrutos,
    cargoPorVenta,
    envioNoCubierto,
    iibbRetenido,
    iibbEsReal,
    ingresoNetoMl,
    cogsTotal,
    margenContribucion,
    adSpendTotal,
    cuotaMonotributo,
    otrosGastos,
    otrosGastosTotal,
    gananciaNetaReal,
    gananciaNetaRealPct,
    isComplete: missingInputs.length === 0,
    missingInputs,
  };
}
