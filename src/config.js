import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Habilita que fetch respete HTTP_PROXY/HTTPS_PROXY del sistema. Se hace acá (en JS,
// leído por undici al primer fetch) en vez de como prefijo en los scripts de
// package.json, porque la sintaxis VAR=1 comando no funciona en PowerShell/cmd de
// Windows — así el mismo "npm run authorize" / "npm run report" funciona en
// Windows, Mac y Linux sin diferencias.
process.env.NODE_USE_ENV_PROXY ??= "1";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(rootDir, ".env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
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
export const gastosPath = path.join(rootDir, "config", "gastos.json");
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
