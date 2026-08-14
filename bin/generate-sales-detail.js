#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, reportsDir } from "../src/config.js";
import { MlOrdersClient } from "../src/mlOrders.js";
import { MlShipmentsClient } from "../src/mlShipments.js";
import { MlBillingClient } from "../src/mlBilling.js";
import { loadCosts } from "../src/costs.js";
import { loadStoredCredentials } from "../src/oauth.js";
import { buildSalesLedger } from "../src/analyzeSalesDetail.js";

function parseArgs(argv) {
  const args = { days: 14 };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "days") args.days = Number(value);
    if (key === "from") args.from = value;
    if (key === "to") args.to = value;
  }
  return args;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function resolveDateRange({ days, from, to }) {
  if (from && to) return { dateFrom: from, dateTo: to };
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);
  return { dateFrom: isoDate(dateFrom), dateTo: isoDate(dateTo) };
}

function escapeCsvCell(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function fmt(n) {
  return n == null ? "" : Math.round(n * 100) / 100;
}

async function main() {
  const config = loadConfig();
  const { dateFrom, dateTo } = resolveDateRange(parseArgs(process.argv.slice(2)));
  const credentials = loadStoredCredentials();

  console.log(`Descargando órdenes pagas del ${dateFrom} al ${dateTo}...`);
  const ordersClient = new MlOrdersClient(config);
  const orders = await ordersClient.getAllOrders({ sellerId: credentials.user_id, dateFrom, dateTo });
  console.log(`${orders.length} órdenes encontradas.`);

  console.log("Consultando costo de envío real de cada orden (puede tardar unos minutos)...");
  const shipmentsClient = new MlShipmentsClient(config);
  const shipmentsByOrderId = new Map();
  let shipmentFailures = 0;
  for (const order of orders) {
    if (!order.shipping?.id) continue;
    try {
      const shipment = await shipmentsClient.getShipmentForOrder(order.id);
      shipmentsByOrderId.set(String(order.id), shipment);
    } catch {
      shipmentFailures++;
    }
  }
  console.log(`Envío consultado para ${shipmentsByOrderId.size} órdenes${shipmentFailures ? ` (${shipmentFailures} fallaron)` : ""}.`);

  console.log("Descargando percepciones de IIBB venta por venta (períodos de facturación cerrados que cruzan el rango; esto respeta un límite de 5 requests/minuto de Mercado Libre, puede tardar varios minutos)...");
  const billingClient = new MlBillingClient(config);
  const periods = await billingClient.getPeriods({ limit: 12 });
  const closedOverlapping = periods.filter(
    (p) => p.period_status === "CLOSED" && p.period.date_from <= dateTo && p.period.date_to >= dateFrom
  );
  const openOverlapping = periods.filter(
    (p) => p.period_status !== "CLOSED" && p.period.date_from <= dateTo && p.period.date_to >= dateFrom
  );
  if (openOverlapping.length > 0) {
    console.warn(
      `Aviso: el rango pedido incluye días del período de facturación todavía ABIERTO (${openOverlapping.map((p) => `${p.period.date_from} a ${p.period.date_to}`).join(", ")}). Mercado Libre no expone el detalle de percepciones venta por venta hasta que el período cierra, así que esas ventas más recientes van a figurar sin dato de IIBB en la planilla (el resto de los costos sí están completos).`
    );
  }
  const perceptionsBySaleNumber = new Map();
  for (const period of closedOverlapping) {
    try {
      const details = await billingClient.getAllPerceptionDetailsForPeriod({ key: period.key });
      for (const d of details) {
        if (!d.sale_number) continue;
        const key = String(d.sale_number);
        if (!perceptionsBySaleNumber.has(key)) perceptionsBySaleNumber.set(key, []);
        perceptionsBySaleNumber.get(key).push(d);
      }
      console.log(`  Período ${period.key}: ${details.length} percepciones individuales.`);
    } catch (err) {
      console.warn(`  Aviso: no se pudo traer percepciones del período ${period.key}: ${err.message}`);
    }
  }

  const costs = loadCosts();
  const ledger = buildSalesLedger({ orders, shipmentsByOrderId, perceptionsBySaleNumber, costs });

  const header = [
    "fecha", "orden_id", "item_id", "producto", "cantidad", "precio_unitario", "venta_total",
    "comision_ml", "tiene_envio", "costo_envio", "logistic_type", "iibb_retenido", "iibb_jurisdiccion",
    "costo_producto_unit", "ganancia_neta",
  ].join(",");

  const rows = ledger.map((r) =>
    [
      r.date, r.orderId, r.itemId, escapeCsvCell(r.title), r.quantity, fmt(r.unitPrice), fmt(r.revenue),
      fmt(r.commission), r.hasShipping == null ? "" : (r.hasShipping ? "si" : "no"), fmt(r.shippingCost),
      r.logisticType ?? "", fmt(r.iibbAmount), escapeCsvCell(r.iibbJurisdictions),
      fmt(r.cogsPerUnit), fmt(r.netProfit),
    ].join(",")
  );

  const csv = [header, ...rows].join("\n") + "\n";
  const fileName = `ventas-detalle-${dateFrom}_a_${dateTo}.csv`;
  const filePath = path.join(reportsDir, fileName);
  writeFileSync(filePath, csv, "utf8");

  const totalRevenue = ledger.reduce((a, r) => a + r.revenue, 0);
  const totalCommission = ledger.reduce((a, r) => a + r.commission, 0);
  const totalShipping = ledger.reduce((a, r) => a + r.shippingCost, 0);
  const totalIibb = ledger.reduce((a, r) => a + r.iibbAmount, 0);
  const withProfit = ledger.filter((r) => r.netProfit != null);
  const totalNetProfit = withProfit.reduce((a, r) => a + r.netProfit, 0);

  console.log(`\nPlanilla generada en ${filePath} (${ledger.length} filas)\n`);
  console.log(`Venta total: $${Math.round(totalRevenue).toLocaleString("es-AR")}`);
  console.log(`Comisión ML total: $${Math.round(totalCommission).toLocaleString("es-AR")}`);
  console.log(`Envío total: $${Math.round(totalShipping).toLocaleString("es-AR")}`);
  console.log(`IIBB retenido total: $${Math.round(totalIibb).toLocaleString("es-AR")}`);
  console.log(`Ganancia neta (${withProfit.length}/${ledger.length} filas con costo cargado): $${Math.round(totalNetProfit).toLocaleString("es-AR")}`);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
