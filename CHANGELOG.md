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

## [1.1.12] — 2026-09-09

### Changed

- **The Background dialog is one choice now — Single or Double.** Single paints
  one colour behind the grid, Double blends a Top down into a Bottom. Both
  colours are always on show; the Bottom one is greyed out and inert until Double
  is picked, so the dialog keeps its shape either way. The first colour carries
  across the switch, so turning Double on only adds a second colour rather than
  changing the one already there.
- **A fresh project opens on the theme's own background colour**, which is what
  the field shows until you pick something. Choosing a colour stops the
  background following the light/dark theme; **Reset** puts that back.

### Removed

- **The Default / Custom step.** It stood for a single colour chosen by the
  theme, which the Single field now shows directly.

---

## [1.1.11] — 2026-09-09

### Changed

- **The Background dialog now asks two plain questions.** First **Default** or
  **Custom** — Default leaves the workplane following the light or dark theme.
  Pick Custom and a second row offers **Single colour** or **Double colour**:
  single takes one colour behind the grid, double takes a **Top** and a
  **Bottom** and blends between them. Coming back to Custom after Default
  returns to whichever of the two was last in use.
- **The Settings menu names the choice the same way**, reading Default, Custom ·
  single colour or Custom · double colour under Background….

### Removed

- **The four sky preset swatches.** The two colour pickers are the whole control
  now.

---

## [1.1.10] — 2026-09-09

### Changed

- **The Background dialog no longer labels the mode buttons.** The Theme / Sky /
  Solid row sat under two headings both reading "Mode"; the buttons say what they
  are, so both are gone and a line underneath now describes the mode in force.
- **The sky presets, Sky, Horizon and Solid colours are always on show**, whatever
  mode is picked, so a gradient can be set up before switching to it and comes
  back unchanged afterwards. The dialog no longer changes height as you move
  between modes.

---

## [1.1.9] — 2026-09-09

### Added

- **Background… in the Settings menu**, under a separator with Units and
  Dimensions. It opens a dialog holding everything the View tab used to: the
  Theme / Sky / Solid choice, the four sky presets, the sky and horizon colours
  and the solid colour. Colours apply to the workplane as you pick them — there
  is nothing to save, so the dialog closes with Done or Escape — and a Reset
  button puts the background back to following the theme. The menu row names the
  mode in force underneath it.

### Removed

- **The View tab in the right panel.** Background was all it held, so the panel
  now opens straight onto Part and Build.

---

## [1.1.8] — 2026-09-09

### Removed

- **The Display section from the View tab.** Its two switches — Grid and Track
  ends — duplicated the Grid and Ends buttons that already sit in the footer, so
  the View tab now opens straight onto Background.

---

## [1.1.7] — 2026-09-09

### Removed

- **The Home and Fit buttons in the status bar.** Both moves already have round
  buttons under the navigation cube in the corner of the workplane — Home for
  the default view, Fit Selected for zooming in on the chosen part — so the
  footer keeps only the Top, Front and Right view buttons beside the grid,
  print-area and ends toggles.

---

## [1.1.6] — 2026-09-09

### Added

- **A navigation hint in the bottom-right of the workplane** — the word
  **Workplane** beside a small drawing of a mouse. Hold a button to move the
  camera and that button lights up on the drawing while the move is named on a
  badge above it: left drag reads **Rotate**, right drag **Pan**, and the wheel
  (or a middle drag) **Zoom**. A plain left click to pick a part lights nothing,
  and neither does dragging the move/rotate handle, so the hint only ever
  reports a camera move that is really happening. It is a read-out, not a
  control: the pointer passes straight through it to the workplane behind.

---

## [1.1.5] — 2026-09-09

### Added

- **Units in the Settings menu**, above Dimensions: pick **Millimetre (mm)** or
  **Inch (in)** and every length in the app is written and typed in that unit —
  the Dimensions dialog and its warnings, the Part panel's length, radius and
  X/Y/Z, the parts library's width, length and radius, the Build tab's footprint,
  height and plate size, the plate labels in the viewport, the grid-cell note and
  the unit shown in the status bar. The choice is remembered between sessions.
  Inch fields carry an extra decimal place and step in hundredths and quarters
  rather than tenths of a millimetre, and a value that has only been rounded for
  display is left alone, so switching units back and forth never nudges a
  dimension.

### Changed

- **The track itself is still built in millimetres** whatever the display unit —
  the choice changes what you read and type, not the parts. Exported 3MF files
  stay in millimetres, so slicers open them at the right size as before.
- **Dimensions… now carries a sliders icon** in the Settings menu, leaving the
  ruler to the new Units row.

### Fixed

- **Dragging a piece by its move or rotate handle no longer reads as an orbit.**
  The navigation hint in the corner of the workplane is told the handle has the
  pointer, so it stops reporting a camera rotation that never happened.

---

## [1.1.4] — 2026-09-09

### Changed

- **The note at the top of the Dimensions dialog now says what the dialog is**
  rather than where the numbers came from. It no longer cites the Fusion sketch
  folder, which nobody using the app can open; instead it explains that these are
  the measurements every part is built from — the track's cross-section, the
  joining clip, and how tightly the two fit — and that they apply to the whole
  build, so changing one rebuilds every piece on save. The Reset button's hover
  text drops the same jargon.

---

## [1.1.3] — 2026-09-09

### Added

- **Dimensions moved into the Settings menu**, below Print, as **Dimensions…**.
  It opens a dialog holding the same three groups as before — Track profile,
  Connector clip and Assembly — laid out two fields to a row, with the warning
  banner and the derived lane pitch / channel floor / straight wall readout kept.
  Nothing you type reaches the build until you press **Save**: **Cancel** (or
  Escape, or clicking away) throws the edits away and leaves every piece as it
  was, so a half-typed number no longer rebuilds the track. **Reset to defaults**
  puts every field back to the CAD value, and it too waits for Save.

### Removed

- **The right panel's Dims tab is gone** — its fields now live in
  Settings ▸ Dimensions. The panel is down to Part, View and Build.

---

## [1.1.2] — 2026-09-09

### Added

- **A Print section in the Settings menu**, below Track and Vehicle. It holds
  **Wrap track in print boxes** — the on/off preview that draws one box per build
  plate around the track — and **Printer**, which opens the list of build volumes
  (Bambu P1/X1, Prusa MK4, Ender 3, Bambu A1 mini, Custom) to the right. The
  printer in force is named under the Printer row and carries a tick in the list.

### Changed

- **The right panel's Print tab is now called Build.** It reports what the build
  needs — footprint, height, piece count, the chosen printer, and how many plates
  it takes — and no longer sets anything, apart from the three size fields that
  appear when the printer is set to Custom. A line at the foot points to
  Settings ▸ Print for the printer and the print-box preview.

---

## [1.1.1] — 2026-09-09

### Added

- **A Settings menu** in the top bar, next to File. It holds **Track** and
  **Vehicle**, each opening a list of its own to the right when the pointer rests
  on it. Track offers **Car** and **Train**; Vehicle offers **Die Cast** and
  **1/48" RC**. Only Car and Die Cast are built out — the other two are listed as
  "soon" and cannot be picked yet. A tick marks what is in force.
- **A vehicle button in the toolbar**, at the right-hand end of the strip. It
  shows and hides whichever vehicle is chosen in Settings ▸ Vehicle. The first
  time it is switched on the vehicle is dropped at the start of the build and set
  running; hiding it parks it where it stands, so switching it back on carries on
  from there. It greys out until there is a part on the workplane, and names the
  chosen vehicle on hover.
- The chosen vehicle is saved with the project, so an opened file comes back with
  the same one. A file saved before Settings existed opens as a car track with
  the die-cast vehicle.

### Removed

- **The left panel is gone.** Its Car section — "Drop car on track", with Run,
  Pause and Remove — is replaced by the toolbar's vehicle button, and the
  workplane now runs the full width from the toolbar to the right panel. The
  **Browser** list of bodies went with the panel; parts are still picked in the
  workplane and edited in the Part panel on the right.
- **The track type drop-down is out of the top bar.** Settings ▸ Track sets it
  now, so the title field sits alone beside the menus. The old "Marble Run"
  option is retired — a project saved with it opens as a car track.

---

## [1.1.0] — 2026-09-09

### Fixed

- **The navigation cube is actually white now in light mode.** It was set to
  white last version but still drew a light grey, because the viewport's film
  tone mapping was dimming it the way it dims the model. The cube and its outline
  now bypass that, so the faces come out at full white against the workplane.

---

## [1.0.20] — 2026-09-09

### Changed

- **The navigation cube's faces are white in light mode**, instead of the faint
  grey they were, so the cube reads as a clean white box against the workplane.
  Dark mode is unchanged.
- **The corner X/Y/Z axis marker is a third smaller**, and its letters are no
  longer bold. It sits in the bottom-left corner as before, just quieter — it
  no longer competes with the navigation cube for attention.

---

## [1.0.19] — 2026-09-09

### Added

- **Home and Fit Selected buttons under the navigation cube**, as two round
  buttons stacked on the cube's centre line in the top-right of the workplane.
  **Home** (`H`) puts the camera back where a fresh project starts — the
  three-quarter view looking at the origin — whatever you have orbited or panned
  to. **Fit Selected** (`F`) swings in on the selected part, keeping the
  direction you are looking from and pulling back just far enough to frame the
  part with a little air around it. It greys out when nothing is selected, and
  frames the whole selection when several parts are picked. Both name themselves
  and their shortcut on hover.

---

## [1.0.18] — 2026-09-09

### Changed

- **Snap to selected end moved into the toolbar**, as a magnet button beside
  Connect and Disconnect. It lights up the same way an active tool does when snap
  is on, and its hover text says which way it is set — pieces attaching to the
  highlighted end, or landing loose. The left panel's **Placement** section is
  gone with it, so the panel now opens on Car and the browser.

---

## [1.0.17] — 2026-09-09

### Removed

- The **Build** section at the top of the left panel, with its **+ Add Part** and
  **Repeat last part** buttons. Both live in the toolbar across the top, so the
  left panel now opens straight into Placement and the outliner sits higher.
  `A` still opens the parts library.

---

## [1.0.16] — 2026-09-09

### Changed

- **Saved projects now use the `.track.json` extension** instead of `.tm.json`.
  Save writes `My-Big-Track.track.json`, the File menu names the new extension,
  and Open's file picker filters on it. Files saved with the old name still open
  fine — pick them with "All files" in the picker, or rename them.

---

## [1.0.15] — 2026-09-09

### Added

- **A File menu** in the top bar, next to the Track Maker name. It holds **New**,
  **Save**, **Open…**, and below a divider, **Undo** and **Redo**. Save names the
  file it will write and Open names the file type it accepts, so neither is a
  guess from an icon. Undo and Redo grey out when there is nothing to step
  through. The menu closes on a pick, on Escape, or on a click anywhere else.
- **New** starts an empty workplane under the title "Untitled Track", and asks
  first when there is a build to lose. Dimensions, printer and view settings are
  workshop setup rather than part of the build, so they carry over to the new
  project.

### Changed

- The top bar's save and open icons, and the eraser that cleared the build, are
  gone — all three are items in the File menu now. The top bar keeps the project
  title, the track type, the light/dark switch and Export.
- Undo and redo stay in the toolbar as buttons as well; the File menu lists them
  for anyone hunting through menus rather than reading icons.

---

## [1.0.14] — 2026-09-09

### Changed

- The toolbar's group captions — History, Parts, Tools, Joints — are gone. The
  groups keep their outlines, so the buttons still read as clusters, and every
  button still names itself and its shortcut on hover. The strip is shorter for
  it, giving the workplane more room.

---

## [1.0.13] — 2026-09-09

### Added

- **Parts library.** New parts come from a pop-up library instead of the left
  panel. **+ Add Part** — in the toolbar, in the left panel, or the `A` key —
  opens it. Pick Straight or Curve from the list, choose the lane width right
  there (Single, 2×, 3×, 4×, or type up to 8), set the length or the radius,
  sweep and turn direction, and a sketch of the part updates as you go. Adding
  drops it on the workplane, joined onto the highlighted end when snapping is
  on, and the piece's full settings carry on in the Part panel on the right as
  before.
- **Repeat last part.** A new toolbar tool — the `T` key, or the button in the
  left panel — lays down another of the part you last added and joins it onto
  the open end of the build. It prefers the highlighted end, and otherwise takes
  the newest free end, so pressing it over and over runs a line of track out.
  It joins the piece whether or not "Snap to selected end" is on.
- **A horizontal toolbar** across the top of the workplane, in labelled groups:
  History (undo, redo), Parts (Add Part), Tools (select, move, rotate, repeat,
  duplicate, delete) and Joints (connect, disconnect). The active tool's hint
  reads out along the right of the strip.

### Changed

- The left panel is now placement, the car and the browser. Its Tools grid moved
  into the toolbar and its Add track section became the parts library.
- Undo and redo moved from the top bar into the toolbar's History group. The top
  bar keeps save, open, clear, theme and export; clear now carries an eraser so
  it does not read as the toolbar's delete.
- Keyboard shortcuts are ignored while a dialog is open, so typing in the parts
  library or the export dialog no longer switches the tool underneath it. Held
  ⌘/Ctrl no longer triggers a tool shortcut either.

---

## [1.0.12] — 2026-09-09

### Added

- **Save and Open.** Two buttons sit next to the project name in the top bar.
  Save writes the whole build to a `<project title>.tm.json` file in your
  downloads — the title field supplies the filename, so "My Big Track" saves as
  `My-Big-Track.tm.json`. Open reads one back. ⌘S and ⌘O do the same thing.
- A saved file carries the project title, the track type, every dimension from
  the Dims panel, all pieces with their positions, colours, clips and joints,
  the chosen printer and build volume, and the gravity and friction settings.
  Selection, the active tool and the undo history are session state and are not
  saved — an opened project starts clean, with nothing selected.
- Opening a project replaces the current build, so it asks first when there is
  something on the workplane to lose.
- Files stay readable across versions: a project saved before a dimension
  existed opens with today's default for that dimension rather than failing.
  A file that is not a Track Maker project, or one saved by a newer version
  than you are running, is refused with a message in the top bar instead of
  loading a broken build. A joint whose other half is missing is dropped on
  open, so a hand-edited file cannot leave a piece clipped to nothing.

### Changed

- The printing export and the save file now build their filename the same way,
  so `My-Big-Track.3mf` and `My-Big-Track.tm.json` land side by side.

---

## [1.0.11] — 2026-09-09

### Changed

- A joint now carries at most two clips. A 1-lane piece still gets a single clip
  on its centreline and a 2-lane piece gets one per lane, but a 3-lane, 4-lane or
  wider piece is clipped only on its two outside lanes instead of every lane —
  fewer parts to print and fit for no loss of hold. The underside still has a
  T-slot on every lane centre, so a wide piece can still be clipped to narrow
  neighbours anywhere across its width. Exported clips for a wide piece are now
  named `left` / `right` rather than `lane 1` … `lane N`.

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
