# Code CS

A provider-hosted Python learning workspace replacing Colab for two persistent groups: basic and advanced. It is run by high school students (the admins) for younger students; the basic program runs 6 weeks, one lesson a week. Students use persistent name codes; admins manage lessons, assignments, review, and remote assistance, from a Chromebook or a phone.

## Status

Phases 1, 3, 4, 5 and 6 of the [roadmap](docs/roadmap.md) are built: the design system from the approved **CodeCS Basic v2** design, every student and admin route, the Convex schema, sign-in (student login codes and admin passwords via Convex Auth), and the student workspace with a CodeMirror editor, autosave, version history, Python that runs in the browser (Pyodide: Run, Stop, `input()`, packages), guided checks that compare output with the task (whitespace ignored, partial completion, endless loops watched for 1,000 rounds), and turn-in: saved snapshots as attempts, resubmission before review, and no due date (turn-in never closes). The learning home, lesson day, admin roster/attendance, curriculum scheduling and Review (queue, submitted snapshot, expected vs actual, optional feedback and private notes, Mark reviewed) read live Convex data. My work, the assignment editor and assistance still show sample data behind a “Preview” banner. Live assistance (Phase 9) is not built yet. The admin area works on phones as well as the 1366×768 Chromebook layout.

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
