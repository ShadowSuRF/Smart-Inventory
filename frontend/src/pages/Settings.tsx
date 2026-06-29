import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/ui/Modal'
import { logout } from '../lib/api'
import {
  useSettings,
  ACCENTS,
  type AccentKey, type FontSize, type Density,
  type Language, type RefreshRate, type ForecastHorizon, type LstmUnits,
} from '../context/SettingsContext'
import toast from 'react-hot-toast'

// ─── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative w-10 h-5 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 ${checked ? 'toggle-track-on' : 'toggle-track-off'}`}
      style={checked ? { backgroundColor: 'var(--ac)', boxShadow: '0 0 0 2px var(--ac)33' } : {}}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

function SetRow({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</div>
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{children}</h3>
  )
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate()
  const {
    settings,
    setTheme, setAccent, setFontSize, setDensity, setLanguage,
    setNotif, setIot, setAi, resetAll,
  } = useSettings()

  const savedUser = JSON.parse(localStorage.getItem('user') || '{}')
  const [profileModal, setProfileModal] = useState(false)
  const [resetModal, setResetModal] = useState(false)
  const [profile, setProfile] = useState({
    name: savedUser.name || '',
    role: savedUser.role || '',
    institution: savedUser.institution || '',
    email: savedUser.email || '',
    initials: savedUser.initials || '',
  })
  const [profileForm, setProfileForm] = useState({ ...profile })
  const [loggingOut, setLoggingOut] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  const saveProfile = async () => {
    setSavingProfile(true)
    await new Promise(r => setTimeout(r, 400))
    setProfile({ ...profileForm })
    const updatedUser = { ...savedUser, ...profileForm }
    localStorage.setItem('user', JSON.stringify(updatedUser))
    setProfileModal(false)
    setSavingProfile(false)
    toast.success('Profile updated!')
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try { await logout() } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    toast.success('Logged out')
    navigate('/login')
  }

  const handleReset = () => {
    resetAll()
    setResetModal(false)
    toast.success('Settings reset to defaults')
  }

  // Active button style (uses accent CSS var)
  const activeBtn = 'text-white font-semibold'
  const inactiveBtn = 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:border-slate-400'
  const segmentBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm transition-all font-medium ${active ? activeBtn : inactiveBtn}`

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Customize your Smart Inventory and Waste Reducer experience</p>
        </div>
        <button onClick={() => setResetModal(true)} className="btn btn-secondary text-xs">↺ Reset All</button>
      </div>

      {/* ── Profile ─────────────────────────────────────────────── */}
      <div className="card mb-4">
        <SectionTitle>👤 Profile</SectionTitle>
        <div className="flex items-center gap-4 mt-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 select-none"
            style={{ backgroundColor: 'var(--ac)' }}
          >
            {profile.initials || profile.name?.slice(0, 2).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{profile.name || '—'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {[profile.role, profile.institution].filter(Boolean).join(' · ') || 'No role set'}
            </div>
            <div className="text-xs text-slate-400">{profile.email}</div>
          </div>
          <button
            onClick={() => { setProfileForm({ ...profile }); setProfileModal(true) }}
            className="btn btn-secondary text-xs py-1"
          >
            ✏️ Edit
          </button>
        </div>
      </div>

      {/* ── Appearance ──────────────────────────────────────────── */}
      <div className="card mb-4">
        <SectionTitle>🎨 Appearance</SectionTitle>

        {/* Theme */}
        <div className="mb-5 mt-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Theme</div>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['light', '☀️', 'Light',  'bg-white border border-slate-200'],
              ['dark',  '🌙', 'Dark',   'bg-slate-800 border border-slate-600'],
            ] as const).map(([t, icon, label, preview]) => (
              <button
                key={t}
                onClick={() => { setTheme(t); toast.success(`Theme: ${label}`) }}
                className={`p-3 rounded-xl border-2 text-center transition-all ${settings.theme === t ? 'border-2 bg-opacity-10' : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'}`}
                style={settings.theme === t ? { borderColor: 'var(--ac)', backgroundColor: 'var(--acl)' } : {}}
              >
                <div className={`h-8 rounded-md mb-2 ${preview}`} />
                <div className="text-lg mb-0.5">{icon}</div>
                <div className={`text-xs font-medium ${settings.theme === t ? '' : 'text-slate-600 dark:text-slate-400'}`}
                     style={settings.theme === t ? { color: 'var(--ac)' } : {}}>
                  {label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Accent Color */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Accent Color</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACCENTS) as AccentKey[]).map(key => {
              const ac = ACCENTS[key]
              const isActive = settings.accent === key
              return (
                <button
                  key={key}
                  onClick={() => { setAccent(key); toast.success(`Accent: ${ac.name}`) }}
                  title={ac.name}
                  className="relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-110"
                  style={{
                    backgroundColor: ac.hex,
                    boxShadow: isActive ? `0 0 0 3px white, 0 0 0 5px ${ac.hex}` : undefined,
                    transform: isActive ? 'scale(1.15)' : undefined,
                  }}
                >
                  {isActive && <span className="text-white text-xs font-bold">✓</span>}
                </button>
              )
            })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Active: <span className="font-medium" style={{ color: 'var(--ac)' }}>{ACCENTS[settings.accent].name}</span>
            {' '}— affects buttons, sidebar, toggles, and focus rings throughout the app
          </div>
        </div>

        {/* Font Size */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Font Size</div>
          <div className="flex gap-2">
            {(['small', 'medium', 'large'] as FontSize[]).map(s => (
              <button
                key={s}
                onClick={() => { setFontSize(s); toast.success(`Font: ${s}`) }}
                className={segmentBtn(settings.fontSize === s)}
                style={settings.fontSize === s ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}
              >
                <span style={{ fontSize: s === 'small' ? '11px' : s === 'large' ? '15px' : '13px' }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-xs text-slate-400">
            Preview: <span style={{ fontSize: settings.fontSize === 'small' ? '11px' : settings.fontSize === 'large' ? '15px' : '13px' }}>
              Smart Inventory and Waste Reducer
            </span>
          </div>
        </div>

        {/* Density */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Density</div>
          <div className="flex gap-2">
            {([
              ['compact',     'Compact',     '—',  'Tighter spacing'],
              ['default',     'Default',     '—',  'Standard spacing'],
              ['comfortable', 'Comfortable', '—',  'More breathing room'],
            ] as const).map(([d, label, , hint]) => (
              <button
                key={d}
                onClick={() => { setDensity(d as Density); toast.success(`Density: ${label}`) }}
                className={segmentBtn(settings.density === d)}
                style={settings.density === d ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}
                title={hint}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Language</div>
          <div className="flex gap-2">
            {([['en', '🇺🇸 English'], ['id', '🇮🇩 Indonesia']] as const).map(([lang, label]) => (
              <button
                key={lang}
                onClick={() => { setLanguage(lang as Language); toast.success(`Language: ${label}`) }}
                className={segmentBtn(settings.language === lang)}
                style={settings.language === lang ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Notifications ────────────────────────────────────────── */}
      <div className="card mb-4">
        <SectionTitle>🔔 Notification Preferences</SectionTitle>
        {([
          ['critical',      'Critical Stock Alerts',       'Notify when fill level drops below threshold'],
          ['expiration',    'Expiration Alerts',            'Notify for products expiring within 7 days'],
          ['temperature',   'Temperature Fluctuation',      'Alert when storage temp is outside safe range'],
          ['replenishment', 'Replenishment Updates',        'Confirm when automated orders are placed'],
          ['aiUpdate',      'AI Model Updates',             'Notify when LSTM model is retrained'],
          ['milestones',    'Waste Reduction Milestones',   'Celebrate waste prevention achievements'],
          ['sounds',        'Notification Sounds',          'Play sound on critical/warning alerts'],
        ] as const).map(([k, title, desc]) => (
          <SetRow key={k} title={title} desc={desc}>
            <Toggle
              label={title}
              checked={settings.notif[k]}
              onChange={() => {
                const newVal = !settings.notif[k]
                setNotif(k, newVal)
                toast.success(`${title}: ${newVal ? 'On' : 'Off'}`)
              }}
            />
          </SetRow>
        ))}
      </div>

      {/* ── IoT & Sensors ────────────────────────────────────────── */}
      <div className="card mb-4">
        <SectionTitle>📡 IoT & Sensor Configuration</SectionTitle>

        <SetRow title="Auto-refresh Rate" desc="How often to poll sensor data">
          <select
            className="input text-xs py-1 w-28"
            value={settings.iot.refreshRate}
            onChange={e => {
              setIot('refreshRate', e.target.value as RefreshRate)
              toast.success(`Refresh rate: ${e.target.value}`)
            }}
          >
            <option value="5s">5 seconds</option>
            <option value="10s">10 seconds</option>
            <option value="30s">30 seconds</option>
            <option value="1m">1 minute</option>
          </select>
        </SetRow>

        <SetRow
          title="Critical Fill Threshold"
          desc={`Alert when fill level drops below ${settings.iot.fillThreshold}%`}
        >
          <div className="flex items-center gap-2">
            <input
              type="range" min={5} max={40} step={5}
              value={settings.iot.fillThreshold}
              onChange={e => setIot('fillThreshold', Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs font-semibold w-8 text-accent" style={{ color: 'var(--ac)' }}>
              {settings.iot.fillThreshold}%
            </span>
          </div>
        </SetRow>

        <SetRow title="MQTT Auto-reconnect" desc="Auto-reconnect to HiveMQ broker on disconnect">
          <Toggle
            label="MQTT Auto-reconnect"
            checked={settings.iot.autoReconnect}
            onChange={() => {
              const v = !settings.iot.autoReconnect
              setIot('autoReconnect', v)
              toast.success(`MQTT auto-reconnect: ${v ? 'On' : 'Off'}`)
            }}
          />
        </SetRow>

        <SetRow title="Sensor Simulation Mode" desc="Use generated dummy data instead of live MQTT">
          <Toggle
            label="Simulation Mode"
            checked={settings.iot.simMode}
            onChange={() => {
              const v = !settings.iot.simMode
              setIot('simMode', v)
              toast.success(`Sim mode: ${v ? 'On (dummy data)' : 'Off (live MQTT)'}`)
            }}
          />
        </SetRow>
      </div>

      {/* ── AI & Forecasting ─────────────────────────────────────── */}
      <div className="card mb-4">
        <SectionTitle>🧠 AI & Forecasting</SectionTitle>

        <SetRow title="Auto Re-train Model" desc="Retrain LSTM automatically every 24 hours">
          <Toggle
            label="Auto Re-train"
            checked={settings.ai.autoRetrain}
            onChange={() => {
              const v = !settings.ai.autoRetrain
              setAi('autoRetrain', v)
              toast.success(`Auto re-train: ${v ? 'On' : 'Off'}`)
            }}
          />
        </SetRow>

        <SetRow title="Default Forecast Horizon" desc="Default prediction window for LSTM output">
          <select
            className="input text-xs py-1 w-28"
            value={settings.ai.forecastHorizon}
            onChange={e => {
              setAi('forecastHorizon', e.target.value as ForecastHorizon)
              toast.success(`Forecast horizon: ${e.target.value} days`)
            }}
          >
            <option value="30">30 Days</option>
            <option value="90">90 Days</option>
            <option value="180">180 Days</option>
          </select>
        </SetRow>

        <SetRow
          title="LSTM Hidden Units"
          desc={`Model capacity: ${settings.ai.lstmUnits} units (more = smarter but slower)`}
        >
          <div className="flex items-center gap-2">
            <input
              type="range" min={16} max={128} step={16}
              value={settings.ai.lstmUnits}
              onChange={e => setAi('lstmUnits', Number(e.target.value) as LstmUnits)}
              className="w-24"
            />
            <span className="text-xs font-semibold w-7 text-right" style={{ color: 'var(--ac)' }}>
              {settings.ai.lstmUnits}
            </span>
          </div>
        </SetRow>

        <SetRow title="AI Waste Recommendations" desc="Show AI-generated action suggestions on waste items">
          <Toggle
            label="AI Recommendations"
            checked={settings.ai.aiRecs}
            onChange={() => {
              const v = !settings.ai.aiRecs
              setAi('aiRecs', v)
              toast.success(`AI recs: ${v ? 'On' : 'Off'}`)
            }}
          />
        </SetRow>

        <SetRow title="Show Confidence Interval" desc="Display ±% confidence bands on forecast charts">
          <Toggle
            label="Confidence Interval"
            checked={settings.ai.showConfidence}
            onChange={() => {
              const v = !settings.ai.showConfidence
              setAi('showConfidence', v)
              toast.success(`Confidence bands: ${v ? 'On' : 'Off'}`)
            }}
          />
        </SetRow>
      </div>

      {/* ── System Info ──────────────────────────────────────────── */}
      <div className="card mb-4">
        <SectionTitle>ℹ️ System Information</SectionTitle>
        {[
          { t: 'App Version',  d: 'Smart Inventory and Waste Reducer', v: 'v2.4.1' },
          { t: 'Frontend',     d: 'React 18 + TypeScript + Tailwind CSS',         v: <span className="badge bg-green-100 text-green-700">Running</span> },
          { t: 'Backend',      d: 'Node.js + Express on port 5001',               v: <span className="badge bg-green-100 text-green-700">Online</span> },
          { t: 'Database',     d: 'MongoDB Atlas via Mongoose',                   v: <span className="badge bg-green-100 text-green-700">Connected</span> },
          { t: 'MQTT Broker',  d: 'HiveMQ Cloud — MQTT over WebSocket',           v: <span className="badge bg-amber-100 text-amber-700">Not configured</span> },
          { t: 'ML Model',     d: 'Pure NumPy LSTM — last trained 2h ago',        v: <span className="badge bg-purple-100 text-purple-700">94.2% accuracy</span> },
          { t: 'Active Accent',d: `CSS --ac = ${ACCENTS[settings.accent].hex}`,   v: <span className="w-4 h-4 rounded-full inline-block border border-slate-200" style={{ backgroundColor: 'var(--ac)' }} /> },
          { t: 'Current Theme',d: 'Applied globally via dark class on <html>',    v: <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{settings.theme}</span> },
        ].map(r => (
          <SetRow key={r.t} title={r.t} desc={r.d}>
            <span className="text-xs text-slate-500 dark:text-slate-400">{r.v}</span>
          </SetRow>
        ))}
      </div>

      {/* ── Danger Zone ──────────────────────────────────────────── */}
      <div className="card mb-4 border-red-200 dark:border-red-900">
        <h3 className="text-sm font-semibold text-red-600 mb-3">⚠️ Danger Zone</h3>
        <SetRow title="Reset All Settings" desc="Restore all appearance and notification preferences to defaults">
          <button onClick={() => setResetModal(true)} className="btn btn-secondary text-xs py-1 border-red-200 text-red-500 hover:bg-red-50">
            ↺ Reset
          </button>
        </SetRow>
        <SetRow title="Sign Out" desc="Log out from this device and clear session">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="btn btn-danger text-xs py-1 disabled:opacity-60"
          >
            {loggingOut ? '⏳ Logging out…' : '🚪 Logout'}
          </button>
        </SetRow>
      </div>

      {/* ── Profile Modal ─────────────────────────────────────────── */}
      <Modal open={profileModal} onClose={() => setProfileModal(false)} title="Edit Profile">
        <div className="space-y-3">
          {([
            ['name',        'Full Name',                   'Erick Santoso'],
            ['role',        'Role',                        'IT Developer'],
            ['institution', 'Institution',                 'BINUS University'],
            ['email',       'Email Address',               'you@example.com'],
            ['initials',    'Avatar Initials (max 2 chars)', 'ES'],
          ] as const).map(([k, label, placeholder]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input
                className="input text-xs"
                placeholder={placeholder}
                maxLength={k === 'initials' ? 2 : undefined}
                value={(profileForm as any)[k]}
                onChange={e => setProfileForm(p => ({ ...p, [k]: e.target.value }))}
              />
            </div>
          ))}

          {/* Avatar preview */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: 'var(--ac)' }}
            >
              {profileForm.initials || profileForm.name?.slice(0, 2).toUpperCase() || '?'}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{profileForm.name || '—'}</div>
              <div className="text-xs text-slate-400">{profileForm.role} · {profileForm.institution}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => setProfileModal(false)} className="btn btn-secondary text-xs flex-1">Cancel</button>
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="btn text-xs flex-1 text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' }}
          >
            {savingProfile ? '⏳ Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </Modal>

      {/* ── Reset Confirm Modal ───────────────────────────────────── */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Reset All Settings" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          This will reset all appearance, notification, IoT, and AI preferences to defaults.
          Your profile and data are not affected.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setResetModal(false)} className="btn btn-secondary text-xs flex-1">Cancel</button>
          <button onClick={handleReset} className="btn btn-danger text-xs flex-1">↺ Reset All</button>
        </div>
      </Modal>
    </div>
  )
}
