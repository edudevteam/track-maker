# Changelog

All notable changes to Track Maker are recorded here.

**Working agreement:** review this file before making changes, add an entry for every
change, and confirm changes with the project owner before they land.

**Versioning.** Every prompt that changes the project bumps the version by one
patch and adds one entry here. Patch and minor both roll over at 20:

- `1.0.20` + a patch → `1.1.0`
- `1.20.20` + a patch → `2.0.0`

Run `pnpm version:bump` to apply the rollover and update `package.json`; use
`pnpm version:bump minor` or `major` to force a larger step for a breaking or
milestone change. `pnpm version:bump --dry-run` previews without writing.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dimensions are millimetres throughout.

---

## [1.0.10] — 2026-09-09

### Changed

- A track dropped on the workplane now arrives bare — no clips on either end.
  A clip is fitted the moment that end is joined to another piece, whether the
  join comes from snapping a new piece onto a highlighted port or from the
  Connect tool, and it is taken away again when the pair is disconnected or the
  neighbour is deleted. Duplicated pieces come through bare as well.
  The per-end connector toggles in the part panel still let you force a clip
  onto a free end when you want to print one.

---

## [1.0.9] — 2026-09-09

### Added

- An axis indicator in the bottom-left corner of the viewport: three labelled
  arrows — red **X**, green **Y**, blue **Z** — that turn with the camera, so the
  current heading is readable without reading the orientation cube.

### Removed

- The coloured axis lines on the orientation cube. The cube now just names the
  faces; direction is the corner indicator's job.

---

## [1.0.8] — 2026-09-09

### Changed

- The orientation cube's red X axis now runs the full width of the front bottom
  edge, from the Front/Right/Bottom corner across to the Front/Left/Bottom
  corner, instead of poking out past the right side of the box.

### Removed

- The X / Y / Z letters on the orientation cube's axis tripod. The three
  coloured lines stand on their own — red across, green back, blue up.

---

## [1.0.7] — 2026-09-09

### Changed

- The orientation cube's axis tripod now hangs off the bottom corner shared by
  the Front and Right faces instead of the front-left one. Blue **Z** climbs the
  vertical edge between Front and Right, green **Y** runs back along the edge
  between Right and Bottom, and red **X** reaches out past the right side of the
  box. The red **X** letter sits back along its leg, just left of and below the
  line, so it stays beside the cube rather than floating away from it.

---

## [1.0.6] — 2026-09-09

### Changed

- The ground plane and the orientation cube now follow the Fusion viewport in
  `_plan/media/CAD-Tool-01-Full-CAD-View.png`.
- The grid is a bounded 2.4m square with a visible border instead of a plane
  fading away into nothing, drawn in paler greys on a near-white background,
  with 10mm cells and 100mm sections as before.
- Red and green axis lines run through the origin on the grid, in the CAD
  convention: **X red** left to right, **Y green** front to back, **Z blue**
  vertical.
- The orientation cube is a white-grey box with thin grey edges and a soft drop
  shadow, and it carries an X / Y / Z axis tripod at its near bottom corner in
  the same red / green / blue. The letters sit clear of the box.

---

## [1.0.5] — 2026-09-09

### Added

- Hovering a button in the Tools row now pops up a small tooltip naming the tool,
  showing its keyboard shortcut (Select V, Move G, Rotate R, Connect C,
  Disconnect X) and describing in one line what it does. It appears after a short
  pause, follows the light/dark theme, floats above the panel rather than being
  cut off at its edge, and also shows when the button is reached by keyboard.

---

## [1.0.4] — 2026-09-09

### Changed

- The Move tool's icon in the Tools row is now the four-way crosshair — arrows
  pointing up, down, left and right — instead of the 3D axes glyph, so it reads
  as "drag this in any direction" at a glance.

---

## [1.0.3] — 2026-09-09

### Changed

- Track width is now a typed number of lanes instead of the Single/2×/3×/4×
  buttons. It defaults to 1 and accepts any whole number of lanes up to 8.
- Straight length is now a typed number field, defaulting to 100mm and accepting
  20–1000mm. The 50 / 100 / 150 / 200 buttons stay as quick presets that fill the
  field. The heading reads "Straight · length (mm)" and the field carries an `mm`
  suffix, so the unit is stated where the number is entered.
- The orientation cube's edge lines are a lighter grey in both themes — still
  solid enough to read as a box, less heavy than the near-black outline.

---

## [1.0.2] — 2026-09-09

### Changed

- The orientation cube in the top-right of the viewport now reads as a solid
  object instead of a faint outline. Its edges are drawn as real lines with a
  constant on-screen thickness, the face labels are heavier, and the face and
  edge colours carry more contrast in both light and dark mode. Clicking faces,
  edges and corners to snap the camera works exactly as before.

---

## [1.0.1] — 2026-09-08

First working build. Client-side CAD tool for designing 3D-printable car track,
built from the brief in `Plan/Plan.md` and the Fusion screenshots in
`Plan/media/`.

### Changed

- Adopted the patch-per-prompt versioning scheme described above and set the
  baseline to 1.0.1. The next change starts at 1.0.2.

### Added

**Project scaffold**

- Vite 6 + React 18 + TypeScript, managed with pnpm.
- Tailwind CSS v4 via `@tailwindcss/vite`, with a token layer in `src/index.css`.
- Light and dark mode. Light is the default; the choice persists to `localStorage`
  and is applied before first paint by an inline script in `index.html` to avoid a
  flash of the wrong theme.

**Parametric geometry** (`src/geometry/`)

- `dimensions.ts` — every track and connector dimension as a named, editable
  parameter, each annotated with the drawing it came from. See *Dimension
  provenance* below.
- `sweep.ts` — sweeps a closed 2D profile along a straight or arc path. Each
  profile edge becomes its own vertex strip, so shading is smooth along the sweep
  and hard across profile corners, the way a CAD kernel renders it.
- `trackProfile.ts` — builds the track cross-section for any lane count. All
  values are clamped so a hand-edited dimension can never produce a
  self-intersecting polygon.
- `loft.ts` — lofts a stack of plan-view outlines into a solid with vertical
  bores. Varying the bore radius between levels is what makes the countersinks
  true cones rather than stepped counterbores.
- `parts.ts` — assembles track pieces, the connector clip, and the preview car.
- `cache.ts` — bounded LRU keyed on only the inputs that change a part's shape,
  so dragging a piece never re-lofts it.

**Track pieces**

- Straight pieces of any length. Connector ends keep their width regardless of
  length, so joins always fit.
- Rounded corners as arcs, with 15° / 30° / 45° / 90° presets and a
  free radius. Shift-click a preset for a right-hand turn.
- Widths of 1×, 2×, 3× and 4×, matching drawings 07 and 08: a wide piece is N
  single tracks side by side with the inner walls removed, leaving a flat channel
  floor between the two outer walls, and one underside T-slot per lane so a wide
  piece still clips to narrow neighbours.

**Assembly and tools**

- Select, Move, Rotate, Connect and Disconnect tools (`V`, `G`, `R`, `C`, `X`).
- "Snap to selected end" toggle. On, a new piece mates to the highlighted end;
  off, it lands loose away from the build, per the brief.
- Free pieces float in 3D space — nothing falls under gravity unless the car
  simulation is running.
- Every end carries a translucent grab tab, lighter than the track, that is the
  click target for Connect and Disconnect and shows which end a new piece will
  snap to.
- Move and rotate handles can be anchored to Side A, the Middle, or Side B of the
  selected piece.
- Dragging a joined piece carries its whole connected assembly, so joints cannot
  be torn apart by accident. Disconnect an end first to move a piece alone.
- Undo/redo (⌘Z / ⇧⌘Z), duplicate (⌘D), delete.
- Browser panel listing every body with per-piece visibility and lock.

**Print area preview**

- Wraps the assembly in printer-sized boxes, each with a build platform at its
  floor. A track that overflows one box picks up another, so the box count is a
  direct read of how many plates the design needs.
- Presets for Bambu P1/X1 (256³, default), Prusa MK4, Ender 3 and Bambu A1 mini,
  plus a custom size.
- Build size readout: footprint, height, piece count, plates needed.

**Export**

- OBJ, STL (binary) and 3MF, for the selection or the whole build, with or
  without connector clips.
- 3MF is written directly as an OPC package (content types, root relationship,
  model part) with one object and one base material per part, so per-part colour
  survives into a multi-material slicer.
- "Z up" option (on by default) rotates the model so parts land flat in a slicer.
- Vertices are welded on export so the 3MF mesh validates as a closed solid.

**Car simulation**

- A car that rides the connected centreline under gravity, with rolling friction,
  handing off between pieces at joints and stopping at an open end.
- Gravity and friction are adjustable.

**Viewport**

- Grid toggle (10mm cells, 100mm sections).
- Background modes: Theme, Sky, or a solid colour. Sky draws a gradient dome
  above the grid for contrast against the track, with Daylight / Dusk / Studio /
  Slate presets and custom top and horizon colours.
- View cube, Top / Front / Right / Home camera presets, and Fit.
- Per-piece track and connector colour pickers. Defaults match the reference
  renders: track `#e2622a` orange, connectors `#2f7fd1` blue.

**Verification**

- `scripts/verify-geometry.ts` audits every generated solid: signed volume
  against the analytic cross-section area × sweep length, bounding boxes, and an
  edge-manifold check that every edge is shared by exactly two triangles.
  Run with:
  `npx vite build --ssr scripts/verify-geometry.ts --outDir /tmp/vg --config /dev/null && node /tmp/vg/verify-geometry.js`

### Dimension provenance

Values read directly from the drawings:

| Value | Drawing | Reading |
| --- | --- | --- |
| Overall track height | 03 | 14.378 |
| Wall thickness | 03 | 2.452 |
| Channel width at top | 03 | 32.561 |
| Ramp height | 03 | 3.50 |
| Wall angle | 03 | 110° |
| T-slot undercut width | 03 | 26.231 |
| T-slot mouth width | 03 | 21.093 |
| Connector pocket length | 04 | 40, both ends |
| Standard straight length | 05 | 100 |
| Clip length / hole span | 10 | 70.00 / 64.00 |
| Through-hole / countersink Ø | 10 | 4.002 / 8.402 |
| Clip body width / height | 09 | 19.597 / 4.696 |
| Wing thickness / chamfer / angle | 09 | 1.136 / 2.701 / 135° |
| Inner ring height | 12, 13 | 2.0 |
| Countersink chamfer | 14 | 1.00 / 2.2, two-distance |

### Known deviations from the drawings

These need your confirmation. All are editable in the **Dims** panel.

1. **Slab thickness is 6.05, not the 4.389 implied by drawing 03**
   (14.378 − 6.489 − 3.50). A 4.696mm-tall clip cannot fit inside a 4.389mm
   slab, so one of those two readings must be wrong. The default is sized so the
   clip actually fits: clip height + clearance + 1.2mm ceiling. Consequence: the
   straight inner wall comes out at 4.828 rather than the 6.489 on the drawing.
   Please check which measurement is right on the physical part.

2. **The T-slot runs the full length of a piece**, rather than only 40mm at each
   end as drawing 04 shows. Simpler to generate and to print, and it lets a clip
   slide anywhere along a straight. `connectorInset` is still a parameter and
   drives the grab-tab size. Corners get their own shorter clip, per the brief.

3. **Countersink spacing is clamped.** Drawing 10 puts the outer hole centres
   3.0mm from each end, but a Ø8.402 countersink at that position would overhang
   the end of a 70mm clip. The span is reduced so a countersink always keeps 1mm
   of material to the end edge. Either the 70.00, the 64.00, or the 8.402 is
   being misread — worth a check.

4. **The clip is modelled as a single lofted solid.** Body, wings, wing chamfer
   and conical countersinks are all one watertight mesh; no boolean kernel is
   used anywhere in the app.

### Design decisions

- **Car physics is a path-following simulation**, not a rigid-body engine.
  Gravity is projected onto the local track tangent with rolling friction. It is
  deterministic, cannot tunnel through geometry or fall out of a corner, and adds
  no wasm payload. Trade-off: the car cannot jump gaps or fly off the track.
- **All geometry is procedural.** No CAD files are imported, so length, radius,
  angle and lane count are all free parameters.
- **Marble Run** appears in the track-type selector but is disabled pending its
  own profile.

### Fixed during development

- Swept solids had their side triangles wound inward while the end caps faced
  outward, so signed volume partly cancelled — a 100mm straight measured 5,438mm³
  against an analytic 16,314mm³. Side strips now match the caps; all four test
  solids measure exactly. Caught by `scripts/verify-geometry.ts`.
- The default dimensions produced a self-intersecting cross-section because the
  T-slot was deeper than the slab. Fixed by the slab-thickness change above, plus
  clamps in `trackProfile.ts` and a warning in the Dims panel.
- The connector loft emitted degenerate rings where two levels shared a height,
  leaving 141 non-manifold edges. Zero-height rings are now skipped.
- Outer countersinks landed tangent to the clip's end edge, which broke cap
  triangulation. Hole span is now clamped clear of the ends.
- 3MF `displaycolor` was written in linear space (`#C21F06` for `#E2622A`)
  because THREE.Color converts on construction. Colours are now read back through
  sRGB.
- Both pieces at a joint drew their own clip, doubling the geometry. Ownership is
  now settled deterministically by piece id in `src/lib/connectors.ts`.

### Verified

- `pnpm typecheck` and `pnpm build` clean.
- All generated solids watertight (0 non-manifold edges) with volumes matching
  the analytic value exactly: 1-lane straight 16,313.8mm³, 2-lane straight
  28,097.7mm³, 45° and 90° curves within rounding, clip 6,489.6mm³.
- App renders and snapping works in Chrome, light and dark, checked by
  screenshot.
- All three exporters produce valid files: 3MF with correct OPC structure, 4
  objects, 4 materials, `unit="millimeter"`; binary STL whose triangle count
  matches its byte length; OBJ with one named group per part.

### Not yet built

- Marble Run track type.
- Saving and loading projects.
- The dedicated shorter corner clip is currently the same profile at a shorter
  length; it has not been printed or fit-tested.
