# Car models

There are two ways to get a car onto the track, and which one you want depends
on who the car is for.

**Just for you — Settings ▸ Vehicle ▸ Add a model…** reads a `.glb`, `.3mf`,
`.stl` or `.obj` straight off your disk and keeps it in your browser. Nothing is
uploaded anywhere, nothing is added to the repository, and the model survives a
reload. This is the right way for almost every car, and the only sane way for a
big one: car models run to tens or hundreds of megabytes, and a model in this
folder is downloaded by everyone who opens the app.

**For everyone — this folder.** A model here ships with the app. Drop it in, run
`pnpm car:add`, and it appears in **Settings ▸ Vehicle** for every user. Keep it
small; a few hundred kilobytes is a good car, ten megabytes is not.

The folder has to be this one. Track Maker runs entirely in the browser, and a
browser cannot read a path off your disk, so `cars.json` can only name files that
sit beside it.

## `pnpm car:add`

Measuring a model by hand is where this goes wrong — a file does not say what
unit it is in, and reading it as millimetres when it is metres puts a 6mm car on
the track. So the script reads each model with the app's own loaders, seats it
with the app's own code, works out its units, and writes the entry from what came
out. What it prints is what you will see.

```bash
pnpm car:add                      # every model here that is not listed yet
pnpm car:add muscle_car.glb       # just that one, measured again if already in
pnpm car:add --scale 32           # start it at 1:32 rather than die-cast 1:64
pnpm car:add --dry-run            # print the entry, write nothing
pnpm car:add --name "Muscle Car" --id musclecar    # one file only
```

It warns about the two things that make a car look wrong: parts standing apart,
which means the file is a print plate rather than an assembled car, and a file
big enough that it should have been added from the app instead. Anything you set
by hand in an entry — a colour, an axis — survives being measured again.

A `.3mf` is written unmeasured: its loader reads the package with `DOMParser`,
which node has none of. Set its size in the Vehicle dialog.

## Which format

| Format | Colour | In the app | Notes |
| --- | --- | --- | --- |
| `.glb` | yes | yes | **The best one.** Paint, glass, tyres, chrome and textures all travel in a single file. One click out of Blender or Fusion. |
| `.gltf` | yes | no | The same, split into a `.gltf` plus a `.bin` and any textures. Keep them all in this folder. A picker can only take one file, so export `.glb` instead. |
| `.3mf` | yes | yes | Per-object colour, and what a slicer already understands. Track Maker writes it on export too. |
| `.obj` | yes, with its `.mtl` | flat colour only | Flat colour per named material. The `.mtl` has to sit beside the `.obj`; a picked `.obj` arrives without one, so it takes `color`. |
| `.stl` | no | yes | Triangles only — no colour exists in the format. The car takes the flat `color` its entry gives. |

If you want a car that looks like a car rather than one solid colour, export
`.glb`. If your pipeline is already a slicer's, `.3mf` does just as well.

## `cars.json`

```json
{
  "format": "track-maker-cars",
  "cars": [
    {
      "id": "muscle-car",
      "name": "Muscle Car",
      "file": "muscle_car.glb",
      "units": "m",
      "length": 97.7,
      "width": 37.3,
      "height": 27.7
    },
    {
      "id": "printed",
      "name": "Printed Body",
      "file": "printed.stl",
      "units": "mm",
      "forward": "+X",
      "up": "+Y",
      "color": "#dc2626"
    }
  ]
}
```

| Field | Required | What it means |
| --- | --- | --- |
| `id` | yes | Unique, and what a saved project stores. Renaming it loses the pick. `diecast` and `block` are the built-in cars' and cannot be used. |
| `name` | yes | What the menu shows. |
| `file` | yes | File name in this folder, in one of the formats above. |
| `units` | no | The units the file was exported in: `mm`, `cm`, `m`, `in`, or a plain number of millimetres per unit for a file on some other scale entirely. Left out, it is read off the model — see below. |
| `forward` | no | Which way the model faces in its own file. Defaults per format, below. |
| `up` | no | Which way is up in its own file. Defaults per format, below. |
| `length` | no | Size along the track, mm. Left out, the file's own size is used. |
| `width` | no | Size across the track, mm. |
| `height` | no | Size off the road surface, mm. |
| `color` | no | Flat body colour, used **only** for a file carrying no colour of its own. Ignored for a GLB, a 3MF, or an OBJ with its MTL. |

## Units, and why they are guessed

No model format records what one unit means. glTF says metres by convention, CAD
exports millimetres or inches, and an exporter told to "scale to millimetres" can
leave a thousandth-scale node on the root and a model measuring five thousandths
of a unit end to end.

An entry that says nothing gets its units read off the model. The candidates —
millimetres, centimetres, inches, metres, and metres under a thousandth-scale
node — are orders of magnitude apart, so only one of them ever puts a car between
a quad bike and an articulated lorry. If none of them does, the file's own
numbers are used unchanged and the car's real size is treated as unknown.

Setting `units` explicitly turns the guessing off for that entry. Do that if a
model really is a few millimetres long and meant to be.

## Scale

**Settings ▸ Vehicle ▸ Size** has three scale buttons: **1:64** (die cast),
**1:32** (slot car) and **1:28** (RC). Each divides the real vehicle's size to
get the car's.

That needs to know how big the real vehicle is, which only the model can say, and
only once its units are settled. Where they are, the button says so — *measured
against this model's own 6251mm*. Where they are not, it falls back to a typical
car 4500mm long and says that instead.

**A scale sets the car and nothing else.** No track dimension moves with it. The
channel is 32.561mm wide out of the box, which suits a die-cast car; a 1:32 or
1:28 car is two to three times that and will sit wider than the walls until you
widen the channel yourself in **Settings ▸ Dimensions**.

The **Block** car is a plain box exactly the size of a real vehicle, so it can be
put at any scale to see how big a car at that scale is. It is also what a project
falls back to when it names a model this browser has never seen — a `.tmproj`
sent to someone else does not carry the model with it.

## Which way round

**If a car drives backwards, use Settings ▸ Vehicle ▸ Facing ▸ Turn around.** No
model format records which way a car faces, and nothing can work it out from the
mesh — a car is about as car-shaped tail-first as it is nose-first. So a model is
read facing whichever way its kind usually does, and one built the other way
arrives driving backwards until someone says otherwise. The two axis rows beside
the button are for a model that also lies on its side or its roof.

Where that correction is kept depends on the car. A model picked off your disk
keeps it in the browser alongside the model, so it only has to be said once. A
model from this folder keeps it in the project — put `forward` and `up` in its
`cars.json` entry to fix it for everyone instead.

`forward` and `up` take `+X`, `-X`, `+Y`, `-Y`, `+Z` or `-Z`, and cannot both be
the same axis. Track Maker turns the model so it faces down the track and sits on
the road, then centres it side to side — wherever its origin happened to be.

Each format has its own convention, so an entry that says nothing gets the right
one for its kind:

| Format | `forward` | `up` | Why |
| --- | --- | --- | --- |
| `.glb`, `.gltf` | `+Z` | `+Y` | glTF 2.0 fixes both. |
| `.3mf` | `+Y` | `+Z` | It is a print format, so models come out standing up in Z. |
| `.stl`, `.obj` | `+X` | `+Y` | Neither format has a convention, so this is just Track Maker's. |

If a car rides sideways or on its roof, these two fields are what to change.

## A car built out of parts

A model made of separate objects — body, glass, wheels, lights — is the normal
case and the one that works best. It is how 3MF carries colour at all, and how a
GLB usually holds a car. Every part comes in where the file puts it, keeping its
own colour, and the Vehicle dialog says how many arrived.

The one arrangement that will not work is **a print plate**: the same parts laid
out flat and spread apart, ready to slice. Nothing is wrong with the file, but
those are the positions it holds, so that is what rides the track — a spread of
loose parts, sized to the plate rather than to a car.

The dialog makes it obvious: a plate reads as far too wide and too flat under
**Model's own size**, e.g. 210 × 250 × 14mm, and both the dialog and `pnpm
car:add` say so outright. Export the parts **assembled** — positioned as they sit
on the finished car — and it comes in right.

## Size

`length`, `width` and `height` are only the starting size. Every car's size is
editable in **Settings ▸ Vehicle…**, kept per car, and saved with the project — so
several cars of different sizes can share one track.

## Notes on exporting

- **Scale.** Anything works — the size fields override it — but exporting at true
  millimetres or true metres means the units are read correctly from the start.
- **Origin.** Anywhere. The model is seated on the road and centred for you.
- **Size of the file.** The mesh is loaded as-is, so a multi-million-triangle scan
  will be slow. A few tens of thousands of triangles is plenty for a preview.
- An entry that cannot be read is skipped, and the reason is listed in the
  Vehicle dialog rather than being swallowed.
