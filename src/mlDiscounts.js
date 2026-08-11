import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// El precio que trae Product Ads (campo "price") es el precio de LISTA, no el que
// paga el comprador cuando el vendedor tiene un descuento individual activo
// (precio tachado + precio nuevo). Ese precio "real" sale de las promociones del
// vendedor, no del ítem en sí — items/{id} y sites/{id}/listing_prices están
// bloqueados en algunos entornos de red, pero este endpoint no.
export class MlDiscountsClient {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }

  async getCurrentPrice(itemId) {
    if (this.cache.has(itemId)) return this.cache.get(itemId);

    const accessToken = await getValidAccessToken(this.config);
    const response = await fetch(
      `${BASE_URL}/seller-promotions/items/${itemId}?app_version=v2`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      throw new Error(`No se pudo consultar promociones de ${itemId}: HTTP ${response.status}`);
    }
    const promotions = await response.json();

    const originalPrice = promotions.find((p) => p.original_price != null)?.original_price ?? null;
    const activePrices = promotions
      .filter((p) => p.status === "started" && p.price > 0)
      .map((p) => p.price);

    const currentPrice = activePrices.length > 0 ? Math.min(...activePrices) : originalPrice;
    const result = { currentPrice, originalPrice, hasActiveDiscount: activePrices.length > 0 };
    this.cache.set(itemId, result);
    return result;
  }
}
