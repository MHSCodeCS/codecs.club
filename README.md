# Code CS

A provider-hosted Python learning workspace replacing Colab for two persistent groups: basic and advanced. Students use persistent name codes; admins manage lessons, assignments, review, and remote assistance.

## Documentation

Start at the [documentation index](docs/README.md). Specifications are split by student experience, admin dashboard, assignments, Python/assistance, data/access, UI, deployment, and pending decisions/verification.

The website remains a Next.js starter. Convex cloud development is connected, but application tables, functions, authentication, and learning features are not implemented. See [verified setup](docs/deployment.md).

## Development

```powershell
npm install
npm run dev
```

In a second terminal, with this project's development deployment selected:

```powershell
npx convex dev
```

Open [localhost:3000](http://localhost:3000). Convex watches and syncs backend code to the selected dev deployment; this command is not read-only. Do not commit environment files or credentials. This setup uses local code with a cloud development database.

## Checks and contributor guidance

Available scripts are `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run start` (after a build). Lint, route type generation, TypeScript checking, and the starter production build pass. Dependency audit findings and environment limits are in [decisions and verification](docs/decisions-and-verification.md); product features remain unimplemented.

Read [AGENTS.md](AGENTS.md). Before Next.js changes, read the relevant installed guide in `node_modules/next/dist/docs/`. Before Convex changes, read `convex/_generated/ai/guidelines.md` and applicable skills.

No domain or frontend hosting is provisioned. Managed hosting and browser Python are the agreed direction; see [deployment](docs/deployment.md).
