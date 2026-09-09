import { create } from 'zustand'

export type Theme = 'light' | 'dark'

/**
 * What the workplane sits on when no colour has been chosen. Near-white in light
 * mode, matching the Fusion viewport the grid is styled after.
 */
export const themeBackground = (theme: Theme) => (theme === 'dark' ? '#161a20' : '#fafbfc')

const KEY = 'track-maker.theme'

function initial(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* private mode, blocked storage — fall through to the default */
  }
  return 'light'
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* nothing to persist to; the in-memory value still drives the UI */
  }
}

export const useTheme = create<{ theme: Theme; toggle: () => void; set: (t: Theme) => void }>((set) => {
  const theme = initial()
  apply(theme)
  return {
    theme,
    toggle: () =>
      set((s) => {
        const next: Theme = s.theme === 'light' ? 'dark' : 'light'
        apply(next)
        return { theme: next }
      }),
    set: (t) => {
      apply(t)
      set({ theme: t })
    },
  }
})
