// Ganancia real por producto = ventas generadas por publicidad
//   - costo del producto (COGS)
//   - comisión de Mercado Libre (auto-calculada por sale_fee_amount, o manual vía comision_pct)
//   - envío extra a cargo del vendedor (si lo cargaste en config/costos.csv)
//   - inversión en publicidad de ese producto
//
// La comisión manual (comision_pct) se aplica sobre el precio promedio REAL de venta
// del período (adRevenue / units), no sobre el precio de lista de la publicación —
// así un producto con descuento activo no infla la comisión estimada.
//
// Si no tenemos el costo del producto, no inventamos un número: el producto queda
// marcado como "sin costo cargado" y se excluye de los totales de ganancia real.

export function analyzeProductProfitability({ ads, costs, feesByItem }) {
  const rows = ads.map((ad) => {
    const m = ad.metrics ?? {};
    const cost = costs?.get(ad.item_id) ?? null;

    const units = m.units_quantity ?? 0;
    const adSpend = m.cost ?? 0;
    const adRevenue = m.total_amount ?? 0;

    let mlFeePerUnit = feesByItem.get(ad.item_id) ?? null;
    if (cost?.comisionPct != null && units > 0) {
      const avgRealPrice = adRevenue / units;
      mlFeePerUnit = avgRealPrice * (cost.comisionPct / 100);
    }
    const hasCost = cost?.cogs != null && mlFeePerUnit != null;

    let realProfit = null;
    let realMarginPct = null;
    if (hasCost) {
      const cogsTotal = units * cost.cogs;
      const feeTotal = units * mlFeePerUnit;
      const shippingTotal = units * (cost.extraShipping ?? 0);
      realProfit = adRevenue - cogsTotal - feeTotal - shippingTotal - adSpend;
      realMarginPct = adRevenue > 0 ? (realProfit / adRevenue) * 100 : null;
    }

    return {
      itemId: ad.item_id,
      title: ad.title,
      campaignId: ad.campaign_id,
      units,
      adSpend,
      adRevenue,
      acos: m.acos ?? null,
      roas: m.roas ?? null,
      cogsPerUnit: cost?.cogs ?? null,
      mlFeePerUnit,
      extraShippingPerUnit: cost?.extraShipping ?? 0,
      hasCost,
      realProfit,
      realMarginPct,
    };
  });

  const withCost = rows.filter((r) => r.hasCost && r.units > 0);
  const missingCost = rows.filter((r) => !r.hasCost && (r.adSpend > 0 || r.units > 0));

  const toScale = [...withCost].filter((r) => r.realProfit > 0).sort((a, b) => b.realProfit - a.realProfit);
  const losingMoney = [...withCost].filter((r) => r.realProfit <= 0).sort((a, b) => a.realProfit - b.realProfit);

  const totalRealProfit = withCost.reduce((acc, r) => acc + r.realProfit, 0);
  const totalAdRevenueWithCost = withCost.reduce((acc, r) => acc + r.adRevenue, 0);

  return {
    rows: [...rows].sort((a, b) => (b.realProfit ?? -Infinity) - (a.realProfit ?? -Infinity)),
    withCost,
    missingCost,
    toScale,
    losingMoney,
    totalRealProfit,
    totalAdRevenueWithCost,
  };
}
