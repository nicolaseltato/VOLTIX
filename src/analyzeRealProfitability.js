// Cascada de rentabilidad real del negocio, período completo (no solo por producto).
//
// Se arma en dos tramos porque las fuentes de datos tienen distinto alcance:
//
// Tramo 1 — "todo el negocio": usa Órdenes reales (ingresos brutos, comisión ML,
// envío no cubierto) y Facturación/IIBB. Cubre el 100% de lo que vendiste en el
// período, sea o no publicitado.
//
// Tramo 2 — "productos con costo cargado": la ganancia de contribución (COGS +
// comisión + envío extra + ads) solo se puede calcular para los productos que
// tienen `costo_producto` en config/costos.csv Y que corrieron publicidad en el
// período (son los que trae analyzeProductProfitability). Un producto vendido de
// forma 100% orgánica que nunca corrió ads no aparece ahí, así que este tramo
// es una porción del negocio, no el total — se expone `coveragePct` para que el
// informe lo aclare en vez de mostrar una "ganancia neta real" que parezca total
// sin serlo.
//
// Mercado Libre no discrimina "costo fijo por venta" y "costo por ofrecer cuotas"
// del cargo de venta a nivel de cada orden en su API pública (sí lo hace, con otro
// desglose, en el reporte de ventas que se descarga manualmente desde el panel).
// Por eso "Cargo por venta" se muestra como un solo monto real, con esa aclaración.

function sum(map, key) {
  let total = 0;
  for (const entry of map.values()) total += entry[key] ?? 0;
  return total;
}

export function analyzeRealProfitability({ ordersByItem, productAnalysis, adsSpendTotal, billingAnalysis, gastos, dateFrom, dateTo }) {
  const hasOrders = ordersByItem != null && ordersByItem.size > 0;

  const ingresosBrutos = hasOrders ? sum(ordersByItem, "revenueTotal") : null;
  const cargoPorVenta = hasOrders ? sum(ordersByItem, "saleFeeTotal") : null;
  const envioNoCubierto = hasOrders ? sum(ordersByItem, "shippingTotal") : null;

  let iibb;
  if (billingAnalysis) {
    iibb = {
      amount: billingAnalysis.totalIibb,
      source: "real",
      note: `Del período de facturación cerrado ${billingAnalysis.period.date_from} a ${billingAnalysis.period.date_to} — puede no coincidir exactamente con el rango del informe (${dateFrom} a ${dateTo}).`,
    };
  } else if (ingresosBrutos != null) {
    const rate = gastos?.iibb_tasa_estimada_pct ?? 3.5;
    iibb = {
      amount: ingresosBrutos * (rate / 100),
      source: "estimado",
      note: `No hay período de facturación cerrado disponible: estimado como ${rate}% sobre ingresos brutos del período. Es una referencia, no el monto real retenido.`,
    };
  } else {
    iibb = { amount: null, source: null, note: "No se pudo calcular: falta el dato de ingresos brutos." };
  }

  const anulaciones = {
    amount: gastos?.anulaciones_periodo ?? null,
    source: gastos?.anulaciones_periodo != null ? "declarado" : null,
    note: "Mercado Libre no expone el total de anulaciones/reembolsos del período por API pública. Completá `anulaciones_periodo` en config/gastos.json si lo sabés.",
  };

  const ingresoNetoMl =
    ingresosBrutos != null && cargoPorVenta != null && envioNoCubierto != null && iibb.amount != null
      ? ingresosBrutos - cargoPorVenta - envioNoCubierto - iibb.amount - (anulaciones.amount ?? 0)
      : null;

  // Tramo 2: reutiliza el cálculo ya validado por producto (analyzeProductProfitability),
  // no recalcula nada — así no hay riesgo de descontar la inversión en ads dos veces.
  const revenueWithCost = productAnalysis?.totalRevenueWithCost ?? null;
  const cogsTotal =
    productAnalysis?.withCost?.reduce((acc, r) => acc + (r.units ?? 0) * (r.cogsPerUnit ?? 0), 0) ?? null;
  const feeTotal =
    productAnalysis?.withCost?.reduce((acc, r) => acc + (r.units ?? 0) * (r.mlFeePerUnit ?? 0), 0) ?? null;
  const extraShippingTotal =
    productAnalysis?.withCost?.reduce((acc, r) => acc + (r.units ?? 0) * (r.extraShippingPerUnit ?? 0), 0) ?? null;
  const adSpendCosted = productAnalysis?.withCost?.reduce((acc, r) => acc + (r.adSpend ?? 0), 0) ?? null;
  const contributionMargin = productAnalysis ? productAnalysis.totalRealProfit : null;

  const coveragePct = ingresosBrutos != null && revenueWithCost != null && ingresosBrutos > 0 ? (revenueWithCost / ingresosBrutos) * 100 : null;
  const adSpendUncosted = adsSpendTotal != null && adSpendCosted != null ? adsSpendTotal - adSpendCosted : null;

  const monotributo = gastos?.monotributo_mensual ?? 0;
  const otrosGastos = gastos?.otros_gastos ?? [];
  const otrosGastosTotal = otrosGastos.reduce((acc, g) => acc + (g.monto_periodo ?? 0), 0);

  const gananciaNetaReal = contributionMargin != null ? contributionMargin - monotributo - otrosGastosTotal : null;
  const margenNetoPct = gananciaNetaReal != null && revenueWithCost > 0 ? (gananciaNetaReal / revenueWithCost) * 100 : null;

  return {
    negocio: {
      ingresosBrutos,
      cargoPorVenta,
      envioNoCubierto,
      iibb,
      anulaciones,
      ingresoNetoMl,
      hasOrders,
    },
    productosConCosto: {
      revenueWithCost,
      cogsTotal,
      feeTotal,
      extraShippingTotal,
      adSpendCosted,
      contributionMargin,
      coveragePct,
    },
    ads: {
      total: adsSpendTotal,
      costed: adSpendCosted,
      uncosted: adSpendUncosted,
    },
    gastosDeclarados: {
      monotributo,
      otrosGastos,
      otrosGastosTotal,
      configured: gastos != null,
    },
    gananciaNetaReal,
    margenNetoPct,
  };
}

// Mercado Libre calcula ACOS/ROAS sobre ingresos de publicidad, no sobre ganancia.
// Una campaña puede "vender mucho" y perder plata igual si el ACOS supera el margen
// real del producto que promociona. Esto es distinto del ACOS de equilibrio de
// analyze.js (que usa el margen declarado en config/margins.json, a nivel campaña):
// acá se usa el margen REAL calculado en analyzeProductProfitability (COGS + comisión
// + envío real), producto por producto, cuando ese dato existe.
//
// Los ítems de ads guardan `campaignId` como una lista separada por ", " (un mismo
// producto puede correr en más de una campaña), así que se invierte esa relación acá.
export function crossCheckCampaignAcosVsMargin({ campaignAnalyses, productAnalysis }) {
  if (!productAnalysis) return [];

  const productsByCampaign = new Map();
  for (const row of productAnalysis.withCost) {
    if (row.realMarginPct == null) continue;
    for (const campaignId of (row.campaignId ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!productsByCampaign.has(campaignId)) productsByCampaign.set(campaignId, []);
      productsByCampaign.get(campaignId).push(row);
    }
  }

  const alerts = [];
  for (const { campaign, metrics } of campaignAnalyses) {
    if (campaign.status === "paused") continue;
    const products = productsByCampaign.get(String(campaign.id));
    if (!products || products.length === 0) continue;
    const totalRevenue = products.reduce((acc, r) => acc + r.revenue, 0);
    if (totalRevenue <= 0) continue;
    const weightedMargin = products.reduce((acc, r) => acc + r.realMarginPct * r.revenue, 0) / totalRevenue;
    const acos = metrics.acos ?? 0;

    if (acos > weightedMargin) {
      alerts.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        acos,
        realMarginPct: weightedMargin,
        products: products.map((r) => r.title),
      });
    }
  }

  return alerts.sort((a, b) => (b.acos - b.realMarginPct) - (a.acos - a.realMarginPct));
}
