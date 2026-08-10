import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// Requiere el permiso funcional "Facturación" habilitado en la app y re-autorizado
// (scope urn:ml:mktp:invoices:/read-write). Da acceso a los cargos y percepciones
// REALES de cada período de facturación (comisión de venta, publicidad, envíos,
// percepciones de IVA e Ingresos Brutos por jurisdicción) — no estimaciones.
export class MlBillingClient {
  constructor(config) {
    this.config = config;
  }

  async #get(url) {
    const accessToken = await getValidAccessToken(this.config);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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
}
