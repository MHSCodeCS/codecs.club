#!/usr/bin/env node
/**
 * Prepares the in-browser Python runtime under public/ (git-ignored):
 *
 * 1. Copies the Pyodide core from node_modules/pyodide into
 *    public/pyodide/<version>/, so the app serves it from its own origin
 *    (school networks may block CDNs). Optional packages still load from the
 *    matching jsDelivr release on demand.
 * 2. Bundles lib/python/python.worker.ts into public/python/worker.js as an ES
 *    module worker. Pyodide refuses classic workers, and Next's bundler starts
 *    workers as classic scripts, so the worker is built here instead.
 *
 * Runs before `dev` and `build`. After editing the worker (or anything it
 * imports) during `npm run dev`, run `npm run python:build` and reload.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function copyPyodide() {
  const source = join(root, "node_modules", "pyodide");
  const { version } = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  const target = join(root, "public", "pyodide", version);
  const files = [
    "pyodide.mjs",
    "pyodide.asm.mjs",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
  ];
  mkdirSync(target, { recursive: true });
  let copied = 0;
  for (const file of files) {
    const from = join(source, file);
    const to = join(target, file);
    if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
    copyFileSync(from, to);
    copied++;
  }
  console.log(
    copied === 0
      ? `Pyodide ${version} runtime already in public/pyodide/${version}.`
      : `Copied ${copied} Pyodide ${version} file(s) to public/pyodide/${version}.`,
  );
}

async function bundleWorker() {
  await build({
    entryPoints: [join(root, "lib", "python", "python.worker.ts")],
    outfile: join(root, "public", "python", "worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: process.env.NODE_ENV === "production" || process.argv.includes("--minify"),
    sourcemap: true,
    tsconfig: join(root, "tsconfig.json"),
    logLevel: "warning",
  });
  console.log("Bundled the Python worker to public/python/worker.js.");
}

copyPyodide();
await bundleWorker();
