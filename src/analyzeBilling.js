// Traduce el resumen de facturación (cargos/bonificaciones reales) y las
// percepciones (IVA + Ingresos Brutos por jurisdicción) de un período cerrado
// a números listos para el informe. Todo esto es lo que Mercado Libre cobró
// de verdad, no una estimación.
const IMPUESTOS_GROUP = "impuestos";
const VENTA_GROUP = "venta";
const ENVIO_GROUP = "env";
const IIBB_RE = /iibb|ingresos brutos/i;

function sumBy(items, predicate) {
  return items.filter(predicate).reduce((acc, item) => acc + (item.amount ?? 0), 0);
}

export function analyzeBilling({ summary, perceptions }) {
  const charges = summary.bill_includes?.charges ?? [];
  const bonuses = summary.bill_includes?.bonuses ?? [];

  const salesCommission = sumBy(charges, (c) => c.group_description?.toLowerCase().includes(VENTA_GROUP));
  const adsCharge = sumBy(charges, (c) => c.type === "PADS");
  const shippingCharges = sumBy(charges, (c) => c.group_description?.toLowerCase().includes(ENVIO_GROUP));
  const taxCharges = charges.filter((c) => c.group_description?.toLowerCase().includes(IMPUESTOS_GROUP));
  const totalTax = taxCharges.reduce((acc, c) => acc + (c.amount ?? 0), 0);
  const totalBonuses = bonuses.reduce((acc, b) => acc + (b.amount ?? 0), 0);

  const iibb = perceptions
    .filter((p) => IIBB_RE.test(p.regimen_tax_type_description ?? "") || IIBB_RE.test(p.tax_type_description ?? ""))
    .map((p) => ({
      concept: p.tax_type_description,
      regimen: p.regimen_tax_type_description,
      amount: p.amount,
      aliquot: p.aliquot,
    }))
    .sort((a, b) => b.amount - a.amount);
  const totalIibb = iibb.reduce((acc, r) => acc + r.amount, 0);

  const otherPerceptions = perceptions
    .filter((p) => !IIBB_RE.test(p.regimen_tax_type_description ?? "") && !IIBB_RE.test(p.tax_type_description ?? ""))
    .map((p) => ({ concept: p.tax_type_description, amount: p.amount, aliquot: p.aliquot }))
    .sort((a, b) => b.amount - a.amount);
  const totalOtherPerceptions = otherPerceptions.reduce((acc, r) => acc + r.amount, 0);

  return {
    period: summary.period,
    totalAmount: summary.bill_includes?.total_amount ?? 0,
    totalPerception: summary.bill_includes?.total_perception ?? 0,
    salesCommission,
    adsCharge,
    shippingCharges,
    totalTax,
    totalBonuses,
    iibb,
    totalIibb,
    otherPerceptions,
    totalOtherPerceptions,
  };
}
