#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, marginsPath, reportsDir } from "../src/config.js";
import { MercadoAdsClient } from "../src/mercadoAdsClient.js";
import { analyzeCampaigns } from "../src/analyze.js";
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

async function main() {
  const config = loadConfig();
  const { dateFrom, dateTo } = resolveDateRange(parseArgs(process.argv.slice(2)));
  const client = new MercadoAdsClient(config);

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

  const marginsConfig = loadMarginsConfig();
  if (!marginsConfig) {
    console.warn(
      "Aviso: no existe config/margins.json. El análisis de rentabilidad usará el ROAS objetivo como referencia en lugar del margen real. Copiá config/margins.example.json para un análisis más preciso."
    );
  }

  const analysis = analyzeCampaigns({ campaigns, details, marginsConfig });

  const currency = details[0]?.currency_id === "ARS" || config.siteId === "MLA" ? "$" : "";
  const report = renderReport({ advertiser, dateFrom, dateTo, analysis, currency });

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
