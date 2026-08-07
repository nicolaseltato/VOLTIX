import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// Trae el detalle público del ítem y calcula su comisión real de venta (sale_fee)
// usando el calculador oficial de Mercado Libre (/sites/$SITE/listing_prices).
// Así no le pedimos al vendedor que nos diga "cuánto cobra ML", lo calculamos nosotros.
export class MlFeesClient {
  constructor(config) {
    this.config = config;
    this.itemCache = new Map();
    this.feeCache = new Map();
  }

  async #get(url) {
    const accessToken = await getValidAccessToken(this.config);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body.message || body.error || JSON.stringify(body);
      throw new Error(`Error consultando ${url.pathname}: ${detail}`);
    }
    return body;
  }

  async getItemDetail(itemId) {
    if (this.itemCache.has(itemId)) return this.itemCache.get(itemId);
    const item = await this.#get(new URL(`${BASE_URL}/items/${itemId}`));
    this.itemCache.set(itemId, item);
    return item;
  }

  async getSaleFeeAmount({ siteId, categoryId, price, currencyId, listingTypeId, logisticType }) {
    const cacheKey = [siteId, categoryId, price, listingTypeId, logisticType].join("|");
    if (this.feeCache.has(cacheKey)) return this.feeCache.get(cacheKey);

    const url = new URL(`${BASE_URL}/sites/${siteId}/listing_prices`);
    url.searchParams.set("category_id", categoryId);
    url.searchParams.set("price", price);
    if (currencyId) url.searchParams.set("currency_id", currencyId);
    if (listingTypeId) url.searchParams.set("listing_type_id", listingTypeId);
    if (logisticType) url.searchParams.set("logistic_type", logisticType);

    const body = await this.#get(url);
    const options = Array.isArray(body) ? body.flat(Infinity) : [body];
    const match =
      options.find((o) => o.listing_type_id === listingTypeId) ?? options[0] ?? null;
    const fee = match?.sale_fee_amount ?? null;
    this.feeCache.set(cacheKey, fee);
    return fee;
  }

  // Comisión total (fija + variable) que ML te cobra por vender una unidad de este ítem,
  // al precio actual de la publicación.
  async getSaleFeeForItem(itemId, siteId) {
    const item = await this.getItemDetail(itemId);
    return this.getSaleFeeAmount({
      siteId,
      categoryId: item.category_id,
      price: item.price,
      currencyId: item.currency_id,
      listingTypeId: item.listing_type_id,
      logisticType: item.shipping?.logistic_type,
    });
  }
}
