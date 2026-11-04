/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test";
import presence from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import schema from "./schema";

export const modules = import.meta.glob("./**/*.ts");

/** A fresh in-memory Convex backend with the app's components registered. */
export function setupConvex() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  presence.register(t);
  return t;
}

/** Convex Auth needs signing keys to issue tokens; generate throwaway ones. */
export async function setAuthEnv() {
  const keys = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
  process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] });
  process.env.SITE_URL = "http://localhost:3000";
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
}
