import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

// Costo real de envío por despacho, A CARGO DEL VENDEDOR.
//
// OJO: "shipping_option.cost" (lo que devolvíamos antes) es lo que paga el
// COMPRADOR — con "envío gratis" da $0 aunque a vos Mercado Libre te haya
// cobrado igual. El costo real del vendedor sale de otro recurso:
// /shipments/:id/costs → senders[0].cost, que además expone el % de descuento
// que a veces cubre Mercado Libre (variable venta a venta, no un % fijo).
//
// Excepción real, no un bug nuestro: en logística Full (fulfillment) Mercado
// Libre NO factura el envío por despacho individual — lo cobra en un cargo
// mensual agregado (junto con almacenamiento) que no se puede desglosar por
// venta por ningún endpoint. Para esos casos devolvemos costAvailable:false en
// vez de inventar un número (ni $0 ni el que paga el comprador).
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

    const shipmentId = body.id;
    const hasShipping = !!body.shipping_option;
    const logisticType = body.logistic_type ?? null;
    const methodName = body.shipping_option?.name ?? null;
    const buyerPaidCost = body.shipping_option?.cost ?? null;

    let result;
    if (!hasShipping || !shipmentId || logisticType === "fulfillment") {
      // Full (o sin envío/shipment_id): no hay costo real por venta disponible.
      result = {
        hasShipping,
        costAvailable: false,
        cost: null,
        buyerPaidCost,
        logisticType,
        methodName,
        discountRate: null,
        discountType: null,
      };
    } else {
      const costsResponse = await fetch(`${BASE_URL}/shipments/${shipmentId}/costs`, {
        headers: { Authorization: `Bearer ${accessToken}`, "x-format-new": "true" },
      });
      const costsBody = await costsResponse.json().catch(() => ({}));
      const sender = costsBody.senders?.[0];
      result = {
        hasShipping,
        costAvailable: costsResponse.ok,
        cost: costsResponse.ok ? (sender?.cost ?? 0) : null,
        buyerPaidCost,
        logisticType,
        methodName,
        discountRate: sender?.discounts?.[0]?.rate ?? null,
        discountType: sender?.discounts?.[0]?.type ?? null,
      };
    }

    this.cache.set(orderId, result);
    return result;
  }
}
