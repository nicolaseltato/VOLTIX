#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadConfig } from "../src/config.js";
import {
  generatePkcePair,
  buildAuthorizationUrl,
  exchangeCodeForToken,
} from "../src/oauth.js";

async function main() {
  const config = loadConfig();
  const state = randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const authUrl = buildAuthorizationUrl(config, { state, codeChallenge });

  console.log("\n1. Abrí esta URL en tu navegador, logueado como ADMINISTRADOR de la cuenta de Voltix (no un colaborador):\n");
  console.log(authUrl);
  console.log(
    `\n2. Autorizá la aplicación. Vas a ser redirigido a algo como:\n   ${config.redirectUri}?code=XXXXXXXX&state=${state}\n`
  );
  console.log(
    "3. Aunque esa página no cargue (redirect_uri de prueba), copiá el valor del parámetro `code` de la URL.\n"
  );

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const receivedState = await rl.question("Pegá el valor de `state` que recibiste (para validar): ");
  const code = await rl.question("Pegá el `code` recibido: ");
  rl.close();

  if (receivedState.trim() !== state) {
    throw new Error(
      "El `state` recibido no coincide con el generado. Por seguridad, abortamos. Volvé a correr `npm run authorize`."
    );
  }

  const credentials = await exchangeCodeForToken(config, {
    code: code.trim(),
    codeVerifier,
  });

  console.log(
    `\nListo. Token guardado en .credentials.json para el usuario ${credentials.user_id} (scope: ${credentials.scope}).`
  );
  console.log("Ya podés correr `npm run report` para generar el informe de campañas.");
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
