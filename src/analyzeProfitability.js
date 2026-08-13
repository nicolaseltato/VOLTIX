// Ganancia real por producto = ventas totales reales del producto en el período
//   - costo del producto (COGS)
//   - comisión de Mercado Libre
//   - envío extra a cargo del vendedor (si lo cargaste en config/costos.csv)
//   - inversión en publicidad de ese producto
//
// "Ventas totales reales" viene de la API de Órdenes cuando está disponible —
// todas las ventas pagas del producto en el período, sean o no atribuibles a un
// click de publicidad. Antes solo mirábamos la porción atribuida a ads, así que
// un producto que se vendió de forma orgánica en el período (sin click de ads)
// quedaba con 0 unidades y desaparecía del análisis aunque tuviera ganancia real.
// El gasto en publicidad (adSpend) sigue siendo específico de ads, se descuenta
// igual porque es una inversión real hecha sobre ese producto.
//
// La comisión se obtiene, en orden de preferencia:
//   1. Real, de la API de Órdenes (sale_fee de cada venta paga) — exacta, no estimada.
//   2. Manual, comision_pct de config/costos.csv aplicado sobre el precio promedio
//      REAL de venta del período, no sobre el precio de lista.
//   3. Automática vía el calculador de Mercado Libre (feesByItem), si está disponible.
//
// Si no tenemos el costo del producto, no inventamos un número: el producto queda
// marcado como "sin costo cargado" y se excluye de los totales de ganancia real.

export function analyzeProductProfitability({ ads, costs, feesByItem, ordersByItem }) {
  const rows = ads.map((ad) => {
    const m = ad.metrics ?? {};
    const cost = costs?.get(ad.item_id) ?? null;
    const realOrderData = ordersByItem?.get(ad.item_id);

    const adSpend = m.cost ?? 0;
    const adUnits = m.units_quantity ?? 0;
    const adRevenue = m.total_amount ?? 0;

    // Preferimos venta total real (todas las órdenes pagas del producto en el
    // período) sobre la porción atribuida a publicidad, cuando la tenemos.
    const units = realOrderData?.units ?? adUnits;
    const revenue = realOrderData?.revenueTotal ?? adRevenue;

    let mlFeePerUnit = feesByItem.get(ad.item_id) ?? null;
    let feeSource = mlFeePerUnit != null ? "auto" : null;
    if (cost?.comisionPct != null && units > 0) {
      const avgRealPrice = revenue / units;
      mlFeePerUnit = avgRealPrice * (cost.comisionPct / 100);
      feeSource = "manual";
    }
    if (realOrderData?.saleFeePerUnit != null) {
      mlFeePerUnit = realOrderData.saleFeePerUnit;
      feeSource = "real";
    }
    const hasCost = cost?.cogs != null && mlFeePerUnit != null && units > 0;

    let realProfit = null;
    let realMarginPct = null;
    let grossMarginPct = null; // margen antes de publicidad: lo que hay disponible para pagar ads sin perder plata
    let acosExceedsGrossMargin = false;
    if (hasCost) {
      const cogsTotal = units * cost.cogs;
      const feeTotal = units * mlFeePerUnit;
      const shippingTotal = units * (cost.extraShipping ?? 0);
      const grossProfit = revenue - cogsTotal - feeTotal - shippingTotal;
      realProfit = grossProfit - adSpend;
      realMarginPct = revenue > 0 ? (realProfit / revenue) * 100 : null;
      grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : null;
      // Si el ACOS de la campaña que promociona este producto supera su margen bruto real,
      // esa campaña está quemando plata aunque venda mucho — aunque el producto en su
      // conjunto todavía dé positivo por ventas orgánicas mezcladas en el período.
      acosExceedsGrossMargin = m.acos != null && grossMarginPct != null && m.acos > grossMarginPct;
    }

    return {
      itemId: ad.item_id,
      title: ad.title,
      campaignId: ad.campaign_id,
      units,
      revenue,
      adSpend,
      adUnits,
      adRevenue,
      acos: m.acos ?? null,
      roas: m.roas ?? null,
      cogsPerUnit: cost?.cogs ?? null,
      mlFeePerUnit,
      feeSource,
      realShippingPerUnit: realOrderData?.shippingPerUnit ?? null,
      extraShippingPerUnit: cost?.extraShipping ?? 0,
      hasCost,
      realProfit,
      realMarginPct,
      grossMarginPct,
      acosExceedsGrossMargin,
    };
  });

  const withCost = rows.filter((r) => r.hasCost);
  const missingCost = rows.filter((r) => !r.hasCost && (r.adSpend > 0 || r.units > 0));

  const toScale = [...withCost].filter((r) => r.realProfit > 0).sort((a, b) => b.realProfit - a.realProfit);
  const losingMoney = [...withCost].filter((r) => r.realProfit <= 0).sort((a, b) => a.realProfit - b.realProfit);
  const burningAds = [...withCost].filter((r) => r.acosExceedsGrossMargin).sort((a, b) => b.adSpend - a.adSpend);

  const totalRealProfit = withCost.reduce((acc, r) => acc + r.realProfit, 0);
  const totalRevenueWithCost = withCost.reduce((acc, r) => acc + r.revenue, 0);

  return {
    rows: [...rows].sort((a, b) => (b.realProfit ?? -Infinity) - (a.realProfit ?? -Infinity)),
    withCost,
    missingCost,
    toScale,
    losingMoney,
    burningAds,
    totalRealProfit,
    totalRevenueWithCost,
  };
}
