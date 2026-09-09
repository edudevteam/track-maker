# Track Maker — working notes

Client-side CAD tool for designing 3D-printable car track. See `README.md` for
what it does and `CHANGELOG.md` for the history and the open dimension questions.

## Every change follows this loop

1. **Read `CHANGELOG.md` first.** It records what already exists and which
   dimensions are still unconfirmed. Extend what is there rather than rebuilding.
2. **Confirm before landing.** Check changes with the project owner rather than
   assuming.
3. **Bump the version.** Every prompt that changes the project is one patch:
   `pnpm version:bump`. Patch and minor both cap at 20 and roll over
   (`1.0.20` + patch → `1.1.0`; `1.20.20` + patch → `2.0.0`). Pass `minor` or
   `major` to force a larger step for a breaking or milestone change;
   `--dry-run` previews. The rule lives in `scripts/bump-version.mjs`.
4. **Add one `CHANGELOG.md` entry** under a new `## [x.y.z] — YYYY-MM-DD`
   heading, in user-facing terms — parts, tools, physics, UI — not function
   names. Group under `### Added` / `### Changed` / `### Fixed` / `### Removed`.
5. **Clear `.claude/changelog-pending.md`** to an empty string before stopping.

## Processes

Never leave a server or background process running. If a dev or preview server is
started for a check, kill it and confirm the port is closed before finishing.

## Geometry changes

Anything under `src/geometry/` must stay watertight and dimensionally correct.
Run the audit after touching it — it checks signed volume against the analytic
cross-section area × sweep length, bounding boxes, and that every edge is shared
by exactly two triangles:

```bash
npx vite build --ssr scripts/verify-geometry.ts --outDir /tmp/vg --config /dev/null
node /tmp/vg/verify-geometry.js
```

It has already caught two real defects that looked fine on screen. Treat a
non-zero non-manifold edge count or a volume that misses the analytic value as a
bug, not noise.

Dimensions are millimetres. Every track and connector dimension is a runtime
parameter in `src/geometry/dimensions.ts`, editable from the Dims panel — prefer
adding a parameter over hardcoding a value.

## Stack

Vite 6 + React 18 + TypeScript, pnpm, Tailwind v4, three.js via
react-three-fiber, zustand. `pnpm typecheck` and `pnpm build` must both pass.
