# Track Maker

A client-side CAD tool for designing 3D-printable car track. Build a run from
straights and corners, see how many printer plates it needs, and export the parts
as OBJ, STL or 3MF.

Everything runs in the browser. There is no server and no account.

## Getting started

```bash
pnpm install
pnpm dev
```

Then open the URL Vite prints.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Type-check and build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm typecheck` | Type-check only |

## Using it

**Build a run.** Pick a width and a length in the left panel and click *Add
straight*, or click a corner angle. With *Snap to selected end* on, each new
piece mates to the highlighted end; turn it off to drop pieces loose.

**Adjust pieces.** Select a piece and edit its width, length, radius, sweep and
colours in the **Part** tab. Widening a piece to 2×, 3× or 4× puts that many
single tracks side by side and removes the inner walls, leaving a flat channel.

**Join and separate.** The Connect tool joins two ends; Disconnect frees one.
Dragging a joined piece moves its whole assembly, so disconnect an end first if
you want to move a piece on its own. The move and rotate handle can be anchored
to Side A, the Middle, or Side B.

**Check the print size.** The **Print** tab wraps the build in printer-sized
boxes. Each box is one plate; a run that overflows one box picks up another.

**Export.** The Export button writes the selection or the whole build. 3MF keeps
per-part colour, which is what you want for a multi-material printer. STL and OBJ
are there for everything else.

**Tune the dimensions.** The **Dims** tab exposes every dimension of the track
profile and the connector clip. Change a value and every piece rebuilds. See
`CHANGELOG.md` for where each number came from and which ones are inferred rather
than read straight off the drawings.

### Keyboard

| Key | Action |
| --- | --- |
| `V` `G` `R` `C` `X` | Select, Move, Rotate, Connect, Disconnect |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘D` | Duplicate |
| `Delete` | Delete selection |

## How it works

Parts are generated, not imported. A track piece is a 2D cross-section swept
along a straight or an arc; the connector clip is a stack of plan-view outlines
lofted into a solid with conical countersunk bores. No boolean kernel is
involved, which is why length, radius, angle and lane count are all free
parameters.

```
src/
  geometry/   dimensions, cross-sections, sweep and loft, part builders, cache
  lib/        port frames and mating maths, print-volume tiling
  scene/      react-three-fiber viewport, pieces, print boxes, car, sky
  ui/         panels, controls, export dialog
  export/     OBJ, STL and hand-written 3MF writers
  store/      zustand state for the project and the theme
public/
  cars/       car models for the preview, and the cars.json that lists them
scripts/
  verify-geometry.ts   headless audit of every generated solid
  verify-vehicle.ts    headless audit of the STL/OBJ car loader
```

The one thing that is imported rather than generated is the car in the gravity
preview. Drop a `.glb`, `.gltf`, `.3mf`, `.obj` or `.stl` into `public/cars/`,
list it in that folder's `cars.json`, and pick it in Settings ▸ Vehicle, where
its size is yours to set. A GLB, 3MF or OBJ-with-MTL rides in the colours it was
made with; an STL carries none, so it takes the flat colour its entry gives.
`public/cars/README.md` has the fields. The folder has to be that one: this runs
wholly in the browser, so a manifest cannot name a path elsewhere on disk.

### Verifying the geometry

`scripts/verify-geometry.ts` checks each generated solid three ways: signed
volume against cross-section area × sweep length, bounding boxes, and that every
edge is shared by exactly two triangles. Run it after changing anything in
`src/geometry/`:

```bash
npx vite build --ssr scripts/verify-geometry.ts --outDir .vg --config /dev/null
node .vg/verify-geometry.js
```

`scripts/verify-vehicle.ts` does the same for the car models — that an STL, OBJ
or GLB comes out facing down the track, seated on the road, centred across it,
scaled to the size set in Settings ▸ Vehicle, and still wearing the colours its
file carried. Build and run it the same way. 3MF is not covered: its loader reads
the package with the browser's XML parser, which node has none of.

## Source drawings

`Plan/Plan.md` is the brief. `Plan/media/` holds the Fusion screenshots the
dimensions were read from; `CHANGELOG.md` maps each dimension to its drawing and
lists the readings that could not be reconciled.
