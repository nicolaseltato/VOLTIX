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

const FEE_SOURCE_LABELS = {
  real: "🟢 real",
  manual: "🟡 %manual",
  auto: "🔵 auto",
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

function renderBillingSection(billingAnalysis, currency) {
  const lines = [];
  lines.push("## 💰 Comisiones y percepciones reales (Facturación)");
  lines.push("");

  if (!billingAnalysis) {
    lines.push(
      "> No pude traer este bloque: falta el permiso **Facturación** habilitado y re-autorizado en tu app de Mercado Libre, o todavía no hay ningún período de facturación cerrado."
    );
    return lines.join("\n");
  }

  const { period, totalAmount, salesCommission, adsCharge, shippingCharges, totalIibb, iibb, totalOtherPerceptions, totalBonuses } = billingAnalysis;
  lines.push(
    `_Del último período de facturación cerrado (${period.date_from} a ${period.date_to}) — son los cargos que Mercado Libre te cobró de verdad, no una estimación._`
  );
  lines.push("");
  lines.push(`- Total facturado del período: **${fmtMoney(totalAmount, currency)}**`);
  lines.push(`- Comisión de venta real: **${fmtMoney(salesCommission, currency)}**`);
  lines.push(`- Publicidad (Product Ads) facturada: **${fmtMoney(adsCharge, currency)}**`);
  lines.push(`- Cargos de envío: **${fmtMoney(shippingCharges, currency)}**`);
  lines.push(`- Percepciones de Ingresos Brutos (IIBB): **${fmtMoney(totalIibb, currency)}**`);
  if (totalOtherPerceptions > 0) {
    lines.push(`- Otras percepciones (IVA, etc.): **${fmtMoney(totalOtherPerceptions, currency)}**`);
  }
  if (totalBonuses < 0) {
    lines.push(`- Bonificaciones/reintegros: **${fmtMoney(totalBonuses, currency)}**`);
  }

  if (iibb.length > 0) {
    lines.push("");
    lines.push("### Ingresos Brutos por jurisdicción");
    lines.push("");
    lines.push("| Jurisdicción / concepto | Régimen | Alícuota | Monto retenido |");
    lines.push("|---|---|---|---|");
    for (const r of iibb) {
      lines.push(`| ${r.concept} | ${r.regimen ?? "-"} | ${r.aliquot != null ? `${r.aliquot}%` : "-"} | ${fmtMoney(r.amount, currency)} |`);
    }
  }

  return lines.join("\n");
}

function renderStockGapsSection(stockAnalysis, currency) {
  const lines = [];
  lines.push("## ⚠️ Productos pausados por falta de stock");
  lines.push("");
  lines.push(
    "_Mercado Libre pausa automáticamente la publicidad de un ítem cuando se queda sin stock (status `hold`) — no es una decisión de la campaña. Estos productos ya demostraron que venden con publicidad en este período; ahora mismo no se les puede invertir un peso más porque no hay nada para vender._"
  );
  lines.push("");

  if (stockAnalysis.proven.length === 0) {
    lines.push(`No hay productos con ventas recientes bloqueados por stock (${stockAnalysis.totalCount} sin stock en total, pero sin actividad en el período).`);
    return lines.join("\n");
  }

  lines.push(
    `**${stockAnalysis.proven.length} de tus productos** con historial de venta por publicidad están sin stock ahora mismo — representan **${fmtMoney(stockAnalysis.totalRevenueAtRisk, currency)}** en ventas por publicidad que generaron en este período y que no se pueden repetir hasta reponer.`
  );
  lines.push("");
  lines.push("**Priorizá reponer stock de (ordenado por venta generada):**");
  lines.push("");
  lines.push("| Producto | Venta por ads en el período | Unidades vendidas | Inversión en ads |");
  lines.push("|---|---|---|---|");
  for (const r of stockAnalysis.proven.slice(0, 15)) {
    lines.push(`| ${r.title} | ${fmtMoney(r.adRevenue, currency)} | ${r.units} | ${fmtMoney(r.adSpend, currency)} |`);
  }
  if (stockAnalysis.proven.length > 15) {
    lines.push("");
    lines.push(`_...y ${stockAnalysis.proven.length - 15} productos más en la misma situación._`);
  }

  return lines.join("\n");
}

function renderCascadeSection(cascade, currency) {
  const lines = [];
  lines.push("## Cascada de rentabilidad real");
  lines.push("");

  if (!cascade) {
    lines.push(
      "> No puedo armar la cascada todavía: falta `config/costos.csv` completado (ver sección **Ganancia real por producto**)."
    );
    return lines.join("\n");
  }

  lines.push(
    "_Solo sobre los productos con costo cargado en `config/costos.csv`. Cada línea muestra cuánto se lleva del ingreso bruto — así ves en qué escalón se te va la plata, no solo el resultado final._"
  );
  lines.push("");
  lines.push("| Escalón | Monto |");
  lines.push("|---|---|");
  lines.push(`| Ingresos brutos por ventas | **${fmtMoney(cascade.ingresosBrutos, currency)}** |`);
  lines.push(`| (-) Cargo por venta (comisión ML) | ${fmtMoney(-cascade.cargoPorVenta, currency)} |`);
  lines.push(`| (-) Costo fijo por venta | _no disponible — ML no lo discrimina en esta integración, ya está bundleado en la comisión de venta_ |`);
  lines.push(`| (-) Costo por ofrecer cuotas | _no disponible — ídem_ |`);
  lines.push(`| (-) Costo de envío no cubierto | ${fmtMoney(-cascade.envioNoCubierto, currency)} |`);
  lines.push(
    `| (-) IIBB retenido | ${cascade.iibbEsReal ? fmtMoney(-cascade.iibbRetenido, currency) : "_no disponible — falta el permiso Facturación o no hay período cerrado_"} |`
  );
  lines.push(`| (-) Anulaciones / reembolsos | _no disponible — todavía no se traen de la API de Órdenes_ |`);
  lines.push(`| **= Ingreso neto de Mercado Libre** | **${fmtMoney(cascade.ingresoNetoMl, currency)}** |`);
  lines.push(`| (-) COGS (costo de mercadería vendida) | ${fmtMoney(-cascade.cogsTotal, currency)} |`);
  lines.push(`| **= Margen de contribución** | **${fmtMoney(cascade.margenContribucion, currency)}** |`);
  lines.push(`| (-) Inversión en Mercado Ads | ${fmtMoney(-cascade.adSpendTotal, currency)} |`);
  lines.push(
    `| (-) Cuota Monotributo | ${cascade.cuotaMonotributo != null ? fmtMoney(-cascade.cuotaMonotributo, currency) : "_no cargada — completá `config/gastos-fijos.json`_"} |`
  );
  if (cascade.otrosGastos.length > 0) {
    for (const g of cascade.otrosGastos) {
      lines.push(`| (-) ${g.concepto} | ${fmtMoney(-g.monto, currency)} |`);
    }
  } else {
    lines.push(`| (-) Otros gastos fijos/variables declarados | _ninguno cargado en \`config/gastos-fijos.json\`_ |`);
  }
  lines.push(`| **= GANANCIA NETA REAL** | **${fmtMoney(cascade.gananciaNetaReal, currency)}** (${fmtPct(cascade.gananciaNetaRealPct)} sobre ventas) |`);

  if (!cascade.isComplete) {
    lines.push("");
    lines.push(
      `⚠️ Esta cascada **todavía no está completa** — le faltan datos reales, así que la Ganancia Neta Real de arriba es optimista (falta restar lo que no se pudo cargar): ${cascade.missingInputs.join("; ")}.`
    );
  }

  return lines.join("\n");
}

function renderAlertsSection({ productAnalysis, billingAnalysis }) {
  const lines = [];
  lines.push("## ⚠️ Alertas");
  lines.push("");

  const alerts = [];

  if (productAnalysis) {
    if (productAnalysis.losingMoney.length > 0) {
      const names = productAnalysis.losingMoney.slice(0, 5).map((r) => r.title).join(", ");
      alerts.push(
        `**${productAnalysis.losingMoney.length} producto(s) con ganancia real negativa o nula:** ${names}${productAnalysis.losingMoney.length > 5 ? ` y ${productAnalysis.losingMoney.length - 5} más` : ""}.`
      );
    }
    if (productAnalysis.burningAds.length > 0) {
      const names = productAnalysis.burningAds.slice(0, 5).map((r) => r.title).join(", ");
      alerts.push(
        `**${productAnalysis.burningAds.length} producto(s) con campaña quemando plata:** el ACOS de la publicidad supera el margen bruto real del producto (antes de ads) — ${names}${productAnalysis.burningAds.length > 5 ? ` y ${productAnalysis.burningAds.length - 5} más` : ""}. Venden, pero cada venta publicitada pierde plata.`
      );
    }
  }

  if (!billingAnalysis) {
    alerts.push(
      "**IIBB sin cargar:** no hay período de facturación cerrado o falta el permiso **Facturación** — la Ganancia Neta Real de este informe no está descontando Ingresos Brutos."
    );
  }

  if (alerts.length === 0) {
    lines.push("Sin alertas: ningún producto con margen negativo ni campaña quemando plata con los datos cargados hasta ahora.");
  } else {
    for (const a of alerts) lines.push(`- ${a}`);
  }

  return lines.join("\n");
}

function renderProductProfitabilitySection(productAnalysis, currency) {
  const lines = [];
  lines.push("## Ganancia real por producto");
  lines.push("");
  lines.push(
    "_Ventas por publicidad, menos costo del producto, comisión de Mercado Libre y envío extra a tu cargo (si lo cargaste), menos la inversión en publicidad._"
  );
  lines.push("");

  if (!productAnalysis) {
    lines.push(
      "> No pude calcular la ganancia real todavía: falta el archivo `config/costos.csv` con el costo de tus productos. Mirá la sección **Qué necesito de vos** más abajo."
    );
    return lines.join("\n");
  }

  const { withCost, missingCost, toScale, losingMoney, totalRealProfit } = productAnalysis;

  if (withCost.length > 0) {
    lines.push(`- Ganancia real total del período (solo productos con costo cargado): **${fmtMoney(totalRealProfit, currency)}**`);
  }
  lines.push(`- Productos analizados con costo real: **${withCost.length}**`);
  if (missingCost.length > 0) {
    lines.push(`- Productos con publicidad activa pero **sin costo cargado** (no se pudieron analizar): **${missingCost.length}**`);
  }

  lines.push("");
  lines.push("### Conclusión corta");
  lines.push("");
  if (withCost.length === 0) {
    lines.push(
      "Todavía no cargaste el costo de ningún producto en `config/costos.csv`, así que no puedo decirte qué te conviene potenciar. Completá esa planilla y volvé a correr el informe."
    );
  } else {
    if (toScale.length > 0) {
      const names = toScale.slice(0, 5).map((r) => r.title).join(", ");
      lines.push(`**Conviene potenciar:** ${names}${toScale.length > 5 ? ` y ${toScale.length - 5} más` : ""}. Son rentables incluso después de descontar todos los costos — subiles presupuesto o puja.`);
    } else {
      lines.push("**Conviene potenciar:** ningún producto es rentable todavía con los datos cargados.");
    }
    if (losingMoney.length > 0) {
      const names = losingMoney.slice(0, 5).map((r) => r.title).join(", ");
      lines.push(`**Están perdiendo plata:** ${names}${losingMoney.length > 5 ? ` y ${losingMoney.length - 5} más` : ""}. La venta que generan no cubre producto + comisión + envío + publicidad. Bajá presupuesto, subí precio o pausá.`);
    } else {
      lines.push("**Están perdiendo plata:** ninguno, con los datos cargados hasta ahora.");
    }
  }

  if (withCost.length > 0) {
    const feeSourceCount = withCost.reduce((acc, r) => {
      acc[r.feeSource] = (acc[r.feeSource] ?? 0) + 1;
      return acc;
    }, {});
    lines.push("");
    lines.push("### Detalle por producto (con costo cargado)");
    lines.push("");
    lines.push(
      `_Origen de la comisión: ${FEE_SOURCE_LABELS.real} en ${feeSourceCount.real ?? 0} productos (de tus órdenes reales) · ${FEE_SOURCE_LABELS.manual} en ${feeSourceCount.manual ?? 0} (% que cargaste) · ${FEE_SOURCE_LABELS.auto} en ${feeSourceCount.auto ?? 0} (calculador de ML)._`
    );
    lines.push(
      "_\"Unidades\" y \"Venta total\" son todas las ventas reales del producto en el período (con o sin click de publicidad de por medio); \"Inversión ads\" es lo que gastaste publicitándolo._"
    );
    lines.push("");
    lines.push("| Producto | Unidades | Venta total | Inversión ads | ACOS ads | ROAS ads | Costo prod. | Comisión ML | Envío extra | **Ganancia real** | Margen real | Margen bruto (sin ads) |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of withCost) {
      const warn = r.acosExceedsGrossMargin ? " ⚠️" : "";
      lines.push(
        `| ${r.title}${warn} | ${r.units} | ${fmtMoney(r.revenue, currency)} | ${fmtMoney(r.adSpend, currency)} | ${fmtPct(r.acos)} | ${fmtX(r.roas)} | ${fmtMoney(r.cogsPerUnit, currency)} | ${fmtMoney(r.mlFeePerUnit, currency)} ${FEE_SOURCE_LABELS[r.feeSource] ?? ""} | ${fmtMoney(r.extraShippingPerUnit, currency)} | **${fmtMoney(r.realProfit, currency)}** | ${fmtPct(r.realMarginPct)} | ${fmtPct(r.grossMarginPct)} |`
      );
    }
    if (withCost.some((r) => r.acosExceedsGrossMargin)) {
      lines.push("");
      lines.push("_⚠️ = el ACOS de la publicidad de ese producto supera su margen bruto (antes de ads): la campaña está quemando plata en ese producto aunque genere ventas._");
    }
  }

  if (missingCost.length > 0) {
    lines.push("");
    lines.push("### Productos sin costo cargado (completalos en `config/costos.csv`)");
    lines.push("");
    lines.push("| Producto | item_id | Inversión ads | Venta por ads |");
    lines.push("|---|---|---|---|");
    for (const r of missingCost) {
      lines.push(`| ${r.title} | ${r.itemId} | ${fmtMoney(r.adSpend, currency)} | ${fmtMoney(r.adRevenue, currency)} |`);
    }
  }

  return lines.join("\n");
}

export function renderReport({ advertiser, dateFrom, dateTo, analysis, productAnalysis, stockAnalysis, billingAnalysis, cascade, currency }) {
  const { summary, campaignAnalyses, hasMarginData } = analysis;
  const lines = [];

  lines.push(`# Informe de publicidad y rentabilidad — ${advertiser.account_name}`);
  lines.push("");
  lines.push(`Período analizado: **${dateFrom} a ${dateTo}**`);
  lines.push(`Generado: ${new Date().toISOString()}`);
  lines.push("");

  if (cascade) {
    lines.push(
      `**Ganancia Neta Real del período: ${fmtMoney(cascade.gananciaNetaReal, currency)}** (${fmtPct(cascade.gananciaNetaRealPct)} de margen neto sobre ${fmtMoney(cascade.ingresosBrutos, currency)} de ventas brutas)${cascade.isComplete ? "" : " — ⚠️ número incompleto, ver cascada abajo"}.`
    );
  } else {
    lines.push(
      "**Ganancia Neta Real: sin calcular todavía** — falta cargar costos en `config/costos.csv` (ver sección **Qué necesito de vos**)."
    );
  }
  lines.push("");

  lines.push(renderAlertsSection({ productAnalysis, billingAnalysis }));

  lines.push("");
  lines.push(renderCascadeSection(cascade, currency));

  lines.push("");
  lines.push("## Resumen ejecutivo");
  lines.push("");
  lines.push(`- Inversión total en publicidad: **${fmtMoney(summary.cost, currency)}**`);
  lines.push(`- Ventas atribuidas a publicidad: **${fmtMoney(summary.totalAmount, currency)}**`);
  lines.push(`- ACOS general de la cuenta: **${fmtPct(summary.overallAcos)}**`);
  lines.push(`- ROAS general de la cuenta: **${fmtX(summary.overallRoas)}**`);
  lines.push(`- % de ventas explicadas por publicidad (vs. orgánicas): **${fmtPct(summary.revenueShareFromAds)}**`);
  lines.push(`- Clicks: ${summary.clicks.toLocaleString("es-AR")} · Impresiones: ${summary.prints.toLocaleString("es-AR")} · Unidades vendidas: ${summary.unitsQuantity.toLocaleString("es-AR")}`);
  if (productAnalysis && productAnalysis.withCost.length > 0) {
    lines.push(`- Ganancia real (antes de Monotributo y otros gastos fijos, después de costo de producto, comisión ML, envío y ads) sobre ${productAnalysis.withCost.length} productos con costo cargado: **${fmtMoney(productAnalysis.totalRealProfit, currency)}**`);
  } else {
    lines.push(`- Ganancia real: **sin calcular todavía** (falta cargar costos en \`config/costos.csv\`)`);
  }
  if (stockAnalysis && stockAnalysis.proven.length > 0) {
    lines.push(`- ⚠️ Productos con historial de venta pero sin stock ahora mismo: **${stockAnalysis.proven.length}** (${fmtMoney(stockAnalysis.totalRevenueAtRisk, currency)} en ventas por publicidad en el período)`);
  }
  if (billingAnalysis) {
    lines.push(`- Percepciones de Ingresos Brutos del último período facturado: **${fmtMoney(billingAnalysis.totalIibb, currency)}**`);
  }

  lines.push("");
  lines.push(renderBillingSection(billingAnalysis, currency));

  if (stockAnalysis) {
    lines.push("");
    lines.push(renderStockGapsSection(stockAnalysis, currency));
  }

  lines.push("");
  lines.push(renderProductProfitabilitySection(productAnalysis, currency));

  const actionable = campaignAnalyses.filter((c) => !["mantener", "pausada", "monitorear"].includes(c.action));
  lines.push("");
  lines.push("## Próximos movimientos de campaña (presupuesto y puja)");
  lines.push("");
  lines.push(
    `_Estas acciones se basan en ${hasMarginData ? "tu margen cargado en `config/margins.json`" : "el ROAS objetivo de cada campaña"} y en cuántas subastas perdiste por presupuesto o competencia — son ajustes tácticos, no reemplazan el análisis de ganancia real de arriba._`
  );
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

  const needsCosts = !productAnalysis || productAnalysis.missingCost.length > 0;
  const needsGastosFijos = !cascade || cascade.cuotaMonotributo == null;
  if (needsCosts || needsGastosFijos) {
    lines.push("");
    lines.push("## Qué necesito de vos");
    lines.push("");
    if (needsCosts) {
      lines.push(
        "- Para calcular la **ganancia real** (no solo ACOS/ROAS) necesito el costo de tus productos. Completá la columna `costo_producto` en `config/costos.csv` (y `envio_extra` si vos pagás parte del envío, por ejemplo con Flex o Colecta) y volvé a correr `npm run report`. Si un producto queda igual marcado como \"sin costo\" después de eso, completá también `comision_pct` para ese producto — es el % que Mercado Libre te cobra por venderlo, lo ves en tu panel en \"Costos por vender\"."
      );
    }
    if (needsGastosFijos) {
      lines.push(
        "- Para llegar a la **Ganancia Neta Real** (no solo la ganancia antes de gastos fijos) necesito tu cuota de Monotributo y, si querés, otros gastos fijos (consultora, herramientas). Copiá `config/gastos-fijos.example.json` a `config/gastos-fijos.json`, completalo y volvé a correr `npm run report`."
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(
    "_Informe generado automáticamente por el agente de publicidad y rentabilidad de Voltix a partir de la API de Mercado Ads. Verificá los números clave en el panel de Mercado Ads antes de tomar decisiones de alto impacto._"
  );

  return lines.join("\n");
}
