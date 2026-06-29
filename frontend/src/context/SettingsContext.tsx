import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
export type AccentKey = 'blue' | 'purple' | 'green' | 'red' | 'amber' | 'cyan' | 'rose' | 'indigo'
export type FontSize  = 'small' | 'medium' | 'large'
export type Density   = 'compact' | 'default' | 'comfortable'
export type Theme     = 'light' | 'dark'
export type Language  = 'en' | 'id'
export type RefreshRate = '5s' | '10s' | '30s' | '1m'
export type ForecastHorizon = '30' | '90' | '180'
export type LstmUnits = 16 | 32 | 64 | 128

export interface NotifPrefs {
  critical:      boolean
  expiration:    boolean
  temperature:   boolean
  replenishment: boolean
  aiUpdate:      boolean
  milestones:    boolean
  sounds:        boolean
}

export interface IotPrefs {
  autoReconnect: boolean
  simMode:       boolean
  refreshRate:   RefreshRate
  fillThreshold: number      // 5–40%
}

export interface AiPrefs {
  autoRetrain:      boolean
  aiRecs:           boolean
  forecastHorizon:  ForecastHorizon
  lstmUnits:        LstmUnits
  showConfidence:   boolean
}

export interface AppSettings {
  theme:      Theme
  accent:     AccentKey
  fontSize:   FontSize
  density:    Density
  language:   Language
  notif:      NotifPrefs
  iot:        IotPrefs
  ai:         AiPrefs
}

// ─── Accent palette ────────────────────────────────────────────────────────────
export const ACCENTS: Record<AccentKey, { hex: string; hexDark: string; name: string; tw: string }> = {
  blue:   { hex: '#2563eb', hexDark: '#1d4ed8', name: 'Blue',   tw: 'bg-blue-600'   },
  purple: { hex: '#7c3aed', hexDark: '#6d28d9', name: 'Purple', tw: 'bg-purple-600' },
  green:  { hex: '#059669', hexDark: '#047857', name: 'Green',  tw: 'bg-emerald-600'},
  red:    { hex: '#dc2626', hexDark: '#b91c1c', name: 'Red',    tw: 'bg-red-600'    },
  amber:  { hex: '#d97706', hexDark: '#b45309', name: 'Amber',  tw: 'bg-amber-500'  },
  cyan:   { hex: '#0891b2', hexDark: '#0e7490', name: 'Cyan',   tw: 'bg-cyan-500'   },
  rose:   { hex: '#e11d48', hexDark: '#be123c', name: 'Rose',   tw: 'bg-rose-600'   },
  indigo: { hex: '#4f46e5', hexDark: '#4338ca', name: 'Indigo', tw: 'bg-indigo-600' },
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  theme:    'light',
  accent:   'blue',
  fontSize: 'medium',
  density:  'default',
  language: 'en',
  notif: {
    critical:      true,
    expiration:    true,
    temperature:   true,
    replenishment: true,
    aiUpdate:      false,
    milestones:    true,
    sounds:        false,
  },
  iot: {
    autoReconnect: true,
    simMode:       true,
    refreshRate:   '10s',
    fillThreshold: 20,
  },
  ai: {
    autoRetrain:     true,
    aiRecs:          true,
    forecastHorizon: '90',
    lstmUnits:       64,
    showConfidence:  true,
  },
}

// ─── CSS application ───────────────────────────────────────────────────────────
function applyAccentCSS(accent: AccentKey) {
  const a = ACCENTS[accent]
  const root = document.documentElement
  root.style.setProperty('--ac',  a.hex)
  root.style.setProperty('--acd', a.hexDark)
  // light tint for backgrounds
  root.style.setProperty('--acl', `${a.hex}1a`)  // 10% alpha
}

function applyThemeDOM(theme: Theme) {
  if (theme === 'dark') document.documentElement.classList.add('dark')
  else document.documentElement.classList.remove('dark')
}

function applyFontSizeDOM(fontSize: FontSize) {
  const root = document.documentElement
  const sizes = { small: '13px', medium: '14px', large: '15px' }
  root.style.setProperty('--base-font', sizes[fontSize])
  root.style.fontSize = sizes[fontSize]
}

function applyDensityDOM(density: Density) {
  const root = document.documentElement
  const padding = { compact: '10px', default: '16px', comfortable: '22px' }
  const gap     = { compact: '10px', default: '16px', comfortable: '22px' }
  root.style.setProperty('--card-p', padding[density])
  root.style.setProperty('--card-gap', gap[density])
}

function applyAllDOM(settings: AppSettings) {
  applyThemeDOM(settings.theme)
  applyAccentCSS(settings.accent)
  applyFontSizeDOM(settings.fontSize)
  applyDensityDOM(settings.density)
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface SettingsContextType {
  settings: AppSettings
  setTheme:    (v: Theme)     => void
  setAccent:   (v: AccentKey) => void
  setFontSize: (v: FontSize)  => void
  setDensity:  (v: Density)   => void
  setLanguage: (v: Language)  => void
  setNotif:    (k: keyof NotifPrefs, v: boolean) => void
  setIot:      <K extends keyof IotPrefs>(k: K, v: IotPrefs[K])   => void
  setAi:       <K extends keyof AiPrefs>(k: K, v: AiPrefs[K])     => void
  resetAll:    () => void
}

const SettingsContext = createContext<SettingsContextType | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('app_settings')
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AppSettings>
        // Deep merge with defaults so new keys get default values
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          notif: { ...DEFAULT_SETTINGS.notif, ...(parsed.notif || {}) },
          iot:   { ...DEFAULT_SETTINGS.iot,   ...(parsed.iot   || {}) },
          ai:    { ...DEFAULT_SETTINGS.ai,    ...(parsed.ai    || {}) },
        }
      }
    } catch {}
    return DEFAULT_SETTINGS
  })

  // Apply CSS on mount + whenever settings change
  useEffect(() => {
    applyAllDOM(settings)
    localStorage.setItem('app_settings', JSON.stringify(settings))
  }, [settings])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }, [])

  const setTheme    = useCallback((v: Theme)     => update({ theme: v }), [update])
  const setAccent   = useCallback((v: AccentKey) => update({ accent: v }), [update])
  const setFontSize = useCallback((v: FontSize)  => update({ fontSize: v }), [update])
  const setDensity  = useCallback((v: Density)   => update({ density: v }), [update])
  const setLanguage = useCallback((v: Language)  => update({ language: v }), [update])

  const setNotif = useCallback((k: keyof NotifPrefs, v: boolean) => {
    setSettings(prev => ({ ...prev, notif: { ...prev.notif, [k]: v } }))
  }, [])

  const setIot = useCallback(<K extends keyof IotPrefs>(k: K, v: IotPrefs[K]) => {
    setSettings(prev => ({ ...prev, iot: { ...prev.iot, [k]: v } }))
  }, [])

  const setAi = useCallback(<K extends keyof AiPrefs>(k: K, v: AiPrefs[K]) => {
    setSettings(prev => ({ ...prev, ai: { ...prev.ai, [k]: v } }))
  }, [])

  const resetAll = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  return (
    <SettingsContext.Provider value={{
      settings,
      setTheme, setAccent, setFontSize, setDensity, setLanguage,
      setNotif, setIot, setAi, resetAll,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
