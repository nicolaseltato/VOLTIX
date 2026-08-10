// Mercado Libre pasa un anuncio a status "hold" automáticamente cuando el ítem
// se queda sin stock (o se pausa a nivel marketplace) — no es una decisión del
// vendedor ni de la campaña. Un producto en hold con inversión/ventas en el
// período ya demostró que vende con publicidad; simplemente no se puede reponer
// el gasto porque no hay nada para vender. Priorizar la reposición de stock ahí
// suele valer más que cualquier ajuste de presupuesto o puja.
//
// Trabaja sobre los anuncios "crudos" (uno por producto x campaña), no sobre la
// versión agregada por producto: un mismo ítem puede estar "hold" en una campaña
// y "paused" en otra (por ejemplo si esa campaña la pausaste vos), y necesitamos
// detectar el stock aunque no sea el status dominante de ese producto.
export function analyzeStockGaps(ads) {
  const byItem = new Map();

  for (const ad of ads) {
    if (!byItem.has(ad.item_id)) {
      byItem.set(ad.item_id, {
        itemId: ad.item_id,
        title: ad.title,
        anyHold: false,
        adSpend: 0,
        adRevenue: 0,
        units: 0,
      });
    }
    const entry = byItem.get(ad.item_id);
    if (ad.status === "hold") entry.anyHold = true;
    const m = ad.metrics ?? {};
    entry.adSpend += m.cost ?? 0;
    entry.adRevenue += m.total_amount ?? 0;
    entry.units += m.units_quantity ?? 0;
  }

  const onHold = [...byItem.values()]
    .filter((e) => e.anyHold)
    .sort((a, b) => b.adRevenue - a.adRevenue || b.units - a.units);

  const proven = onHold.filter((r) => r.units > 0 || r.adRevenue > 0);
  const totalRevenueAtRisk = proven.reduce((acc, r) => acc + r.adRevenue, 0);

  return { onHold, proven, totalRevenueAtRisk, totalCount: onHold.length };
}
