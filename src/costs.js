import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rootPath } from "./config.js";

export const costsPath = path.join(rootPath, "config", "costos.csv");

function parseCsvLine(line) {
  // Soporta celdas entre comillas con comas adentro (para títulos de producto).
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.filter((l) => l.trim().length > 0).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

// Devuelve null si el archivo todavía no existe (hay que generarlo/completarlo primero).
export function loadCosts() {
  if (!existsSync(costsPath)) return null;
  const rows = parseCsv(readFileSync(costsPath, "utf8"));
  const byItemId = new Map();
  for (const row of rows) {
    if (!row.item_id) continue;
    const cogsRaw = (row.costo_producto ?? "").trim();
    const comisionRaw = (row.comision_pct ?? "").trim();
    byItemId.set(row.item_id, {
      cogs: cogsRaw ? Number(cogsRaw) : null,
      extraShipping: row.envio_extra ? Number(row.envio_extra) : 0,
      comisionPct: comisionRaw ? Number(comisionRaw) : null,
    });
  }
  return byItemId;
}

function escapeCsvCell(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Crea config/costos.csv precargado con los productos reales que están corriendo en
// Mercado Ads, para que el vendedor solo tenga que escribir el costo, no armar el archivo.
//
// El precio mostrado es el precio REAL vigente (con descuento individual del vendedor
// aplicado, si tiene uno activo), no el precio de lista tachado. Para productos sin
// stock ahora mismo (status "hold"), el precio actual puede no reflejar a qué precio
// se vendió mientras SÍ tenía stock (por ejemplo si tenía un descuento que ya venció) —
// en esos casos usamos el precio promedio real de venta del período en su lugar. Esto es
// solo el valor de referencia que se muestra en la planilla: el cálculo de ganancia real
// siempre usa el precio real de venta (ingresos ÷ unidades), nunca esta columna.
export async function generateCostsTemplate(items, discountsClient) {
  const header = "item_id,titulo,precio_real,costo_producto,envio_extra,comision_pct,notas";
  const seen = new Set();
  const rows = [];
  let lookupFailures = 0;
  for (const item of items) {
    if (seen.has(item.item_id)) continue;
    seen.add(item.item_id);

    const units = item.metrics?.units_quantity ?? 0;
    const avgSoldPrice = units > 0 ? (item.metrics.total_amount ?? 0) / units : null;

    let price = item.price ?? "";
    let notas = "";

    if (item.status === "hold" && avgSoldPrice != null) {
      price = Math.round(avgSoldPrice * 100) / 100;
      notas = "sin stock — precio promedio real de venta del período (no el de lista, puede haber cambiado)";
    } else if (discountsClient) {
      try {
        const { currentPrice, hasActiveDiscount } = await discountsClient.getCurrentPrice(item.item_id);
        if (currentPrice != null) price = currentPrice;
        if (hasActiveDiscount) notas = "tiene descuento activo";
      } catch {
        lookupFailures++;
      }
    }

    rows.push([item.item_id, escapeCsvCell(item.title), price, "", "", "", notas].join(","));
  }
  writeFileSync(costsPath, [header, ...rows].join("\n") + "\n", "utf8");
  return { count: rows.length, lookupFailures };
}
