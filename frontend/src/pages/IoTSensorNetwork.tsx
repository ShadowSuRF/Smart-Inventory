import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts'
import api from '../lib/api'
import Modal from '../components/ui/Modal'
import { Spinner } from '../components/ui/PageLoader'
import { useSettings } from '../context/SettingsContext'
import toast from 'react-hot-toast'

interface Sensor {
  _id: string
  sensorId: string
  name: string
  zone: string
  type: string
  temperature: number
  humidity: number
  weight: number
  batteryLevel: number
  status: 'online' | 'offline' | 'warning'
  source: 'simulated' | 'mqtt'
  lastSeen: string
  optimal: { tempMin: number; tempMax: number; humMin: number; humMax: number }
  alerts: string[]
}

interface IoTStats {
  totalSensors: number
  online: number
  warning: number
  offline: number
  avgBattery: number
  uptime: number
  zonesMonitored: number
  lastSimulation: string | null
}

interface HistoryZone { zone: string; key: string; label: string; color: string }
interface HistoryPoint {
  time: string
  avgHumidity: number
  anomaly: boolean
  [key: string]: any
}

const PALETTE = ['#22c55e', '#3b82f6', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#f97316']

const statusCls = (s: string) =>
  s === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  : s === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

const battColor = (b: number) => b > 50 ? 'bg-green-500' : b > 20 ? 'bg-amber-500' : 'bg-red-500'

// Preset buat prefill form "Tambah Sensor" — user tetep bebas override manual.
const PRESETS: Record<string, { tempMin: number; tempMax: number; humMin: number; humMax: number }> = {
  'Fresh Produce / Cold Storage': { tempMin: 2,   tempMax: 8,   humMin: 85, humMax: 95 },
  'Dairy Fridge':                 { tempMin: 2,   tempMax: 6,   humMin: 70, humMax: 85 },
  'Room Temp / Beverages':        { tempMin: 15,  tempMax: 22,  humMin: 40, humMax: 60 },
  'Freezer':                      { tempMin: -20, tempMax: -15, humMin: 30, humMax: 50 },
  'Bakery Shelf':                 { tempMin: 18,  tempMax: 24,  humMin: 50, humMax: 65 },
  'Custom':                       { tempMin: 0,   tempMax: 30,  humMin: 30, humMax: 90 },
}
const SENSOR_TYPES = ['temp+humidity', 'weight+temp', 'rfid+humidity', 'weight+rfid', 'temp+weight', 'humidity+rfid']
const EMPTY_FORM = {
  name: '', zone: '', type: 'temp+humidity', preset: 'Fresh Produce / Cold Storage',
  tempMin: 2, tempMax: 8, humMin: 85, humMax: 95,
}

export default function IoTSensorNetwork() {
  const { settings } = useSettings()
  const simMode = settings.iot.simMode
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [stats, setStats] = useState<IoTStats | null>(null)
  const [historyZones, setHistoryZones] = useState<HistoryZone[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [autoSim, setAutoSim] = useState(false)
  const [selectedZone, setSelectedZone] = useState('ALL')
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null)
  const [simCount, setSimCount] = useState(0)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Setup popup (tambah/edit sensor) ──────────────────────────────
  const [setupModal, setSetupModal] = useState(false)
  const [editingSensor, setEditingSensor] = useState<Sensor | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Sensor | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, stRes, hRes] = await Promise.all([
        api.get('/iot/sensors'),
        api.get('/iot/stats'),
        api.get('/iot/history'),
      ])
      setSensors(sRes.data.data || [])
      setStats(stRes.data.data)
      setHistoryZones(hRes.data.zones || [])
      setHistory(hRes.data.data || [])
    } catch {
      toast.error('Gagal memuat data IoT')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const runSimulation = async (silent = false) => {
    if (!simMode) {
      if (!silent) toast.error('Simulation Mode lagi off (cek Settings) — nunggu data live MQTT')
      return
    }
    if (sensors.length === 0) {
      if (!silent) toast.error('Belum ada sensor — tambahkan sensor dulu')
      return
    }
    setSimulating(true)
    try {
      const res = await api.post('/iot/simulate')
      const { summary } = res.data
      setSimCount(c => c + 1)
      await fetchAll()
      if (!silent) toast.success(`Simulation complete — ${summary.warnings} warnings, ${summary.anomalies} anomalies`)
    } catch {
      if (!silent) toast.error('Simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  const toggleAutoSim = () => {
    if (!simMode) { toast.error('Simulation Mode lagi off (cek Settings) — nunggu data live MQTT'); return }
    if (sensors.length === 0) { toast.error('Belum ada sensor — tambahkan sensor dulu'); return }
    if (autoSim) {
      if (autoRef.current) clearInterval(autoRef.current)
      autoRef.current = null
      setAutoSim(false)
      toast('Auto-simulation stopped')
    } else {
      setAutoSim(true)
      toast.success('Auto-simulation started (every 5s)')
      autoRef.current = setInterval(() => runSimulation(true), 5000)
    }
  }
  useEffect(() => () => { if (autoRef.current) clearInterval(autoRef.current) }, [])
  useEffect(() => {
    if (!simMode && autoRef.current) {
      clearInterval(autoRef.current)
      autoRef.current = null
      setAutoSim(false)
    }
  }, [simMode])

  // ── Setup handlers (ini "popup component" buat user setup IoT) ────
  const openAdd = () => { setEditingSensor(null); setForm(EMPTY_FORM); setSetupModal(true) }
  const openEdit = (s: Sensor) => {
    setEditingSensor(s)
    setForm({
      name: s.name, zone: s.zone, type: s.type, preset: 'Custom',
      tempMin: s.optimal.tempMin, tempMax: s.optimal.tempMax,
      humMin: s.optimal.humMin, humMax: s.optimal.humMax,
    })
    setSetupModal(true)
  }
  const applyPreset = (preset: string) => {
    const p = PRESETS[preset]
    setForm(f => ({ ...f, preset, ...(p || {}) }))
  }
  const saveDevice = async () => {
    if (!form.name.trim() || !form.zone.trim()) { toast.error('Nama sensor dan lokasi/zone wajib diisi'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(), zone: form.zone.trim(), type: form.type,
        tempMin: Number(form.tempMin), tempMax: Number(form.tempMax),
        humMin: Number(form.humMin), humMax: Number(form.humMax),
      }
      if (editingSensor) {
        await api.put(`/iot/devices/${editingSensor._id}`, payload)
        toast.success('Sensor berhasil diupdate')
      } else {
        await api.post('/iot/devices', payload)
        toast.success('Sensor baru berhasil ditambahkan')
      }
      setSetupModal(false)
      await fetchAll()
    } catch {
      /* error toast sudah dihandle interceptor di lib/api.ts */
    } finally {
      setSaving(false)
    }
  }
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/iot/devices/${deleteTarget._id}`)
      toast.success('Sensor dihapus')
      if (selectedSensor?._id === deleteTarget._id) setSelectedSensor(null)
      setDeleteTarget(null)
      await fetchAll()
    } catch {
    } finally {
      setDeleting(false)
    }
  }

  const sortedZones = Array.from(new Set(sensors.map(s => s.zone))).sort()
  const zoneColor = (zone: string) => PALETTE[sortedZones.indexOf(zone) % PALETTE.length] || '#94a3b8'
  const zones = ['ALL', ...sortedZones]
  const filtered = selectedZone === 'ALL' ? sensors : sensors.filter(s => s.zone === selectedZone)
  const onlineCount = sensors.filter(s => s.status === 'online').length
  const warnCount = sensors.filter(s => s.status === 'warning').length

  return (
    <div>
      <div className="flex items-start justify-between mb-5 animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">IoT Sensor Network</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sensors.length} sensor · {stats?.zonesMonitored ?? 0} lokasi — setup milik kamu sendiri
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${autoSim ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoSim ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            {autoSim ? 'Auto-sim Running' : 'Manual Mode'}
          </span>
          <button onClick={openAdd} className="btn btn-primary text-xs">+ Tambah Sensor</button>
          {simMode ? (
            <>
              <button onClick={toggleAutoSim} className={`btn text-xs ${autoSim ? 'btn-danger' : 'btn-success'}`}>
                {autoSim ? '⏹ Stop Auto' : '▶ Auto Simulate'}
              </button>
              <button onClick={() => runSimulation(false)} disabled={simulating} className="btn btn-primary text-xs disabled:opacity-60">
                {simulating ? '⏳ Running…' : '🔄 Run Sim'}
              </button>
            </>
          ) : (
            <span className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
              📡 Live MQTT mode (Settings)
            </span>
          )}
          <button onClick={fetchAll} className="btn btn-secondary text-xs">↺ Refresh</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Sensors</div>
          <div className="text-2xl font-semibold text-blue-600">{stats?.totalSensors ?? sensors.length}</div>
          <div className="text-xs text-slate-400">{stats?.zonesMonitored ?? 0} lokasi</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Online</div>
          <div className="text-2xl font-semibold text-green-600">{onlineCount}</div>
          <div className="text-xs text-green-600">↑ {stats?.uptime ?? 0}% uptime</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Warnings</div>
          <div className="text-2xl font-semibold text-amber-500">{warnCount}</div>
          <div className="text-xs text-amber-500">Needs attention</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Avg Battery</div>
          <div className="text-2xl font-semibold text-purple-600">{stats?.avgBattery ?? 0}%</div>
          <div className="text-xs text-slate-400">Across all sensors</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Simulations Run</div>
          <div className="text-2xl font-semibold text-teal-600">{simCount}</div>
          <div className="text-xs text-slate-400">This session</div>
        </div>
      </div>

      {/* Zone filter */}
      {sensors.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {zones.map(z => (
            <button key={z} onClick={() => setSelectedZone(z)}
              className={`text-xs px-3 py-1 rounded-full border transition-all ${selectedZone === z
                ? 'text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'}`}
              style={selectedZone === z ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}>
              {z === 'ALL' ? `All Locations (${sensors.length})` : (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: zoneColor(z) }} />
                  {z} ({sensors.filter(s => s.zone === z).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Sensor Grid / Empty state */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-36 skeleton" />)}
        </div>
      ) : sensors.length === 0 ? (
        <div className="card text-center py-16 animate-fade-in-scale mb-5">
          <div className="text-5xl mb-4">📡</div>
          <div className="font-medium text-slate-600 dark:text-slate-300">Belum ada sensor IoT</div>
          <div className="text-xs text-slate-400 mt-1 mb-4 max-w-sm mx-auto">
            Sensor di sini bukan data dummy lagi — tambahkan sensor pertamamu sendiri: nama, lokasi/zone, dan ambang batas suhu/kelembapan-nya kamu yang atur.
          </div>
          <button onClick={openAdd} className="btn btn-primary text-xs mx-auto">+ Tambah Sensor Pertama</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {filtered.map(sensor => (
            <div key={sensor._id}
              onClick={() => setSelectedSensor(sensor === selectedSensor ? null : sensor)}
              className={`card cursor-pointer transition-all hover:shadow-md border-l-4 ${sensor === selectedSensor ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}
              style={{ borderLeftColor: zoneColor(sensor.zone) }}>
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">{sensor.name}</div>
                  <div className="text-xs text-slate-400 leading-tight">{sensor.sensorId} · {sensor.zone}</div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`badge text-xs ${statusCls(sensor.status)}`}>{sensor.status}</span>
                  <span className="badge text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">{sensor.type}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-xs mb-2">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-1.5 text-center">
                  <div className="text-slate-400 text-xs">Temp</div>
                  <div className={`font-semibold ${sensor.temperature < sensor.optimal.tempMin || sensor.temperature > sensor.optimal.tempMax ? 'text-red-500' : 'text-blue-600'}`}>
                    {sensor.temperature}°C
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded p-1.5 text-center">
                  <div className="text-slate-400 text-xs">Humidity</div>
                  <div className="font-semibold text-green-600">{sensor.humidity}%</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-1.5 text-center">
                  <div className="text-slate-400 text-xs">Weight</div>
                  <div className="font-semibold text-purple-600">{sensor.weight}kg</div>
                </div>
              </div>

              <div className="mb-2">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-400">Battery</span>
                  <span className={`font-medium ${sensor.batteryLevel < 20 ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>{sensor.batteryLevel}%</span>
                </div>
                <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className={`h-full rounded-full ${battColor(sensor.batteryLevel)} transition-all`} style={{ width: `${sensor.batteryLevel}%` }} />
                </div>
              </div>

              {sensor.alerts.length > 0 && (
                <div className="mb-2 space-y-0.5">
                  {sensor.alerts.map((a, i) => (
                    <div key={i} className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-1.5 py-0.5">⚠ {a}</div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                <button onClick={(e) => { e.stopPropagation(); openEdit(sensor) }}
                  className="text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex-1 text-left pt-1">✎ Edit</button>
                <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(sensor) }}
                  className="text-xs text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 pt-1">🗑 Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sensor Detail Panel */}
      {selectedSensor && (
        <div className="card mb-5 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedSensor.sensorId} — Detail View</h3>
              <div className="text-xs text-slate-500 dark:text-slate-400">{selectedSensor.name}</div>
            </div>
            <button onClick={() => setSelectedSensor(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg">×</button>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            {[
              { l: 'Zone / Lokasi', v: selectedSensor.zone },
              { l: 'Sensor Type', v: selectedSensor.type },
              { l: 'Data Source', v: selectedSensor.source === 'mqtt' ? '📡 Live MQTT' : '🧪 Simulated' },
              { l: 'Last Seen', v: new Date(selectedSensor.lastSeen).toLocaleTimeString() },
              { l: 'Optimal Temp', v: `${selectedSensor.optimal.tempMin}–${selectedSensor.optimal.tempMax}°C` },
              { l: 'Optimal Humidity', v: `${selectedSensor.optimal.humMin}–${selectedSensor.optimal.humMax}%` },
              { l: 'Current Temp', v: `${selectedSensor.temperature}°C`, alert: selectedSensor.temperature < selectedSensor.optimal.tempMin || selectedSensor.temperature > selectedSensor.optimal.tempMax },
              { l: 'Current Humidity', v: `${selectedSensor.humidity}%` },
            ].map(r => (
              <div key={r.l} className="bg-white dark:bg-slate-800 rounded-lg p-2.5">
                <div className="text-slate-400 mb-0.5">{r.l}</div>
                <div className={`font-semibold ${(r as any).alert ? 'text-red-500' : 'text-slate-900 dark:text-slate-100'}`}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">24h Temperature History</h3>
          {historyZones.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">Belum ada data — tambahkan sensor dulu</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}°C`} />
                <Tooltip formatter={(v: any) => `${v}°C`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {historyZones.map(z => (
                  <Line key={z.key} type="monotone" dataKey={z.key} stroke={z.color} name={z.label} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">24h Humidity Trend</h3>
          {historyZones.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">Belum ada data — tambahkan sensor dulu</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Area type="monotone" dataKey="avgHumidity" stroke="#14b8a6" fill="rgba(20,184,166,0.15)" name="Avg Humidity" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Zone summary table */}
      {sensors.length > 0 && (
        <div className="card mt-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Location Status Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  {['Lokasi', 'Sensors', 'Avg Temp', 'Avg Humidity', 'Avg Battery', 'Status'].map(h => (
                    <th key={h} className="text-left text-slate-400 font-medium pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedZones.map(zone => {
                  const zoneSensors = sensors.filter(s => s.zone === zone)
                  const avgTemp = (zoneSensors.reduce((s, x) => s + x.temperature, 0) / zoneSensors.length).toFixed(1)
                  const avgHum  = Math.round(zoneSensors.reduce((s, x) => s + x.humidity, 0) / zoneSensors.length)
                  const avgBatt = Math.round(zoneSensors.reduce((s, x) => s + x.batteryLevel, 0) / zoneSensors.length)
                  const hasWarn = zoneSensors.some(s => s.status === 'warning')
                  return (
                    <tr key={zone} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zoneColor(zone) }} />
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{zone}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{zoneSensors.length}</td>
                      <td className="py-2 pr-4 font-medium text-blue-600">{avgTemp}°C</td>
                      <td className="py-2 pr-4 font-medium text-green-600">{avgHum}%</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full w-12">
                            <div className={`h-full rounded-full ${battColor(avgBatt)}`} style={{ width: `${avgBatt}%` }} />
                          </div>
                          <span className="font-medium text-slate-600 dark:text-slate-400">{avgBatt}%</span>
                        </div>
                      </td>
                      <td className="py-2">
                        <span className={`badge text-xs ${hasWarn ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {hasWarn ? '⚠ Warning' : '✓ Optimal'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Setup Popup: Tambah/Edit Sensor ──────────────────────────── */}
      <Modal open={setupModal} onClose={() => setSetupModal(false)} title={editingSensor ? 'Edit Sensor' : 'Tambah Sensor Baru'}>
        <div className="space-y-3">
          <div>
            <label className="label">Nama Sensor *</label>
            <input className="input text-xs" placeholder="Cold Storage Sensor 1" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Zone / Lokasi *</label>
              <input className="input text-xs" placeholder="Gudang A, Kulkas 1, dll" value={form.zone}
                onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tipe Sensor</label>
              <select className="input text-xs" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {SENSOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Preset Ambang Batas</label>
            <select className="input text-xs" value={form.preset} onChange={e => applyPreset(e.target.value)}>
              {Object.keys(PRESETS).map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Suhu Min (°C)</label>
              <input type="number" className="input text-xs" value={form.tempMin}
                onChange={e => setForm(f => ({ ...f, tempMin: Number(e.target.value), preset: 'Custom' }))} />
            </div>
            <div>
              <label className="label">Suhu Max (°C)</label>
              <input type="number" className="input text-xs" value={form.tempMax}
                onChange={e => setForm(f => ({ ...f, tempMax: Number(e.target.value), preset: 'Custom' }))} />
            </div>
            <div>
              <label className="label">Humidity Min (%)</label>
              <input type="number" className="input text-xs" value={form.humMin}
                onChange={e => setForm(f => ({ ...f, humMin: Number(e.target.value), preset: 'Custom' }))} />
            </div>
            <div>
              <label className="label">Humidity Max (%)</label>
              <input type="number" className="input text-xs" value={form.humMax}
                onChange={e => setForm(f => ({ ...f, humMax: Number(e.target.value), preset: 'Custom' }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setSetupModal(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={saveDevice} disabled={saving} className="btn btn-primary flex-1 text-xs disabled:opacity-60">
              {saving ? <><Spinner size={12} /> Menyimpan…</> : editingSensor ? 'Simpan Perubahan' : 'Tambah Sensor'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm popup ─────────────────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Sensor" size="sm">
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Yakin mau hapus sensor <strong>{deleteTarget?.name}</strong> ({deleteTarget?.sensorId})? Aksi ini gak bisa dibatalkan.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={confirmDelete} disabled={deleting} className="btn btn-danger flex-1 text-xs disabled:opacity-60">
              {deleting ? <><Spinner size={12} /> Menghapus…</> : 'Hapus'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
