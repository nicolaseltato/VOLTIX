#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, marginsPath, reportsDir } from "../src/config.js";
import { MercadoAdsClient } from "../src/mercadoAdsClient.js";
import { MlFeesClient } from "../src/mlFees.js";
import { loadCosts, generateCostsTemplate, costsPath } from "../src/costs.js";
import { analyzeCampaigns } from "../src/analyze.js";
import { analyzeProductProfitability } from "../src/analyzeProfitability.js";
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
// No la pedimos al vendedor: la calculamos con el mismo calculador que usa ML.
async function fetchFeesForCostedItems({ feesClient, siteId, ads, costs }) {
  const feesByItem = new Map();
  if (!costs) return feesByItem;
  const itemsWithCost = ads.filter((ad) => costs.get(ad.item_id)?.cogs != null);
  for (const ad of itemsWithCost) {
    try {
      const fee = await feesClient.getSaleFeeForItem(ad.item_id, siteId);
      feesByItem.set(ad.item_id, fee);
    } catch (err) {
      console.warn(`  Aviso: no se pudo calcular la comisión de ML para ${ad.item_id}: ${err.message}`);
    }
  }
  return feesByItem;
}

async function main() {
  const config = loadConfig();
  const { dateFrom, dateTo } = resolveDateRange(parseArgs(process.argv.slice(2)));
  const client = new MercadoAdsClient(config);
  const feesClient = new MlFeesClient(config);

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
  console.log(`${ads.length} productos con publicidad encontrados.`);

  const marginsConfig = loadMarginsConfig();
  const analysis = analyzeCampaigns({ campaigns, details, marginsConfig });

  let productAnalysis = null;
  const costs = loadCosts();
  if (!costs) {
    if (ads.length > 0) {
      const count = generateCostsTemplate(ads);
      console.log(
        `\nGeneré ${costsPath} con ${count} productos reales de tu cuenta. Completá la columna "costo_producto" (y "envio_extra" si corresponde) y volvé a correr "npm run report" para ver la ganancia real.\n`
      );
    }
  } else {
    console.log("Calculando comisión real de Mercado Libre por producto...");
    const feesByItem = await fetchFeesForCostedItems({ feesClient, siteId: advertiser.site_id, ads, costs });
    productAnalysis = analyzeProductProfitability({ ads, costs, feesByItem });
  }

  const currency = details[0]?.currency_id === "ARS" || config.siteId === "MLA" ? "$" : "";
  const report = renderReport({ advertiser, dateFrom, dateTo, analysis, productAnalysis, currency });

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
