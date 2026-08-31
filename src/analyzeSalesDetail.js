// Arma una fila por cada línea de producto dentro de cada orden paga, con
// todos los costos reales de esa venta puntual: comisión de Mercado Libre,
// envío (si aplica, y cuánto — o "no disponible" si es Full, ver mlShipments.js),
// percepción de Ingresos Brutos (si el comprador era de una jurisdicción que la
// aplica), y ganancia neta si hay costo cargado Y el envío está disponible.
export function buildSalesLedger({ orders, shipmentsByOrderId, perceptionsBySaleNumber, costs }) {
  const rows = [];

  for (const order of orders) {
    const items = order.order_items ?? [];
    const orderRevenue = items.reduce((acc, oi) => acc + (oi.unit_price ?? 0) * (oi.quantity ?? 0), 0);
    const shipment = shipmentsByOrderId.get(String(order.id));
    const shippingCostAvailable = shipment?.costAvailable ?? false;
    const shippingCost = shippingCostAvailable ? (shipment.cost ?? 0) : 0;
    const iibbForOrder = perceptionsBySaleNumber.get(String(order.id)) ?? [];
    const iibbTotal = iibbForOrder.reduce((acc, p) => acc + (p.tax_amount ?? 0), 0);
    const iibbJurisdictions = [...new Set(iibbForOrder.map((p) => p.tax_type_description ?? p.tax_type))];

    for (const oi of items) {
      const itemId = oi.item?.id;
      const quantity = oi.quantity ?? 0;
      const lineRevenue = (oi.unit_price ?? 0) * quantity;
      const revenueShare = orderRevenue > 0 ? lineRevenue / orderRevenue : 1 / items.length;

      const commission = (oi.sale_fee ?? 0) * quantity;
      const shippingForLine = shippingCostAvailable ? shippingCost * revenueShare : null;
      const iibbForLine = iibbTotal * revenueShare;

      const cost = costs?.get(itemId);
      const cogsTotal = cost?.cogs != null ? cost.cogs * quantity : null;
      const netProfit =
        cogsTotal != null && shippingCostAvailable
          ? lineRevenue - cogsTotal - commission - shippingForLine - iibbForLine
          : null;

      rows.push({
        orderId: order.id,
        date: order.date_created,
        itemId,
        title: oi.item?.title,
        quantity,
        unitPrice: oi.unit_price ?? 0,
        revenue: lineRevenue,
        commission,
        hasShipping: shipment?.hasShipping ?? null,
        shippingCostAvailable,
        shippingCost: shippingForLine,
        logisticType: shipment?.logisticType ?? null,
        shippingDiscountRate: shipment?.discountRate ?? null,
        shippingDiscountType: shipment?.discountType ?? null,
        iibbAmount: iibbForLine,
        iibbJurisdictions: iibbJurisdictions.join(" / "),
        cogsPerUnit: cost?.cogs ?? null,
        netProfit,
      });
    }
  }

  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
}
