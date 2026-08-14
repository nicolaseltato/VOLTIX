// Agrupa órdenes reales (pagadas) por producto para sacar la comisión de venta
// real (sale_fee) y el costo de envío real de cada ítem — dato exacto de cada
// venta, no una estimación ni un promedio.
export function aggregateOrdersByItem(orders) {
  const byItem = new Map();

  for (const order of orders) {
    const items = order.order_items ?? [];
    const orderRevenue = items.reduce((acc, oi) => acc + (oi.unit_price ?? 0) * (oi.quantity ?? 0), 0);
    const shippingCost = order.shipping_cost ?? 0;

    for (const oi of items) {
      const itemId = oi.item?.id;
      if (!itemId) continue;
      const lineRevenue = (oi.unit_price ?? 0) * (oi.quantity ?? 0);
      const shippingShare = orderRevenue > 0 ? shippingCost * (lineRevenue / orderRevenue) : 0;

      if (!byItem.has(itemId)) {
        byItem.set(itemId, {
          itemId,
          title: oi.item?.title,
          units: 0,
          saleFeeTotal: 0,
          revenueTotal: 0,
          shippingTotal: 0,
          orderCount: 0,
        });
      }
      const entry = byItem.get(itemId);
      // sale_fee viene POR UNIDAD, no total de la línea — confirmado con dos
      // órdenes reales del mismo ítem y precio, una con quantity=1 y otra con
      // quantity=2, ambas con el mismo valor de sale_fee. Hay que multiplicar
      // por la cantidad o se subestima la comisión real en cualquier venta con
      // más de una unidad por orden.
      entry.units += oi.quantity ?? 0;
      entry.saleFeeTotal += (oi.sale_fee ?? 0) * (oi.quantity ?? 1);
      entry.revenueTotal += lineRevenue;
      entry.shippingTotal += shippingShare;
      entry.orderCount += 1;
    }
  }

  // Promedios por unidad, listos para usar en el cálculo de ganancia real.
  for (const entry of byItem.values()) {
    entry.saleFeePerUnit = entry.units > 0 ? entry.saleFeeTotal / entry.units : null;
    entry.shippingPerUnit = entry.units > 0 ? entry.shippingTotal / entry.units : null;
  }

  return byItem;
}
