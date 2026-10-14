# Development Setup and Deployment

[Documentation index](README.md). Inspected **October 14, 2026** using local files and read-only Convex MCP calls; no cloud data changed.

## Verified setup

| Item | Evidence/status |
| --- | --- |
| Website | Starter page/default metadata; application pages not implemented |
| Installed packages | Next.js 16.4.0, React 19.3.0, Convex 1.46.0 |
| Convex project | Team `code-cs`, project `app`; local configuration selects cloud development |
| Development | [tidy-firefly-410](https://dashboard.convex.dev/d/tidy-firefly-410); status, tables, and function metadata calls succeeded |
| Application backend | No dev tables/functions returned; generated SDK/guidance exists, application schema/auth/functions do not |
| Production | [moonlit-alpaca-771](https://dashboard.convex.dev/d/moonlit-alpaca-771); listed with restricted read-only MCP access |
| Domain/frontend hosting | Not provisioned, as confirmed by the user |

Production data was not inspected. Listing production does not prove the app is released or its data matches development. Developer CLI login does not implement student/admin login.

## Local development

From the repository root, install dependencies with `npm install`. Run these in separate terminals:

```powershell
npm run dev
```

```powershell
npx convex dev
```

The frontend normally opens at [localhost:3000](http://localhost:3000). The ignored `.env.local` selects `dev:tidy-firefly-410`. `convex dev` watches and syncs backend code to that development deployment; it is not read-only.

This is local code with a **cloud development database**. An actual local Convex database is optional, needs its backend process running, and has separate data. Local/dev/prod do not mirror automatically. No actual local backend was verified.

Verify deployment targets before operations. Do not commit credentials/environment files. Keep dev/prod environment values separate.

## Managed release direction

- External website hosting and Convex Cloud; frontend provider and domain ownership/setup remain pending.
- Prioritize browser Python; a Python server is only a fallback after device tests demonstrate a need.
- Verify hosting headers, worker/assets, package requests, slides, auth origins, and school-network access before release.
- Configure deployed frontend values for the intended backend, not a copied development URL.
- No separate custom backup system is approved.
- Validate **50 actively working students plus admins** and retained work for **1,000 lifetime students**. Storage/API estimates depend on file/version volumes, not student count alone.

## Baseline tooling

`eslint-config-next` is pinned to 16.4.0 to match Next.js. The previous 14.2.35 package did not support the existing flat configuration imports. `npm run lint` now passes without errors or warnings; generated Convex SDK files are ignored.

Route type generation and TypeScript checking pass. `npm run typecheck` runs both in order so generated `LayoutProps` exists before checking. The Windows sandbox previously blocked SWC workspace canonicalization with `Access is denied (os error 5)`; route generation and the build passed outside that sandbox.

Dependencies were checked against the registry. ESLint is 10.12.0; TypeScript is 6.0.3 because the installed lint parser rejects TypeScript 7. Node type definitions are 24.19.2 to match the installed Node 24 runtime. Next.js supports ESLint 10, but some bundled plugins still declare older peer ranges, so npm emits peer dependency warnings.

A clean `npm ci` attempt was blocked by Windows refusing to replace a locked `node_modules/@esbuild/win32-x64/esbuild.exe` (EPERM). Dependencies were restored from npm's local cache and lint/typecheck rerun. Close processes using that executable before retrying a clean install.

`npm audit` reports five high-severity findings from one transitive `braces` dependency chain in the lint tooling. The latest published braces version is 3.0.3 and remains affected by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). npm's suggested config downgrade returns to the incompatible 14.2.35 package. Recheck for an upstream fix before release.

```powershell
npm run lint
npm run typecheck
npm run build
```

The starter production build passes. A product browser walkthrough, Chromebook test, and load test have not been performed. These tooling checks do not establish implementation of the planned product features.

## Contributor guidance

Read [AGENTS.md](../AGENTS.md). Before Next.js implementation read relevant guides in `node_modules/next/dist/docs/`; before Convex implementation read `convex/_generated/ai/guidelines.md` and applicable project skills. Identify deployments before writes and follow the project's deployment guard for production operations. Production mutation access is not enabled in the current MCP connection.

## Official references

[CLI setup](https://docs.convex.dev/cli/overview), [MCP access](https://docs.convex.dev/ai/convex-mcp-server), [local deployments](https://docs.convex.dev/cli/local-deployments), [frontend hosting](https://docs.convex.dev/production/hosting), [authentication](https://docs.convex.dev/auth/overview), [file storage](https://docs.convex.dev/file-storage/overview), [Convex runtimes](https://docs.convex.dev/functions/runtimes).

Recheck exact integration versions and provider plans at implementation/deployment time.
