import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
export const gastosFijosPath = path.join(rootDir, "config", "gastos-fijos.json");
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
