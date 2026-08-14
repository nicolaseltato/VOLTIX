import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Requiere el permiso funcional "Facturación" habilitado en la app y re-autorizado
// (scope urn:ml:mktp:invoices:/read-write). Da acceso a los cargos y percepciones
// REALES de cada período de facturación (comisión de venta, publicidad, envíos,
// percepciones de IVA e Ingresos Brutos por jurisdicción) — no estimaciones.
export class MlBillingClient {
  constructor(config) {
    this.config = config;
  }

  async #get(url, { retries = 3 } = {}) {
    const accessToken = await getValidAccessToken(this.config);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 429 && retries > 0) {
      // El detalle de percepciones limita a 5 requests/minuto; esperamos y reintentamos.
      await sleep(15000);
      return this.#get(url, { retries: retries - 1 });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body.message || body.error || JSON.stringify(body);
      throw new Error(`Billing API error ${response.status} en ${url.pathname}: ${detail}`);
    }
    return body;
  }

  async getPeriods({ group = "ML", documentType = "BILL", limit = 6 } = {}) {
    const url = new URL(`${BASE_URL}/billing/integration/monthly/periods`);
    url.searchParams.set("group", group);
    url.searchParams.set("document_type", documentType);
    url.searchParams.set("limit", limit);
    const body = await this.#get(url);
    return body.results ?? [];
  }

  async getPeriodSummary({ key, group = "ML", documentType = "BILL" }) {
    const url = new URL(`${BASE_URL}/billing/integration/periods/key/${key}/summary/details`);
    url.searchParams.set("group", group);
    url.searchParams.set("document_type", documentType);
    return this.#get(url);
  }

  async getPerceptionsSummary({ key, group = "ML" }) {
    const url = new URL(`${BASE_URL}/billing/integration/periods/key/${key}/perceptions/summary`);
    url.searchParams.set("group", group);
    const body = await this.#get(url);
    return body.summary ?? [];
  }

  // Último período con estado CLOSED (los importes ya no cambian).
  async getLastClosedPeriod(params) {
    const periods = await this.getPeriods(params);
    return periods.find((p) => p.period_status === "CLOSED") ?? null;
  }

  // Detalle de percepciones VENTA POR VENTA (no agregado) para una combinación
  // puntual de documento + tipo de impuesto — cada fila trae publish_number
  // (item), sale_number (orden), fecha y provincia del comprador.
  async searchPerceptionDetails({ group = "ML", documentId, taxType, offset = 0, limit = 200 }) {
    const url = new URL(`${BASE_URL}/billing/integration/group/${group}/perceptions/details`);
    url.searchParams.set("document_id", documentId);
    url.searchParams.set("tax_type", taxType);
    url.searchParams.set("offset", offset);
    url.searchParams.set("limit", limit);
    return this.#get(url);
  }

  async getAllPerceptionDetails({ group = "ML", documentId, taxType }) {
    const results = [];
    let offset = 0;
    const limit = 200;
    let first = true;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!first) await sleep(13000); // el endpoint limita a 5 requests/minuto
      first = false;
      const page = await this.searchPerceptionDetails({ group, documentId, taxType, offset, limit });
      results.push(...(page.results ?? []));
      const total = page.total ?? results.length;
      offset += limit;
      if (offset >= total || (page.results ?? []).length === 0) break;
    }
    return results;
  }

  // Trae el detalle venta-por-venta de TODAS las percepciones de un período,
  // recorriendo cada combinación document_id + tax_type que aparece en el resumen.
  // Es lento a propósito (13s entre cada llamada) para respetar el límite de 5
  // requests/minuto de este endpoint en particular.
  async getAllPerceptionDetailsForPeriod({ key, group = "ML" }) {
    const summary = await this.getPerceptionsSummary({ key, group });
    const combos = new Map();
    for (const row of summary) {
      combos.set(`${row.document_id}|${row.tax_type}`, { documentId: row.document_id, taxType: row.tax_type });
    }
    const all = [];
    let first = true;
    for (const combo of combos.values()) {
      if (!first) await sleep(13000);
      first = false;
      try {
        const details = await this.getAllPerceptionDetails({ group, ...combo });
        all.push(...details);
      } catch (err) {
        console.warn(`  Aviso: no se pudo traer el detalle de percepción ${combo.taxType} (doc ${combo.documentId}): ${err.message}`);
      }
    }
    return all;
  }
}
