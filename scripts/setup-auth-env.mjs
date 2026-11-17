#!/usr/bin/env node
/**
 * Sets the Convex Auth environment variables on the deployment selected by
 * .env.local (JWT_PRIVATE_KEY, JWKS, SITE_URL). Keys are generated locally
 * with jose and passed to `npx convex env set` without touching disk.
 *
 *   node scripts/setup-auth-env.mjs [--site-url http://localhost:3000] [--force]
 *
 * Existing keys are kept unless --force is given, because rotating them signs
 * everyone out.
 */
import { spawnSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const args = process.argv.slice(2);
const force = args.includes("--force");
const siteUrlIndex = args.indexOf("--site-url");
const siteUrl = siteUrlIndex >= 0 ? args[siteUrlIndex + 1] : "http://localhost:3000";

function convex(...convexArgs) {
  const result = spawnSync("npx", ["convex", ...convexArgs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`npx convex ${convexArgs[0]} ${convexArgs[1]} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function isSet(name) {
  const result = spawnSync("npx", ["convex", "env", "get", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

if (!force && isSet("JWT_PRIVATE_KEY") && isSet("JWKS")) {
  console.log("JWT_PRIVATE_KEY and JWKS are already set; keeping them (use --force to rotate).");
} else {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] });
  convex("env", "set", `JWT_PRIVATE_KEY=${privateKey}`);
  convex("env", "set", `JWKS=${jwks}`);
  console.log("Set JWT_PRIVATE_KEY and JWKS.");
}

convex("env", "set", `SITE_URL=${siteUrl}`);
console.log(`Set SITE_URL=${siteUrl}.`);
