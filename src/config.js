import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(rootDir, ".env");

// process.loadEnvFile() NO pisa variables que ya existan en el entorno. Algunos
// entornos (este incluido) precargan variables placeholder (ej. "tu_app_id") a
// partir de .env.example, que de otra forma tapan los valores reales del .env
// del proyecto. El .env del proyecto es la fuente de verdad: siempre gana.
if (existsSync(envPath)) {
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá .env.example a .env y completá los valores.`
    );
  }
  return value;
}

export const rootPath = rootDir;
export const credentialsPath = path.join(rootDir, ".credentials.json");
export const marginsPath = path.join(rootDir, "config", "margins.json");
export const reportsDir = path.join(rootDir, "reports");

export function loadConfig() {
  return {
    appId: required("ML_APP_ID"),
    clientSecret: required("ML_CLIENT_SECRET"),
    redirectUri: required("ML_REDIRECT_URI"),
    siteId: process.env.ML_SITE_ID || "MLA",
    productId: process.env.ML_PRODUCT_ID || "PADS",
  };
}
