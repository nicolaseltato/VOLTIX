import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// Costo real de envío por despacho. El costo de una publicación en Mercado
// Envíos (sobre todo Full) no siempre es $0 aunque el comprador vea "envío
// gratis" — esto trae el costo real que se factura, por orden.
export class MlShipmentsClient {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }

  async getShipmentForOrder(orderId) {
    if (this.cache.has(orderId)) return this.cache.get(orderId);

    const accessToken = await getValidAccessToken(this.config);
    const response = await fetch(`${BASE_URL}/orders/${orderId}/shipments`, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-New-Domain": "true" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Shipments API error ${response.status} para orden ${orderId}: ${body.message ?? JSON.stringify(body)}`);
    }

    const result = {
      hasShipping: !!body.shipping_option,
      cost: body.shipping_option?.cost ?? body.base_cost ?? null,
      listCost: body.shipping_option?.list_cost ?? null,
      logisticType: body.logistic_type ?? null,
      methodName: body.shipping_option?.name ?? null,
    };
    this.cache.set(orderId, result);
    return result;
  }
}
