import { useEffect, useState, type ReactNode } from 'react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-2 block">
      <span className="tm-label mb-1 block">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

/**
 * A numeric input that lets you type freely — including a half-finished "1." —
 * and only pushes a value up when it parses. Committed values flow back in.
 */
export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(round(value)))
  }, [value, focused])

  const commit = (raw: string) => {
    const n = Number(raw)
    if (raw.trim() === '' || Number.isNaN(n)) return
    let v = n
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    onChange(v)
  }

  return (
    <div className="relative">
      <input
        className="tm-input"
        type="number"
        step={step}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit(text)
          setText(String(round(value)))
        }}
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value)
        }}
        style={suffix ? { paddingRight: 30 } : undefined}
      />
      {suffix && (
        <span
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10.5px]"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {suffix}
        </span>
      )}
    </div>
  )
}

const round = (v: number) => Math.round(v * 1000) / 1000

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="mb-2 flex w-full items-center gap-2.5 rounded px-1 py-1 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span
        className="relative inline-block h-[18px] w-[32px] shrink-0 rounded-full transition"
        style={{ background: checked ? 'var(--color-accent)' : 'var(--color-line)' }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all"
          style={{ left: checked ? 16 : 2 }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px]">{label}</span>
        {hint && (
          <span className="block text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      className="flex rounded border p-[2px]"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface-2)' }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className="flex-1 rounded px-2 py-1 text-[12px] font-medium transition"
          style={
            value === o.value
              ? { background: 'var(--color-accent)', color: '#fff' }
              : { color: 'var(--color-ink-2)' }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[28px] w-[38px] shrink-0 cursor-pointer rounded border bg-transparent p-[2px]"
        style={{ borderColor: 'var(--color-line)' }}
      />
      <input
        className="tm-input font-mono"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
        }}
      />
    </div>
  )
}

export function Section({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="tm-section">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="tm-label">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}
