import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts'
import api from '../lib/api'
import toast from 'react-hot-toast'

interface Sensor {
  sensorId: string
  name: string
  zone: string
  type: string
  temperature: number
  humidity: number
  weight: number
  batteryLevel: number
  rfid: string
  status: 'online' | 'offline' | 'warning'
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
  updatesPerMin: number
  avgResponseMs: number
  zonesMonitored: number
  lastSimulation: string
}

interface HistoryPoint {
  time: string
  zoneA_temp: number
  zoneB_temp: number
  zoneD_temp: number
  avgHumidity: number
  anomaly: boolean
}

const ZONE_COLORS: Record<string, string> = {
  A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#6366f1',
  E: '#ec4899', F: '#14b8a6', G: '#f97316',
}

const statusCls = (s: string) =>
  s === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  : s === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

const battColor = (b: number) => b > 50 ? 'bg-green-500' : b > 20 ? 'bg-amber-500' : 'bg-red-500'

export default function IoTSensorNetwork() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [stats, setStats] = useState<IoTStats | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [autoSim, setAutoSim] = useState(false)
  const [selectedZone, setSelectedZone] = useState('ALL')
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null)
  const [simCount, setSimCount] = useState(0)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, stRes, hRes] = await Promise.all([
        api.get('/iot/sensors'),
        api.get('/iot/stats'),
        api.get('/iot/history'),
      ])
      setSensors(sRes.data.data || [])
      setStats(stRes.data.data)
      setHistory(hRes.data.data || [])
    } catch {
      toast.error('Failed to load IoT data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const runSimulation = async (silent = false) => {
    setSimulating(true)
    try {
      const res = await api.post('/iot/simulate')
      const { summary } = res.data
      setSimCount(c => c + 1)
      await fetchAll()
      if (!silent) {
        toast.success(`Simulation complete — ${summary.warnings} warnings, ${summary.anomalies} anomalies`)
      }
    } catch {
      if (!silent) toast.error('Simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  const toggleAutoSim = () => {
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

  const zones = ['ALL', ...Array.from(new Set(sensors.map(s => s.zone))).sort()]
  const filtered = selectedZone === 'ALL' ? sensors : sensors.filter(s => s.zone === selectedZone)
  const onlineCount = sensors.filter(s => s.status === 'online').length
  const warnCount = sensors.filter(s => s.status === 'warning').length

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">IoT Sensor Network</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitoring real-time {stats?.zonesMonitored ?? 7} zona · {sensors.length} sensor aktif milik kamu
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${autoSim ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoSim ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            {autoSim ? 'Auto-sim Running' : 'Manual Mode'}
          </span>
          <button onClick={toggleAutoSim}
            className={`btn text-xs ${autoSim ? 'btn-danger' : 'btn-success'}`}>
            {autoSim ? '⏹ Stop Auto' : '▶ Auto Simulate'}
          </button>
          <button onClick={() => runSimulation(false)} disabled={simulating}
            className="btn btn-primary text-xs disabled:opacity-60">
            {simulating ? '⏳ Running…' : '🔄 Run Sim'}
          </button>
          <button onClick={fetchAll} className="btn btn-secondary text-xs">↺ Refresh</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Sensors</div>
          <div className="text-2xl font-semibold text-blue-600">{stats?.totalSensors || sensors.length}</div>
          <div className="text-xs text-slate-400">{stats?.zonesMonitored || 7} zones</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Online</div>
          <div className="text-2xl font-semibold text-green-600">{onlineCount || stats?.online || 0}</div>
          <div className="text-xs text-green-600">↑ {stats?.uptime || 98.5}% uptime</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Warnings</div>
          <div className="text-2xl font-semibold text-amber-500">{warnCount || stats?.warning || 0}</div>
          <div className="text-xs text-amber-500">Needs attention</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Avg Battery</div>
          <div className="text-2xl font-semibold text-purple-600">{stats?.avgBattery || 82}%</div>
          <div className="text-xs text-slate-400">Across all sensors</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Simulations Run</div>
          <div className="text-2xl font-semibold text-teal-600">{simCount}</div>
          <div className="text-xs text-slate-400">This session</div>
        </div>
      </div>

      {/* Zone filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {zones.map(z => (
          <button key={z} onClick={() => setSelectedZone(z)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${selectedZone === z
              ? 'text-white'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'}`}
            style={selectedZone === z ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}>
            {z === 'ALL' ? `All Zones (${sensors.length})` : (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[z] || '#94a3b8' }} />
                Zone {z} ({sensors.filter(s => s.zone === z).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sensor Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-36 animate-pulse bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {filtered.map(sensor => {
            const zoneColor = ZONE_COLORS[sensor.zone] || '#94a3b8'
            return (
              <div key={sensor.sensorId}
                onClick={() => setSelectedSensor(sensor === selectedSensor ? null : sensor)}
                className={`card cursor-pointer transition-all hover:shadow-md border-l-4 ${sensor === selectedSensor ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}
                style={{ borderLeftColor: zoneColor }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">{sensor.sensorId}</div>
                    <div className="text-xs text-slate-400 leading-tight">{sensor.name.split(' - ')[0]}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
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

                {/* Battery bar */}
                <div>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-slate-400">Battery</span>
                    <span className={`font-medium ${sensor.batteryLevel < 20 ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>{sensor.batteryLevel}%</span>
                  </div>
                  <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                    <div className={`h-full rounded-full ${battColor(sensor.batteryLevel)} transition-all`}
                      style={{ width: `${sensor.batteryLevel}%` }} />
                  </div>
                </div>

                {sensor.alerts.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {sensor.alerts.map((a, i) => (
                      <div key={i} className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-1.5 py-0.5">⚠ {a}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
              { l: 'RFID Tag', v: selectedSensor.rfid },
              { l: 'Zone', v: `Zone ${selectedSensor.zone}` },
              { l: 'Sensor Type', v: selectedSensor.type },
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
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}°C`} />
              <Tooltip formatter={(v: any) => `${v}°C`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="zoneA_temp" stroke="#22c55e" name="Zone A" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="zoneB_temp" stroke="#3b82f6" name="Zone B" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="zoneD_temp" stroke="#6366f1" name="Zone D (Frozen)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">24h Humidity Trend</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Area type="monotone" dataKey="avgHumidity" stroke="#14b8a6" fill="rgba(20,184,166,0.15)" name="Avg Humidity" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Zone summary table */}
      <div className="card mt-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Zone Status Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                {['Zone', 'Category', 'Sensors', 'Avg Temp', 'Avg Humidity', 'Avg Battery', 'Status'].map(h => (
                  <th key={h} className="text-left text-slate-400 font-medium pb-2 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(sensors.map(s => s.zone))).sort().map(zone => {
                const zoneSensors = sensors.filter(s => s.zone === zone)
                const avgTemp = zoneSensors.length > 0
                  ? (zoneSensors.reduce((s, x) => s + x.temperature, 0) / zoneSensors.length).toFixed(1)
                  : '—'
                const avgHum = zoneSensors.length > 0
                  ? Math.round(zoneSensors.reduce((s, x) => s + x.humidity, 0) / zoneSensors.length)
                  : '—'
                const avgBatt = zoneSensors.length > 0
                  ? Math.round(zoneSensors.reduce((s, x) => s + x.batteryLevel, 0) / zoneSensors.length)
                  : '—'
                const hasWarn = zoneSensors.some(s => s.status === 'warning')
                const categories: Record<string, string> = { A:'Fresh Produce', B:'Dairy', C:'Beverages', D:'Frozen', E:'Bakery', F:'Snacks', G:'Prepared Foods' }
                return (
                  <tr key={zone} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ZONE_COLORS[zone] || '#94a3b8' }} />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Zone {zone}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{categories[zone] || '—'}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{zoneSensors.length}</td>
                    <td className="py-2 pr-4 font-medium text-blue-600">{avgTemp}°C</td>
                    <td className="py-2 pr-4 font-medium text-green-600">{avgHum}%</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full w-12">
                          <div className={`h-full rounded-full ${battColor(Number(avgBatt))}`} style={{ width: `${avgBatt}%` }} />
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
    </div>
  )
}
