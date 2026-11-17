# Python Workspace and Assistance

[Documentation index](README.md). Browser execution is prioritized. As of October 15, 2026 the workspace runs Python with **Pyodide 314.0.7** in a Web Worker (see [roadmap Phase 4](roadmap.md#phase-4--python-runtime-built)); it has not yet been verified on a school Chromebook or school network.

## Python workspace requirements

- Python is the only assignment language.
- Support multiple files, file import/upload and export/download, Python imports, libraries, and pip package installation.
- Persist assignment files and required environment information so resume is meaningful.
- Show package installation progress and failures separately from program output and check results.
- Stop execution must remain available for long-running or infinite-loop programs.
- Execution, package installation, and output checking must not interfere with other students' work.
- The execution design must support these approved capabilities. Package scope is introductory basic and advanced Python learning; the runtime integration remains to be validated.

### Introductory library scope

- Prioritize Python language fundamentals and lightweight standard-library use for both curricula.
- Default lesson support includes basic mathematics and number handling (`math`, `random`, `statistics`, `decimal`, and `fractions`), collection/iteration helpers (`collections` and `itertools`), and simple data/file exercises (`json` and `csv`). Validate these modules in the selected browser runtime during implementation.
- Choose additional small packages only when an actual lesson or project needs them; load them on demand rather than adding them to every student's startup.
- Advanced means first-time learning of more advanced Python concepts, not a requirement for large scientific, machine-learning, or GPU environments.
- Keep package installation available for compatible packages, with clear unsupported-package errors. Do not promise unrestricted native desktop pip behavior in the browser.
- Use implementation discretion within this lightweight scope; a new large library requirement should be discussed before changing the execution architecture.

### Browser execution priority and Chromebook requirements

- Prioritize Python execution on the student's computer through the web app without a local Python installation, extension, or Linux environment.
- Keep execution off the editor/UI thread so loops do not freeze navigation, autosave, assistance, or Stop.
- Load the runtime only when needed and avoid loading large optional libraries for basic exercises.
- Batch and limit output rendering so repeated printing does not overwhelm low-power devices.
- Keep database persistence independent of runtime memory: restarting or stopping Python must not erase saved files or submission history.
- Provide runtime-loading, ready, running, stopped, and unavailable states, with useful errors for blocked runtime/package requests.
- Test cold startup, repeated runs, stop behavior, file tools, package loading, and assistance on an actual school Chromebook and its school network before declaring the approach suitable.
- Package compatibility must be validated against the curriculum. Browser installation support must not be described as unrestricted desktop pip compatibility.
- Admin-initiated runs must still work with browser execution. For a connected student, execution commands and output must reach the appropriate shared workspace. Do not silently require a student's closed browser to execute code; admin-side execution of saved work needs a defined runtime path during implementation.

Pyodide is integrated (Phase 4): execution in a module Web Worker, package installation through micropip, Stop through the interrupt buffer with a worker-restart fallback, and input() through shared memory. The core runtime is served from the app’s own origin; optional packages come from the matching jsDelivr release, so school networks must allow `cdn.jsdelivr.net` (and PyPI for micropip) for anything beyond the standard library. Device/network tests (V02) still decide whether this is suitable.

For infinite-loop exercises, evaluate the required output over a bounded run of up to **1,000 loop iterations** rather than waiting for natural program exit. Matching the exercise's expected repeated output within that observation window counts as correct; stopping at the iteration limit must not itself cause an incorrect result. This is an iteration limit, not a 1,000-character output limit. Stopping must preserve code and output already produced, and the UI must distinguish the check's intentional stop from an execution error. Implemented in Phase 5; see [infinite-loop checks](curriculum-and-assignments.md#infinite-loop-checks).

Output matching is sufficient for the intended middle-school exercises; checking does not require an anti-cheating system. Observing 1,000 iterations is bounded evidence, not proof that arbitrary code will run forever. Straightforward infinite-loop patterns may be recognized where their behavior can be established, but the implementation must not claim universal infinite-loop verification. Count output lines separately from loop iterations: one iteration may print zero, one, or multiple lines.

## Assistance contract

- An admin joins directly with notification (“Max joined”: the admin's first name, never a title), without waiting for student acceptance.
- Admin/student edits are simultaneous, with labeled admin cursors and visible connection state.
- There is no assigned seating (D14). The Assistance screen shows the help queue (student names, longest wait first), online/idle/offline counts, the class listed by last name, and the selected student's live copy; on a phone the selected student opens as a full-screen sheet.
- View, edit, Run, and guidance are available from the admin dashboard; the Help action alerts admins with student/assignment context.
- Distinguish code synchronization, save acknowledgment, presence, and execution state. Stale presence must not imply live assistance.
- Reconnects/restores must reconcile work rather than silently overwrite newer edits. Ending assistance preserves work and guidance.
- Remote Run identifies the executed code version and initiating admin. Late output must not look like output for newer code.
- A student's closed browser cannot execute commands. Admin-side execution of saved work is a possible implementation path, but routing and shared output still require validation; shared files do not automatically imply shared runtime memory.

## Stop and technical references

Implemented: the site sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on every page (client-side navigation keeps the first page’s headers), so the worker can share an interrupt buffer and a stdin buffer with the page. Stop interrupts cooperatively and restarts the worker if Python hasn’t stopped within 2 seconds; files live in Convex, so a restart only clears variables, and the output says so. Browsers without `credentialless` support (Safari) fall back to restart-only Stop and no input(). These mechanisms do not replace actual Chromebook/network tests.

[Workers](https://pyodide.org/en/stable/usage/webworker.html), [interrupts](https://pyodide.org/en/stable/usage/keyboard-interrupts.html), [package compatibility](https://micropip.pyodide.org/en/stable/project/usage.html), [worker termination](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate).

See [engineering verification](decisions-and-verification.md) for busy runtime, nested-loop counting, reconnect, package, and remote execution checks. Evaluation/submission rules are defined in [curriculum and assignments](curriculum-and-assignments.md).
