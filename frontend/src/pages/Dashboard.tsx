import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboardStats, runIoTSimulation, getIoTSensors } from '../lib/api'
import KpiCard from '../components/ui/KpiCard'
import { formatCurrency, formatNumber } from '../lib/utils'
import type { DashboardStats } from '../types'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  // IoT env dari sensor nyata milik user
  const [env, setEnv] = useState<{ temp: number; humidity: number; tempOk: boolean; humOk: boolean } | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, sensorRes] = await Promise.all([
        getDashboardStats(),
        getIoTSensors().catch(() => null),
      ])
      setStats(statsRes.data.data)

      // Ambil rata-rata temp & humidity dari sensor zone A (fresh produce)
      if (sensorRes?.data?.data?.length) {
        const sensors: any[] = sensorRes.data.data
        const zoneA = sensors.filter((s: any) => s.zone === 'A' || s.zone === 'B')
        const avgTemp = zoneA.length
          ? parseFloat((zoneA.reduce((s: number, x: any) => s + x.temperature, 0) / zoneA.length).toFixed(1))
          : sensors[0].temperature
        const avgHum  = zoneA.length
          ? Math.round(zoneA.reduce((s: number, x: any) => s + x.humidity, 0) / zoneA.length)
          : sensors[0].humidity
        setEnv({ temp: avgTemp, humidity: avgHum, tempOk: avgTemp >= 2 && avgTemp <= 8, humOk: avgHum >= 70 && avgHum <= 95 })
      }
    } catch {
      toast.error('Gagal memuat dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  // Simulate IoT → hit API → simpan ke MongoDB → refresh sensor
  const simulateIoT = async () => {
    setSimulating(true)
    try {
      await runIoTSimulation()
      toast.success('IoT tick disimulasikan! Data sensor diperbarui.')
      // Refresh sensor data setelah simulate
      const sensorRes = await getIoTSensors()
      const sensors: any[] = sensorRes.data.data || []
      if (sensors.length) {
        const zoneA = sensors.filter((s: any) => s.zone === 'A' || s.zone === 'B')
        const src = zoneA.length ? zoneA : sensors
        const avgTemp = parseFloat((src.reduce((s: number, x: any) => s + x.temperature, 0) / src.length).toFixed(1))
        const avgHum  = Math.round(src.reduce((s: number, x: any) => s + x.humidity, 0) / src.length)
        setEnv({ temp: avgTemp, humidity: avgHum, tempOk: avgTemp >= 2 && avgTemp <= 8, humOk: avgHum >= 70 && avgHum <= 95 })
        const hasWarning = sensors.some((s: any) => s.status === 'warning')
        if (hasWarning) toast.error('⚠️ Beberapa sensor di luar range optimal!', { duration: 4000 })
      }
    } catch {
      toast.error('Gagal menjalankan simulasi IoT')
    } finally {
      setSimulating(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="text-3xl mb-3 animate-pulse">📊</div>
        <div className="text-sm text-slate-400">Memuat dashboard…</div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard Overview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Data real-time inventori kamu</p>
        </div>
        <button onClick={fetchStats} className="btn btn-secondary text-xs py-1">🔄 Refresh</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total Items" value={formatNumber(stats?.totalItems || 0)} sub="Total unit di inventori" icon="📦" />
        <KpiCard label="Stock Value" value={formatCurrency(stats?.stockValue || 0)} sub="Estimasi nilai stok" icon="📈" />
        <KpiCard label="Waste Reduction" value={`${stats?.wasteReduction || 0}%`} sub="Pengurangan pemborosan" icon="🌱" />
        <KpiCard label="Critical Alerts" value={stats?.criticalAlerts || 0} sub="Item stok kritis" subColor="text-red-500" icon="⚠️" iconColor="text-orange-500" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button onClick={() => navigate('/replenishment')} className="btn btn-primary w-full justify-center text-xs py-2">🔄 Generate Replenishment Order</button>
            <button onClick={() => navigate('/waste-prevention')} className="btn btn-secondary w-full justify-center text-xs py-2">🌱 View Expiring Items</button>
            <button onClick={() => navigate('/forecasting')} className="btn btn-secondary w-full justify-center text-xs py-2">🧠 Run AI Forecast</button>
            <button onClick={() => navigate('/profit')} className="btn btn-secondary w-full justify-center text-xs py-2">💰 Profit & Loss Dashboard</button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Environmental Status</h3>
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              {env ? 'Live dari sensor' : 'Belum disimulasi'}
            </span>
          </div>
          {env ? (
            <>
              {[
                { label: 'Temperature (Zone A/B)', value: `${env.temp}°C`, ok: env.tempOk, pct: Math.min(Math.max((env.temp + 20) / 50 * 100, 0), 100), range: '2–8°C' },
                { label: 'Humidity (Zone A/B)', value: `${env.humidity}%`, ok: env.humOk, pct: env.humidity, range: '70–95%' },
              ].map(e => (
                <div key={e.label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500 dark:text-slate-400">{e.label}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{e.value}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${e.ok ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${e.pct}%` }} />
                  </div>
                  <div className={`text-xs mt-0.5 ${e.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {e.ok ? `✓ Optimal (${e.range})` : `⚠ Di luar range (${e.range})`}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-xs text-slate-400 text-center py-4">
              Klik "Simulate IoT" untuk melihat data sensor
            </div>
          )}
          <button onClick={simulateIoT} disabled={simulating}
            className="btn btn-secondary w-full justify-center text-xs py-2 disabled:opacity-60 mt-1">
            {simulating ? '⏳ Mensimulasikan…' : '📡 Simulate IoT Update'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Waste Prevented" value={formatCurrency(stats?.wastePrevented || 0)} sub="Nilai pemborosan dicegah" icon="♻️" />
        <KpiCard label="CO₂ Saved" value={`${stats?.co2Saved || 0} kg`} sub="Emisi CO₂ dihemat" icon="🌍" />
        <KpiCard label="Forecast Accuracy" value={`${stats?.forecastAccuracy || 0}%`} sub="Akurasi model ML" icon="🧠" />
        <KpiCard label="Active Orders" value={stats?.activeOrders || 0} sub="Replenishment aktif" icon="🚚" />
      </div>
    </div>
  )
}
