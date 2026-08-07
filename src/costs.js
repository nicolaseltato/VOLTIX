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
    byItemId.set(row.item_id, {
      cogs: cogsRaw ? Number(cogsRaw) : null,
      extraShipping: row.envio_extra ? Number(row.envio_extra) : 0,
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
export function generateCostsTemplate(items) {
  const header = "item_id,titulo,precio,costo_producto,envio_extra,notas";
  const seen = new Set();
  const rows = [];
  for (const item of items) {
    if (seen.has(item.item_id)) continue;
    seen.add(item.item_id);
    rows.push(
      [item.item_id, escapeCsvCell(item.title), item.price ?? "", "", "", ""].join(",")
    );
  }
  writeFileSync(costsPath, [header, ...rows].join("\n") + "\n", "utf8");
  return rows.length;
}
