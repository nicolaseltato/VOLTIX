#!/usr/bin/env node
import { loadConfig } from "../src/config.js";
import { loadStoredCredentials, getValidAccessToken } from "../src/oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// Día calendario en hora Argentina (no UTC) — "ayer" respecto al momento en que corre.
function yesterdayArt() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

async function getAllOrdersArt({ config, sellerId, day }) {
  const dateFromArt = `${day}T00:00:00.000-03:00`;
  const dateToArt = `${day}T23:59:59.000-03:00`;
  const results = [];
  let offset = 0;
  const limit = 50;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${BASE_URL}/orders/search`);
    url.searchParams.set("seller", sellerId);
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("order.date_created.from", dateFromArt);
    url.searchParams.set("order.date_created.to", dateToArt);
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("offset", offset);
    url.searchParams.set("limit", limit);
    const accessToken = await getValidAccessToken(config);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Orders API error ${response.status}: ${body.message ?? JSON.stringify(body)}`);
    results.push(...(body.results ?? []));
    const total = body.paging?.total ?? results.length;
    offset += limit;
    if (offset >= total || (body.results ?? []).length === 0) break;
  }
  return results;
}

async function main() {
  const config = loadConfig();
  const credentials = loadStoredCredentials();
  const day = yesterdayArt();
  const orders = await getAllOrdersArt({ config, sellerId: credentials.user_id, day });

  let revenue = 0;
  for (const order of orders) {
    for (const oi of order.order_items ?? []) {
      revenue += (oi.unit_price ?? 0) * (oi.quantity ?? 0);
    }
  }

  console.log(JSON.stringify({ day, orders: orders.length, grossRevenue: Math.round(revenue) }));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exitCode = 1;
});
