import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { credentialsPath } from "./config.js";

// Dominio de autorización por site_id. Referencia: developers.mercadolibre.com
const AUTH_DOMAINS = {
  MLA: "auth.mercadolibre.com.ar",
  MLB: "auth.mercadolivre.com.br",
  MLM: "auth.mercadolibre.com.mx",
  MLC: "auth.mercadolibre.cl",
  MCO: "auth.mercadolibre.com.co",
  MPE: "auth.mercadolibre.com.pe",
  MLU: "auth.mercadolibre.com.uy",
  MLV: "auth.mercadolibre.com.ve",
  MPA: "auth.mercadolibre.com.pa",
  MCR: "auth.mercadolibre.co.cr",
  MEC: "auth.mercadolibre.com.ec",
  MGT: "auth.mercadolibre.com.gt",
  MHN: "auth.mercadolibre.com.hn",
  MNI: "auth.mercadolibre.com.ni",
  MPY: "auth.mercadolibre.com.py",
  MRD: "auth.mercadolibre.com.do",
  MSV: "auth.mercadolibre.com.sv",
  MBO: "auth.mercadolibre.com.bo",
};

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePkcePair() {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(
    createHash("sha256").update(codeVerifier).digest()
  );
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizationUrl(config, { state, codeChallenge }) {
  const domain = AUTH_DOMAINS[config.siteId];
  if (!domain) {
    throw new Error(
      `No conozco el dominio de autorización para el site_id "${config.siteId}". Agregalo a AUTH_DOMAINS en src/oauth.js.`
    );
  }
  const url = new URL(`https://${domain}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function postForm(params) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const body = await response.json();
  if (!response.ok) {
    const detail = body.error_description || body.message || JSON.stringify(body);
    throw new Error(`Error de OAuth (${response.status}): ${detail}`);
  }
  return body;
}

export async function exchangeCodeForToken(config, { code, codeVerifier }) {
  const body = await postForm({
    grant_type: "authorization_code",
    client_id: config.appId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });
  return persistTokenResponse(body);
}

export async function refreshAccessToken(config, refreshToken) {
  const body = await postForm({
    grant_type: "refresh_token",
    client_id: config.appId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
  return persistTokenResponse(body);
}

function persistTokenResponse(body) {
  const expiresAt = Date.now() + body.expires_in * 1000;
  const credentials = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    user_id: body.user_id,
    scope: body.scope,
    expires_at: expiresAt,
  };
  writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
  return credentials;
}

export function loadStoredCredentials() {
  if (!existsSync(credentialsPath)) {
    return null;
  }
  return JSON.parse(readFileSync(credentialsPath, "utf8"));
}

// Devuelve un access_token válido, renovándolo automáticamente si está por vencer.
export async function getValidAccessToken(config) {
  const credentials = loadStoredCredentials();
  if (!credentials) {
    throw new Error(
      "No hay credenciales guardadas. Corré primero `npm run authorize`."
    );
  }
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() < credentials.expires_at - fiveMinutes) {
    return credentials.access_token;
  }
  const refreshed = await refreshAccessToken(config, credentials.refresh_token);
  return refreshed.access_token;
}
