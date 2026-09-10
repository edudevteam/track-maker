import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, RefreshCw, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Field, Section, Segmented, Toggle } from './controls'
import { LengthInput, useUnits } from './units'
import { unitNoun } from '../lib/units'
import {
  AXES,
  axisOf,
  flipAxis,
  sameFacing,
  vehicleSizeOf,
  type Axis,
  type VehicleFacing,
} from '../geometry/vehicle'
import { getBlockGeometry, getCarGeometry } from '../geometry/cache'
import {
  BLOCK_CAR,
  CARS_MANIFEST,
  FORMAT_LIST,
  PICKABLE_FORMATS,
  isBuiltIn,
  useLoadedCar,
  withFacing,
  type CarModelSpec,
} from '../lib/carLibrary'
import { CAR_SCALES, REFERENCE_VEHICLE, scaleOf, sizeAtScale } from '../lib/carScales'
import type { VehicleSize } from '../types'

/**
 * The cars that can ride the track, and how big each one is.
 *
 * Picking and resizing take effect at once — the point is to watch the car
 * change on the track — so there is nothing to save here, only a way out.
 */
export function VehicleDialog({ onClose }: { onClose: () => void }) {
  const models = useProject((s) => s.carLibrary.models)
  const libraryError = useProject((s) => s.carLibrary.error)
  const problems = useProject((s) => s.carLibrary.problems)
  const storageError = useProject((s) => s.carLibrary.storageError)
  const loading = useProject((s) => s.carLibraryLoading)
  const loadCarLibrary = useProject((s) => s.loadCarLibrary)
  const vehicle = useProject((s) => s.vehicle)
  const setVehicle = useProject((s) => s.setVehicle)
  const allFacing = useProject((s) => s.vehicleFacing)
  const { unit } = useUnits()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A car faces whichever way it has been told to, over whatever its file says.
  const spec = withFacing(models.find((m) => m.id === vehicle) ?? models[0], allFacing[vehicle])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vehicle"
        className="flex max-h-full w-full max-w-[520px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <h2 className="text-[13px] font-semibold">Vehicle</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose} title="Close">
            <X size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="tm-section">
            <p className="text-[11.5px]" style={{ color: 'var(--color-ink-2)' }}>
              What rides the track in the gravity preview. <strong>Add a model</strong> reads a{' '}
              {PICKABLE_FORMATS.map((f) => `.${f}`).join(', ')} file straight off your own disk and
              keeps it in this browser — nothing is uploaded anywhere, and a model of any size costs
              the project nothing. A car that should ship with the app instead goes in{' '}
              <code className="font-mono">public/cars/</code>, named in{' '}
              <code className="font-mono">{CARS_MANIFEST}</code>; that way takes all of{' '}
              {FORMAT_LIST.map((f) => `.${f}`).join(', ')} and the folder's own README sets out the
              fields.
            </p>
            <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-ink-2)' }}>
              A <code className="font-mono">.glb</code>, <code className="font-mono">.3mf</code> or{' '}
              <code className="font-mono">.obj</code> with its <code className="font-mono">.mtl</code>{' '}
              rides in the colours it was made with. An <code className="font-mono">.stl</code>{' '}
              carries none, so it takes the flat <code className="font-mono">color</code> its entry
              gives. Each car keeps its own size in {unitNoun(unit)}, saved with the project.
            </p>
            {libraryError && <Warning>{libraryError}</Warning>}
            {storageError && <Warning>{storageError}</Warning>}
            {problems.map((p) => (
              <Warning key={p}>{p}</Warning>
            ))}
          </div>

          <Section title="Car">
            <div className="flex flex-col gap-1">
              {models.map((m) => (
                <CarRow
                  key={m.id}
                  spec={withFacing(m, allFacing[m.id])}
                  checked={m.id === vehicle}
                  onPick={() => setVehicle(m.id)}
                />
              ))}
            </div>
            <AddCar />
          </Section>

          {spec && !isBuiltIn(spec) && <FacingSection spec={spec} />}
          {spec && <SizeSection spec={spec} />}
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-3"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <button
            className="tm-btn"
            onClick={() => void loadCarLibrary(true)}
            disabled={loading}
            title="Read cars.json again and re-read every model file"
          >
            <RefreshCw size={13} />
            {loading ? 'Reloading…' : 'Reload models'}
          </button>
          <button className="tm-btn tm-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-2 flex gap-1.5 rounded border p-2 text-[11px]"
      style={{ borderColor: '#d97706', background: 'color-mix(in srgb, #d97706 12%, transparent)' }}
    >
      <AlertTriangle size={13} className="mt-[1px] shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/** How much room a stored model takes, written the way a file manager would. */
function fileSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

/** Picking a model off disk, and whatever came of the last attempt. */
function AddCar() {
  const addCarFile = useProject((s) => s.addCarFile)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const take = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const temporary = await addCarFile(file)
      setNote(
        temporary
          ? `${file.name} is on the track, but ${temporary}, so it will be gone when the page reloads.`
          : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'that file could not be read')
    } finally {
      setBusy(false)
      // Cleared so picking the same file again still counts as a change.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={PICKABLE_FORMATS.map((f) => `.${f}`).join(',')}
        onChange={(e) => void take(e.target.files?.[0])}
      />
      <button
        className="tm-btn mt-1.5"
        disabled={busy}
        onClick={() => input.current?.click()}
        title="Read a model off this computer and keep it in this browser"
      >
        <Upload size={13} />
        {busy ? 'Reading…' : 'Add a model…'}
      </button>
      {error && <Warning>{error}</Warning>}
      {note && <Warning>{note}</Warning>}
    </>
  )
}

/** One car in the list, with what became of its file underneath the name. */
function CarRow({
  spec,
  checked,
  onPick,
}: {
  spec: CarModelSpec
  checked: boolean
  onPick: () => void
}) {
  const { fmt } = useUnits()
  const { car, loading, error } = useLoadedCar(spec)
  const removeCar = useProject((s) => s.removeCar)

  const paint = car
    ? car.ownColors
      ? `${car.materials} colour${car.materials === 1 ? '' : 's'} from the file`
      : 'no colour of its own'
    : ''
  const parts = car && car.parts > 1 ? `${car.parts} parts · ` : ''
  const held = spec.source === 'stored' ? `${fileSize(spec.bytes)} in this browser · ` : ''
  const status = isBuiltIn(spec)
    ? spec.id === BLOCK_CAR.id
      ? `Built in — a plain box the size of a real car, ${fmt(REFERENCE_VEHICLE.length)} long`
      : 'Built in — no file needed'
    : error
      ? `Could not be read: ${error}`
      : loading
        ? `${spec.file} — reading…`
        : car
          ? `${spec.file} · ${held}${parts}${car.triangles.toLocaleString()} triangles · ${fmt(car.natural.length)} long · ${paint}`
          : spec.file

  // Parts standing apart from each other are the giveaway for a model exported
  // laid out for printing rather than assembled — including a project file
  // holding several plates, since a plate is a slicer's idea that no model
  // reader can see. Said plainly, because nothing can put a car together for you.
  const scattered = car && car.clumps > 1

  return (
    <div
      className="flex items-start gap-1 rounded transition hover:bg-black/5 dark:hover:bg-white/5"
      style={
        checked ? { background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' } : undefined
      }
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        onClick={onPick}
        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
      >
        <span className="mt-[2px] w-[13px] shrink-0" style={{ color: 'var(--color-accent)' }}>
          {checked && <Check size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[12px]">
            {spec.name}
            {/* The manifest colour is only what paints a file carrying none, so
                showing the swatch against a GLB or 3MF would be a lie. */}
            {!car?.ownColors && (
              <span
                className="inline-block h-[9px] w-[9px] shrink-0 rounded-full"
                style={{ background: spec.color }}
              />
            )}
          </span>
          <span
            className="block truncate text-[10.5px]"
            style={{ color: error ? '#d97706' : 'var(--color-ink-2)' }}
          >
            {status}
          </span>
          {scattered && (
            <span className="mt-0.5 flex gap-1 text-[10.5px]" style={{ color: '#d97706' }}>
              <AlertTriangle size={11} className="mt-[1px] shrink-0" />
              <span>
                Its {car.parts} parts stand apart in {car.clumps} groups, so this looks laid out for
                printing rather than assembled. Export the parts where they sit on the finished car.
              </span>
            </span>
          )}
        </span>
      </button>
      {/* Only a picked model can be removed — the others belong to the app. */}
      {spec.source === 'stored' && (
        <button
          className="tm-btn mt-1 mr-1 shrink-0 px-1.5 py-1"
          title={`Forget ${spec.name}, freeing the ${fileSize(spec.bytes)} it holds`}
          onClick={() => void removeCar(spec.id)}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

const AXIS_OPTIONS = AXES.map((a) => ({ value: a, label: a }))

/**
 * Which way round the car is.
 *
 * No model format records this. glTF says an asset faces +Z, a slicer stands a
 * 3MF up in Z, and STL and OBJ say nothing at all — so a model is read facing
 * whichever way its kind usually does, and a car that was modelled the other way
 * arrives driving backwards. There is no way to work it out from the mesh: a car
 * is roughly as car-shaped nose-first as it is tail-first. Someone has to say.
 *
 * Turning it around is the whole of it nine times in ten, so that is a button.
 * The two axis rows are there for a model that also lies on its side.
 */
function FacingSection({ spec }: { spec: CarModelSpec }) {
  const setVehicleFacing = useProject((s) => s.setVehicleFacing)
  const facing: VehicleFacing = { forward: spec.forward, up: spec.up }
  const asFile = sameFacing(facing, spec.defaultFacing)

  const set = (next: VehicleFacing) => void setVehicleFacing(spec.id, next)

  // Picking an axis already taken by the other swaps the two, rather than
  // refusing the click — a pair on one axis names no rotation at all.
  const setForward = (forward: Axis) =>
    set(axisOf(forward) === axisOf(facing.up) ? { forward, up: facing.forward } : { ...facing, forward })
  const setUp = (up: Axis) =>
    set(axisOf(up) === axisOf(facing.forward) ? { forward: facing.up, up } : { ...facing, up })

  return (
    <Section title="Facing">
      <div className="flex items-center gap-2">
        <button
          className="tm-btn"
          onClick={() => set({ ...facing, forward: flipAxis(facing.forward) })}
          title="Swap the front and the back of the car"
        >
          <RotateCcw size={13} />
          Turn around
        </button>
        <button
          className="tm-btn"
          disabled={asFile}
          onClick={() => void setVehicleFacing(spec.id, null)}
          title="Go back to the way the file is read by default"
        >
          Reset
        </button>
      </div>

      <div className="mt-2 grid gap-2">
        <Field label="Nose points" hint="Which way the model faces in its own file.">
          <Segmented value={facing.forward} options={AXIS_OPTIONS} onChange={setForward} />
        </Field>
        <Field label="Roof points" hint="Which way is up in its own file.">
          <Segmented value={facing.up} options={AXIS_OPTIONS} onChange={setUp} />
        </Field>
      </div>

      <p className="mt-2 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
        {asFile
          ? `Read as a .${spec.format ?? ''} is normally built — nose ${spec.defaultFacing.forward}, roof ${spec.defaultFacing.up}.`
          : `Turned from the ${spec.defaultFacing.forward} / ${spec.defaultFacing.up} a .${spec.format ?? ''} is normally read as.`}{' '}
        {spec.source === 'stored'
          ? 'Kept with the model in this browser, so it only has to be said once.'
          : 'Saved with the project. Put it in the car’s cars.json entry to fix it for everyone.'}
      </p>
    </Section>
  )
}

/** The chosen car's size. Every field is millimetres in the store, whatever the display unit. */
function SizeSection({ spec }: { spec: CarModelSpec }) {
  const dims = useProject((s) => s.dims)
  const sizes = useProject((s) => s.vehicleSizes)
  const setVehicleSize = useProject((s) => s.setVehicleSize)
  const keepProportions = useProject((s) => s.keepVehicleProportions)
  const setKeepProportions = useProject((s) => s.setKeepVehicleProportions)
  const { fmt } = useUnits()
  const { car } = useLoadedCar(spec)

  // What the car measures with nothing typed over it: the file's own size, or
  // the built-in shape's — the die-cast one follows the channel width, the block
  // is a real vehicle.
  const natural =
    car?.natural ??
    (isBuiltIn(spec)
      ? vehicleSizeOf(spec.id === BLOCK_CAR.id ? getBlockGeometry() : getCarGeometry(dims))
      : null)
  const override = sizes[spec.id] ?? null
  const size = override ?? spec.size ?? natural

  if (!size) {
    return (
      <Section title="Size">
        <p className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
          The size can be set once the model has been read.
        </p>
      </Section>
    )
  }

  const set = (field: keyof VehicleSize, value: number) => {
    if (!keepProportions) {
      setVehicleSize(spec.id, { ...size, [field]: value })
      return
    }
    // One field drags the other two, so a car keeps its shape while it is resized.
    const k = value / size[field]
    setVehicleSize(spec.id, {
      length: size.length * k,
      width: size.width * k,
      height: size.height * k,
    })
  }

  // A scale is measured against the real vehicle. The model says how big that is
  // whenever its units could be settled; the block is one by construction; a
  // die-cast shape or a file on an unreadable scale falls back to a typical car.
  const realFromModel = car?.realFromFile ?? spec.id === BLOCK_CAR.id
  const real = realFromModel && natural ? natural : REFERENCE_VEHICLE
  const atScale = scaleOf(real, size)

  return (
    <Section title="Size">
      <div className="grid grid-cols-3 gap-x-3">
        <Field label="Length">
          <LengthInput value={size.length} step={1} min={1} onChange={(v) => set('length', v)} />
        </Field>
        <Field label="Width">
          <LengthInput value={size.width} step={1} min={1} onChange={(v) => set('width', v)} />
        </Field>
        <Field label="Height">
          <LengthInput value={size.height} step={1} min={1} onChange={(v) => set('height', v)} />
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium">Scale</span>
        {CAR_SCALES.map((s) => {
          const at = sizeAtScale(real, s.denominator)
          const on = atScale?.id === s.id
          return (
            <button
              key={s.id}
              className="tm-btn px-2 py-1"
              aria-pressed={on}
              style={
                on
                  ? {
                      background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
                      borderColor: 'var(--color-accent)',
                    }
                  : undefined
              }
              title={`${s.note} — ${fmt(at.length)} × ${fmt(at.width)} × ${fmt(at.height)}`}
              onClick={() => setVehicleSize(spec.id, at)}
            >
              {s.id}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
        {realFromModel
          ? `Measured against this model's own ${fmt(real.length)} — its file says what unit it is in.`
          : `Measured against a typical car, ${fmt(REFERENCE_VEHICLE.length)} long, because this one's real size is not known.`}{' '}
        A scale sets the car only; no track dimension moves with it.
      </p>

      <Toggle
        checked={keepProportions}
        onChange={setKeepProportions}
        label="Keep proportions"
        hint="Off, the car can be squashed or stretched on one axis."
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {natural
            ? `Model's own size ${fmt(natural.length)} × ${fmt(natural.width)} × ${fmt(natural.height)}`
            : 'Sized from cars.json'}
        </span>
        <button
          className="tm-btn"
          disabled={!override}
          onClick={() => setVehicleSize(spec.id, null)}
          title="Drop the size typed here and go back to the model's own"
        >
          Reset
        </button>
      </div>
      <p className="mt-2 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
        Length runs down the track, width across it, height up off the road. The car is seated on
        the road surface and centred in the channel, which is{' '}
        {fmt(dims.track.channelTopWidth)} wide.
      </p>
    </Section>
  )
}
