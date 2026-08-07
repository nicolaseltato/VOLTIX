import { getValidAccessToken } from "./oauth.js";

const BASE_URL = "https://api.mercadolibre.com";

export const CAMPAIGN_METRICS = [
  "clicks",
  "prints",
  "ctr",
  "cost",
  "cpc",
  "acos",
  "organic_units_quantity",
  "organic_units_amount",
  "organic_items_quantity",
  "direct_items_quantity",
  "indirect_items_quantity",
  "advertising_items_quantity",
  "cvr",
  "roas",
  "sov",
  "direct_units_quantity",
  "indirect_units_quantity",
  "units_quantity",
  "direct_amount",
  "indirect_amount",
  "total_amount",
];

export const CAMPAIGN_DETAIL_EXTRA_METRICS = [
  "impression_share",
  "top_impression_share",
  "lost_impression_share_by_budget",
  "lost_impression_share_by_ad_rank",
  "acos_benchmark",
];

export class MercadoAdsClient {
  constructor(config) {
    this.config = config;
  }

  async #request(path, { apiVersion = "2", searchParams } = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
    }

    const doFetch = async () => {
      const accessToken = await getValidAccessToken(this.config);
      return fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Api-Version": apiVersion,
        },
      });
    };

    let response = await doFetch();
    if (response.status === 401) {
      // El token pudo haber sido invalidado; getValidAccessToken ya refresca por expiración,
      // pero reintentamos una vez más por las dudas (p. ej. reloj desincronizado).
      response = await doFetch();
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body.message || body.error || JSON.stringify(body);
      throw new Error(`Mercado Ads API error ${response.status} en ${path}: ${detail}`);
    }
    return body;
  }

  async getAdvertisers(productId = this.config.productId) {
    const body = await this.#request("/advertising/advertisers", {
      apiVersion: "1",
      searchParams: { product_id: productId },
    });
    return body.advertisers || [];
  }

  async searchCampaigns({ advertiserId, siteId, dateFrom, dateTo, limit = 50, offset = 0 }) {
    return this.#request(
      `/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search`,
      {
        searchParams: {
          limit,
          offset,
          date_from: dateFrom,
          date_to: dateTo,
          metrics: CAMPAIGN_METRICS.join(","),
        },
      }
    );
  }

  async getAllCampaigns(params) {
    const results = [];
    let offset = 0;
    const limit = 50;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await this.searchCampaigns({ ...params, limit, offset });
      results.push(...(page.results || []));
      const total = page.paging?.total ?? results.length;
      offset += limit;
      if (offset >= total) break;
    }
    return results;
  }

  async getCampaignDetail({ siteId, campaignId, dateFrom, dateTo }) {
    return this.#request(`/advertising/${siteId}/product_ads/campaigns/${campaignId}`, {
      searchParams: {
        date_from: dateFrom,
        date_to: dateTo,
        metrics: [...CAMPAIGN_METRICS, ...CAMPAIGN_DETAIL_EXTRA_METRICS].join(","),
      },
    });
  }
}
