# Code CS

A provider-hosted Python learning workspace replacing Colab for two persistent groups: basic and advanced. It is run by high school students (the admins) for younger students; the basic program runs 6 weeks, one lesson a week. Students use persistent name codes; admins manage lessons, assignments, review, and remote assistance, from a Chromebook or a phone.

## Status

Phases 1–10 of the [roadmap](docs/roadmap.md) are built: student and admin sign-in, the Python workspace with autosave and immutable submission snapshots, guided checks, curriculum authoring and publication, roster imports and login tickets, class lifecycles and enrollment history, review decisions, live collaborative assistance and shared runs, and admin account management. Turn-in never closes. Assistance lists students by last name without assigned seating, student-visible attribution uses admins’ first names, and the basic program runs for six weeks. Admin navigation, roster, review and assistance support phone layouts.

## Documentation

Start at the [documentation index](docs/README.md). Specifications are split by student experience, admin dashboard, assignments, Python/assistance, data/access, UI, deployment, roadmap, and decisions/verification.

## Development

First-time setup (Convex login, auth keys, admin account, sample data) is in [deployment](docs/deployment.md#first-time-setup). Day to day, run these in separate terminals:

```bash
npx convex dev
```

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). `convex dev` watches and syncs backend code to the selected dev deployment; it is not read-only. Do not commit environment files or credentials.

## Checks and contributor guidance

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass as of October 28, 2026; details are in [decisions and verification](docs/decisions-and-verification.md).

Read [AGENTS.md](AGENTS.md). Before Next.js changes, read the relevant installed guide in `node_modules/next/dist/docs/`. Before Convex changes, read `convex/_generated/ai/guidelines.md` and applicable skills.

No domain or frontend hosting is provisioned. Managed hosting and browser Python are the agreed direction; see [deployment](docs/deployment.md).
