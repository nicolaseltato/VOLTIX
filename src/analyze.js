// Motor de análisis de rentabilidad de campañas de Mercado Ads.
//
// Mercado Libre reporta ACOS/ROAS sobre ingresos, no sobre ganancia real.
// Si se carga un margen de contribución (config/margins.json), acá se calcula
// el "ACOS de equilibrio" (el ACOS máximo que todavía deja ganancia) y se
// compara la inversión publicitaria contra la rentabilidad real del negocio,
// no solo contra el objetivo que definiste en Mercado Ads.

const BUDGET_LIMITED_THRESHOLD = 0.15; // 15% de subastas perdidas por presupuesto
const RANK_LIMITED_THRESHOLD = 0.15; // 15% de subastas perdidas por ad rank
const UNDERPERFORM_ROAS_RATIO = 0.8; // roas < 80% del roas_target = alerta
const MIN_RELEVANT_COST = 1; // ignorar campañas con inversión insignificante en el período

function marginForCampaign(campaign, marginsConfig) {
  if (!marginsConfig) return null;
  const override = marginsConfig.by_campaign?.[String(campaign.id)];
  if (override !== undefined) return override;
  return marginsConfig.default_margin_pct ?? null;
}

function classifyCampaign(campaign, detail, marginsConfig) {
  const metrics = { ...campaign.metrics, ...(detail?.metrics ?? {}) };
  const cost = metrics.cost ?? 0;
  const roas = metrics.roas ?? 0;
  const acos = metrics.acos ?? 0;
  const ctr = metrics.ctr ?? 0;
  const cvr = metrics.cvr ?? 0;
  const roasTarget = campaign.roas_target ?? null;
  const marginPct = marginForCampaign(campaign, marginsConfig);
  const breakEvenAcos = marginPct != null ? marginPct : null;

  const budgetLimited = (metrics.lost_impression_share_by_budget ?? 0) > BUDGET_LIMITED_THRESHOLD;
  const rankLimited = (metrics.lost_impression_share_by_ad_rank ?? 0) > RANK_LIMITED_THRESHOLD;

  const flags = [];
  if (budgetLimited) flags.push("budget_limited");
  if (rankLimited) flags.push("rank_limited");

  if (campaign.status === "paused") {
    return {
      campaign,
      metrics,
      flags,
      action: "pausada",
      priority: "info",
      impact: 0,
      reason: "La campaña está pausada. No requiere acción salvo que quieras reactivarla.",
    };
  }

  if (cost < MIN_RELEVANT_COST && metrics.prints < 50) {
    return {
      campaign,
      metrics,
      flags,
      action: "diagnosticar",
      priority: "media",
      impact: 0,
      reason:
        "Casi sin impresiones ni inversión en el período. Revisá stock, elegibilidad del ítem o si el presupuesto diario es muy bajo para competir.",
    };
  }

  // Rentabilidad real (si hay margen cargado) o proxy contra el objetivo de ROAS.
  const isProfitable =
    breakEvenAcos != null ? acos <= breakEvenAcos : roasTarget != null ? roas >= roasTarget : roas >= 1;

  const isClearlyUnderperforming =
    breakEvenAcos != null
      ? acos > breakEvenAcos * 1.15
      : roasTarget != null
        ? roas < roasTarget * UNDERPERFORM_ROAS_RATIO
        : roas < 1;

  if (isProfitable) {
    if (budgetLimited) {
      return {
        campaign,
        metrics,
        flags,
        action: "escalar_presupuesto",
        priority: "alta",
        impact: cost,
        reason: `Es rentable (ROAS ${roas.toFixed(1)}x${roasTarget ? `, objetivo ${roasTarget}x` : ""}${breakEvenAcos != null ? `, ACOS ${acos.toFixed(1)}% vs. equilibrio ${breakEvenAcos}%` : ""}) pero perdió ${(metrics.lost_impression_share_by_budget * 100).toFixed(0)}% de subastas por presupuesto. Subiendo el presupuesto diario deberías vender más sin perder rentabilidad.`,
      };
    }
    if (rankLimited) {
      return {
        campaign,
        metrics,
        flags,
        action: "revisar_puja_o_calidad",
        priority: "media",
        impact: cost,
        reason: `Es rentable pero perdió ${(metrics.lost_impression_share_by_ad_rank * 100).toFixed(0)}% de subastas por ad rank (compite mal frente a otros vendedores). Evaluá subir el ROAS objetivo levemente o mejorar precio/reputación/calidad de la publicación.`,
      };
    }
    return {
      campaign,
      metrics,
      flags,
      action: "mantener",
      priority: "baja",
      impact: cost,
      reason: `Rentable y sin restricciones evidentes (ROAS ${roas.toFixed(1)}x). Mantené la configuración actual y monitoreá.`,
    };
  }

  if (isClearlyUnderperforming) {
    const lowCtr = ctr > 0 && ctr < 1; // menos de 1% de CTR suele indicar problema de creatividad/precio
    const lowCvr = cvr > 0 && cvr < 2; // menos de 2% de conversión sobre clicks
    let reasonDetail;
    let action;
    if (lowCtr) {
      action = "revisar_creatividad";
      reasonDetail =
        "El CTR es bajo: la publicación se muestra pero no genera clicks. Revisá foto principal, precio frente a competencia y título.";
    } else if (lowCvr) {
      action = "revisar_ficha_o_precio";
      reasonDetail =
        "Genera clicks pero convierte poco: revisá precio, stock, reputación de la publicación o si perdés el Buy Box en catálogo.";
    } else {
      action = "bajar_objetivo_o_pausar";
      reasonDetail =
        "El desempeño general está lejos del objetivo de forma sostenida. Bajá el ROAS objetivo (o subí el ACOS objetivo) para reducir el gasto, o pausá si la inversión ya es alta.";
    }
    return {
      campaign,
      metrics,
      flags,
      action,
      priority: cost > MIN_RELEVANT_COST * 20 ? "alta" : "media",
      impact: cost,
      reason: `No es rentable (ROAS ${roas.toFixed(1)}x${roasTarget ? ` vs. objetivo ${roasTarget}x` : ""}${breakEvenAcos != null ? `, ACOS ${acos.toFixed(1)}% vs. equilibrio ${breakEvenAcos}%` : ""}). ${reasonDetail}`,
    };
  }

  return {
    campaign,
    metrics,
    flags,
    action: "monitorear",
    priority: "baja",
    impact: cost,
    reason: "Desempeño cercano al objetivo. Sin acción urgente, seguir monitoreando el período siguiente.",
  };
}

function accountSummary(campaignAnalyses) {
  const totals = campaignAnalyses.reduce(
    (acc, { metrics }) => {
      acc.cost += metrics.cost ?? 0;
      acc.totalAmount += metrics.total_amount ?? 0;
      acc.organicAmount += metrics.organic_units_amount ?? 0;
      acc.clicks += metrics.clicks ?? 0;
      acc.prints += metrics.prints ?? 0;
      acc.unitsQuantity += metrics.units_quantity ?? 0;
      return acc;
    },
    { cost: 0, totalAmount: 0, organicAmount: 0, clicks: 0, prints: 0, unitsQuantity: 0 }
  );

  const overallAcos = totals.totalAmount > 0 ? (totals.cost / totals.totalAmount) * 100 : null;
  const overallRoas = totals.cost > 0 ? totals.totalAmount / totals.cost : null;
  const revenueShareFromAds =
    totals.totalAmount + totals.organicAmount > 0
      ? (totals.totalAmount / (totals.totalAmount + totals.organicAmount)) * 100
      : null;

  return { ...totals, overallAcos, overallRoas, revenueShareFromAds };
}

export function analyzeCampaigns({ campaigns, details, marginsConfig }) {
  const detailById = new Map((details ?? []).map((d) => [d.id, d]));
  const campaignAnalyses = campaigns.map((campaign) =>
    classifyCampaign(campaign, detailById.get(campaign.id), marginsConfig)
  );

  const priorityOrder = { alta: 0, media: 1, baja: 2, info: 3 };
  const sorted = [...campaignAnalyses].sort((a, b) => {
    const p = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (p !== 0) return p;
    return b.impact - a.impact;
  });

  return {
    summary: accountSummary(campaignAnalyses),
    campaignAnalyses: sorted,
    hasMarginData: Boolean(marginsConfig?.default_margin_pct || marginsConfig?.by_campaign),
  };
}
