const ACTION_LABELS = {
  escalar_presupuesto: "📈 Escalar presupuesto",
  revisar_puja_o_calidad: "🎯 Ajustar puja / calidad",
  mantener: "✅ Mantener",
  revisar_creatividad: "🖼️ Revisar creatividad",
  revisar_ficha_o_precio: "🏷️ Revisar ficha / precio",
  bajar_objetivo_o_pausar: "🔻 Bajar objetivo o pausar",
  monitorear: "👀 Monitorear",
  diagnosticar: "🔍 Diagnosticar",
  pausada: "⏸️ Pausada",
};

function fmtMoney(n, currency) {
  if (n == null || Number.isNaN(n)) return "-";
  return `${currency ?? ""}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`.trim();
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return `${n.toFixed(1)}%`;
}

function fmtX(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return `${n.toFixed(2)}x`;
}

export function renderReport({ advertiser, dateFrom, dateTo, analysis, currency }) {
  const { summary, campaignAnalyses, hasMarginData } = analysis;
  const lines = [];

  lines.push(`# Informe de publicidad y rentabilidad — ${advertiser.account_name}`);
  lines.push("");
  lines.push(`Período analizado: **${dateFrom} a ${dateTo}**`);
  lines.push(`Generado: ${new Date().toISOString()}`);
  if (!hasMarginData) {
    lines.push("");
    lines.push(
      "> ⚠️ No hay margen de contribución cargado en `config/margins.json`. El análisis usa el ROAS objetivo de cada campaña como referencia de rentabilidad, pero eso mide ingresos, no ganancia real. Cargá tu margen para un análisis de rentabilidad más preciso."
    );
  }

  lines.push("");
  lines.push("## Resumen ejecutivo");
  lines.push("");
  lines.push(`- Inversión total en publicidad: **${fmtMoney(summary.cost, currency)}**`);
  lines.push(`- Ventas atribuidas a publicidad: **${fmtMoney(summary.totalAmount, currency)}**`);
  lines.push(`- ACOS general de la cuenta: **${fmtPct(summary.overallAcos)}**`);
  lines.push(`- ROAS general de la cuenta: **${fmtX(summary.overallRoas)}**`);
  lines.push(`- % de ventas explicadas por publicidad (vs. orgánicas): **${fmtPct(summary.revenueShareFromAds)}**`);
  lines.push(`- Clicks: ${summary.clicks.toLocaleString("es-AR")} · Impresiones: ${summary.prints.toLocaleString("es-AR")} · Unidades vendidas: ${summary.unitsQuantity.toLocaleString("es-AR")}`);

  const actionable = campaignAnalyses.filter((c) => !["mantener", "pausada", "monitorear"].includes(c.action));
  lines.push("");
  lines.push("## Próximos movimientos (priorizados)");
  lines.push("");
  if (actionable.length === 0) {
    lines.push("No hay acciones urgentes: todas las campañas están dentro de lo esperado.");
  } else {
    actionable.forEach((c, i) => {
      lines.push(
        `${i + 1}. **[${c.priority.toUpperCase()}] ${ACTION_LABELS[c.action] ?? c.action} — ${c.campaign.name}** (inversión período: ${fmtMoney(c.impact, currency)})`
      );
      lines.push(`   ${c.reason}`);
      lines.push("");
    });
  }

  lines.push("## Detalle por campaña");
  lines.push("");
  lines.push("| Campaña | Estado | Estrategia | Costo | ROAS | ACOS | CTR | CVR | Acción sugerida |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const c of campaignAnalyses) {
    const m = c.metrics;
    lines.push(
      `| ${c.campaign.name} | ${c.campaign.status} | ${c.campaign.strategy ?? "-"} | ${fmtMoney(m.cost, currency)} | ${fmtX(m.roas)} | ${fmtPct(m.acos)} | ${fmtPct(m.ctr)} | ${fmtPct(m.cvr)} | ${ACTION_LABELS[c.action] ?? c.action} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push(
    "_Informe generado automáticamente por el agente de publicidad y rentabilidad de Voltix a partir de la API de Mercado Ads. Verificá los números clave en el panel de Mercado Ads antes de tomar decisiones de alto impacto._"
  );

  return lines.join("\n");
}
