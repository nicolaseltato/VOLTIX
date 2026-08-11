import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// Requiere el permiso funcional "Ventas y envíos" habilitado en la app y
// re-autorizado. Trae órdenes reales con la comisión de venta (sale_fee) y el
// costo de envío por orden — el nivel de detalle más preciso posible, sale de
// cada venta real, no de un cálculo ni de un promedio.
export class MlOrdersClient {
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
      throw new Error(`Orders API error ${response.status} en ${url.pathname}: ${detail}`);
    }
    return body;
  }

  async searchOrders({ sellerId, dateFrom, dateTo, offset = 0, limit = 50 }) {
    const url = new URL(`${BASE_URL}/orders/search`);
    url.searchParams.set("seller", sellerId);
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("order.date_created.from", `${dateFrom}T00:00:00.000-00:00`);
    url.searchParams.set("order.date_created.to", `${dateTo}T23:59:59.000-00:00`);
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("offset", offset);
    url.searchParams.set("limit", limit);
    return this.#get(url);
  }

  async getAllOrders({ sellerId, dateFrom, dateTo }) {
    const results = [];
    let offset = 0;
    const limit = 50;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await this.searchOrders({ sellerId, dateFrom, dateTo, offset, limit });
      results.push(...(page.results ?? []));
      const total = page.paging?.total ?? results.length;
      offset += limit;
      if (offset >= total || (page.results ?? []).length === 0) break;
    }
    return results;
  }
}
