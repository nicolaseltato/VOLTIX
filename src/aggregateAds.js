// Un mismo producto (item_id) puede estar corriendo en más de una campaña a la vez.
// Para el análisis por producto conviene sumar esas filas en una sola por SKU,
// en vez de mostrarlo duplicado con números parciales en cada fila.
const STATUS_PRIORITY = { active: 0, paused: 1, hold: 2, idle: 3, delegated: 4, revoked: 5 };

export function aggregateAdsByItem(ads) {
  const byItem = new Map();

  for (const ad of ads) {
    if (!byItem.has(ad.item_id)) {
      byItem.set(ad.item_id, {
        item_id: ad.item_id,
        title: ad.title,
        price: ad.price,
        status: ad.status,
        campaignIds: new Set(),
        clicks: 0,
        prints: 0,
        cost: 0,
        total_amount: 0,
        units_quantity: 0,
      });
    }
    const entry = byItem.get(ad.item_id);
    entry.campaignIds.add(ad.campaign_id);
    const m = ad.metrics ?? {};
    entry.clicks += m.clicks ?? 0;
    entry.prints += m.prints ?? 0;
    entry.cost += m.cost ?? 0;
    entry.total_amount += m.total_amount ?? 0;
    entry.units_quantity += m.units_quantity ?? 0;
    if ((STATUS_PRIORITY[ad.status] ?? 99) < (STATUS_PRIORITY[entry.status] ?? 99)) {
      entry.status = ad.status;
    }
  }

  return [...byItem.values()].map((entry) => ({
    item_id: entry.item_id,
    title: entry.title,
    price: entry.price,
    status: entry.status,
    campaign_id: [...entry.campaignIds].join(", "),
    metrics: {
      clicks: entry.clicks,
      prints: entry.prints,
      cost: entry.cost,
      total_amount: entry.total_amount,
      units_quantity: entry.units_quantity,
      acos: entry.total_amount > 0 ? (entry.cost / entry.total_amount) * 100 : 0,
      roas: entry.cost > 0 ? entry.total_amount / entry.cost : 0,
    },
  }));
}
