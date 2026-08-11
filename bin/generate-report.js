#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, marginsPath, reportsDir } from "../src/config.js";
import { MercadoAdsClient } from "../src/mercadoAdsClient.js";
import { MlFeesClient } from "../src/mlFees.js";
import { MlBillingClient } from "../src/mlBilling.js";
import { MlDiscountsClient } from "../src/mlDiscounts.js";
import { loadCosts, generateCostsTemplate, costsPath } from "../src/costs.js";
import { analyzeCampaigns } from "../src/analyze.js";
import { analyzeProductProfitability } from "../src/analyzeProfitability.js";
import { analyzeStockGaps } from "../src/analyzeStock.js";
import { analyzeBilling } from "../src/analyzeBilling.js";
import { aggregateAdsByItem } from "../src/aggregateAds.js";
import { renderReport } from "../src/report.js";

function parseArgs(argv) {
  const args = { days: 30 };
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

function loadMarginsConfig() {
  if (!existsSync(marginsPath)) return null;
  return JSON.parse(readFileSync(marginsPath, "utf8"));
}

// Trae, para cada producto con costo cargado, la comisión real de Mercado Libre.
// Si el vendedor cargó "comision_pct" a mano en costos.csv usamos ese dato (más
// confiable, y evita depender del calculador público de ML que en algunos entornos
// de red está bloqueado); si no, intentamos calcularla automáticamente.
async function fetchFeesForCostedItems({ feesClient, siteId, ads, costs }) {
  const feesByItem = new Map();
  if (!costs) return feesByItem;
  const itemsNeedingAutoFee = ads.filter(
    (ad) => costs.get(ad.item_id)?.cogs != null && costs.get(ad.item_id)?.comisionPct == null
  );
  let apiFailures = 0;
  for (const ad of itemsNeedingAutoFee) {
    try {
      const fee = await feesClient.getSaleFeeForItem(ad.item_id, siteId);
      feesByItem.set(ad.item_id, fee);
    } catch {
      apiFailures++;
    }
  }
  if (apiFailures > 0) {
    console.warn(
      `Aviso: no pude calcular la comisión automática para ${apiFailures} producto(s) (el calculador de Mercado Libre no responde desde este entorno de red). Agregá el % de comisión en la columna "comision_pct" de config/costos.csv para esos productos — lo encontrás en tu panel de Mercado Libre, en "Costos por vender".`
    );
  }
  return feesByItem;
}

async function main() {
  const config = loadConfig();
  const { dateFrom, dateTo } = resolveDateRange(parseArgs(process.argv.slice(2)));
  const client = new MercadoAdsClient(config);
  const feesClient = new MlFeesClient(config);
  const discountsClient = new MlDiscountsClient(config);

  console.log(`Buscando anunciantes (product_id=${config.productId})...`);
  const advertisers = await client.getAdvertisers();
  const advertiser = advertisers.find((a) => a.site_id === config.siteId) ?? advertisers[0];
  if (!advertiser) {
    throw new Error(
      "No se encontró ningún anunciante habilitado. Verificá que la cuenta tenga Mercado Ads activo (Mercado Libre > Mi perfil > Publicidad)."
    );
  }
  console.log(`Anunciante: ${advertiser.account_name} (advertiser_id=${advertiser.advertiser_id}, site=${advertiser.site_id})`);

  console.log(`Descargando campañas y métricas del ${dateFrom} al ${dateTo}...`);
  const campaigns = await client.getAllCampaigns({
    advertiserId: advertiser.advertiser_id,
    siteId: advertiser.site_id,
    dateFrom,
    dateTo,
  });
  console.log(`${campaigns.length} campañas encontradas.`);

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  console.log(`Consultando detalle (impression share) de ${activeCampaigns.length} campañas activas...`);
  const details = [];
  for (const campaign of activeCampaigns) {
    try {
      const detail = await client.getCampaignDetail({
        siteId: advertiser.site_id,
        campaignId: campaign.id,
        dateFrom,
        dateTo,
      });
      details.push(detail);
    } catch (err) {
      console.warn(`  Aviso: no se pudo obtener detalle de la campaña ${campaign.id}: ${err.message}`);
    }
  }

  console.log("Descargando métricas por producto (para calcular ganancia real)...");
  const ads = await client.getAllAds({
    advertiserId: advertiser.advertiser_id,
    siteId: advertiser.site_id,
    dateFrom,
    dateTo,
  });
  console.log(`${ads.length} anuncios encontrados.`);
  const items = aggregateAdsByItem(ads);
  console.log(`${items.length} productos únicos (algunos corren en más de una campaña).`);

  const marginsConfig = loadMarginsConfig();
  const analysis = analyzeCampaigns({ campaigns, details, marginsConfig });
  const stockAnalysis = analyzeStockGaps(ads);
  if (stockAnalysis.proven.length > 0) {
    console.log(
      `Aviso: ${stockAnalysis.proven.length} productos con ventas recientes están pausados por falta de stock (status "hold").`
    );
  }

  let productAnalysis = null;
  const costs = loadCosts();
  if (!costs) {
    if (items.length > 0) {
      console.log("Consultando precio real vigente de cada producto (con descuentos activos si tenés)...");
      const { count, lookupFailures } = await generateCostsTemplate(items, discountsClient);
      console.log(
        `\nGeneré ${costsPath} con ${count} productos reales de tu cuenta (precio con descuento incluido, si tenías uno activo). Completá la columna "costo_producto" (y "envio_extra" si corresponde) y volvé a correr "npm run report" para ver la ganancia real.\n`
      );
      if (lookupFailures > 0) {
        console.warn(`Aviso: no pude confirmar el precio con descuento de ${lookupFailures} producto(s); quedaron con el precio de lista.`);
      }
    }
  } else {
    console.log("Calculando comisión real de Mercado Libre por producto...");
    const feesByItem = await fetchFeesForCostedItems({ feesClient, siteId: advertiser.site_id, ads: items, costs });
    productAnalysis = analyzeProductProfitability({ ads: items, costs, feesByItem });
  }

  console.log("Buscando el último período de facturación cerrado (comisiones y percepciones reales)...");
  let billingAnalysis = null;
  try {
    const billingClient = new MlBillingClient(config);
    const lastClosedPeriod = await billingClient.getLastClosedPeriod();
    if (lastClosedPeriod) {
      const [summary, perceptions] = await Promise.all([
        billingClient.getPeriodSummary({ key: lastClosedPeriod.key }),
        billingClient.getPerceptionsSummary({ key: lastClosedPeriod.key }),
      ]);
      billingAnalysis = analyzeBilling({ summary, perceptions });
      console.log(
        `Período de facturación ${lastClosedPeriod.period.date_from} a ${lastClosedPeriod.period.date_to}: comisión real ${billingAnalysis.salesCommission}, IIBB retenido ${billingAnalysis.totalIibb}.`
      );
    } else {
      console.log("Aviso: no hay ningún período de facturación cerrado todavía.");
    }
  } catch (err) {
    console.warn(
      `Aviso: no pude traer comisiones/percepciones reales (¿tenés el permiso "Facturación" habilitado y re-autorizado?): ${err.message}`
    );
  }

  const currency = details[0]?.currency_id === "ARS" || config.siteId === "MLA" ? "$" : "";
  const report = renderReport({ advertiser, dateFrom, dateTo, analysis, productAnalysis, stockAnalysis, billingAnalysis, currency });

  const fileName = `informe-${dateTo}.md`;
  const filePath = path.join(reportsDir, fileName);
  writeFileSync(filePath, report, "utf8");

  console.log(`\nInforme generado en ${filePath}\n`);
  console.log(report);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
