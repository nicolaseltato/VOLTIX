#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { loadConfig, rootPath } from "../src/config.js";
import {
  generatePkcePair,
  buildAuthorizationUrl,
  exchangeCodeForToken,
} from "../src/oauth.js";

// Este flujo se ejecuta en dos pasos porque no hay una terminal interactiva compartida:
// 1) `node bin/authorize.js`                     -> genera el link para abrir en el navegador
// 2) `node bin/authorize.js --code=X --state=Y`   -> intercambia el code por el access_token
const pendingPath = path.join(rootPath, ".oauth-pending.json");

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value;
  }
  return args;
}

async function startFlow(config) {
  const usePkce = process.env.SKIP_PKCE !== "1";
  const state = randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const authUrl = buildAuthorizationUrl(config, { state, codeChallenge, usePkce });

  writeFileSync(
    pendingPath,
    JSON.stringify({ state, codeVerifier: usePkce ? codeVerifier : null }, null, 2),
    { mode: 0o600 }
  );

  console.log("\n1. Abrí esta URL en tu navegador, logueado como ADMINISTRADOR de la cuenta de Voltix (no un colaborador):\n");
  console.log(authUrl);
  console.log(
    `\n2. Autorizá la aplicación. Tu navegador va a intentar ir a una URL como:\n   ${config.redirectUri}?code=XXXXXXXX&state=${state}\n`
  );
  console.log(
    "3. Es normal que esa página no cargue nada (es solo la URL de retorno). Copiá el `code` de esa barra de direcciones y pasámelo.\n"
  );
  console.log("Después corré: node bin/authorize.js --code=EL_CODE_QUE_COPIASTE\n");
}

async function finishFlow(config, { code, state }) {
  if (!existsSync(pendingPath)) {
    throw new Error(
      "No encontré una autorización en curso. Corré primero `node bin/authorize.js` (sin argumentos) para generar el link."
    );
  }
  const pending = JSON.parse(readFileSync(pendingPath, "utf8"));

  if (state && state !== pending.state) {
    throw new Error(
      "El `state` recibido no coincide con el generado. Por seguridad, abortamos. Volvé a correr `node bin/authorize.js` desde cero."
    );
  }

  const credentials = await exchangeCodeForToken(config, {
    code,
    codeVerifier: pending.codeVerifier,
  });

  unlinkSync(pendingPath);

  console.log(
    `\nListo. Token guardado en .credentials.json para el usuario ${credentials.user_id} (scope: ${credentials.scope}).`
  );
  console.log("Ya podés correr `npm run report` para generar el informe.");
}

async function main() {
  const config = loadConfig();
  const { code, state } = parseArgs(process.argv.slice(2));

  if (code) {
    await finishFlow(config, { code, state });
  } else {
    await startFlow(config);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
