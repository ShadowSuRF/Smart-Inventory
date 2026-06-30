import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboardStats, runIoTSimulation, getIoTSensors } from '../lib/api'
import { SkeletonKPI } from '../components/ui/PageLoader'
import { Spinner } from '../components/ui/PageLoader'
import { formatCurrency, formatNumber } from '../lib/utils'
import toast from 'react-hot-toast'

function KpiBox({ label, value, sub, icon, color='text-slate-900', idx=0 }:
  { label:string; value:string|number; sub?:string; icon:string; color?:string; idx?:number }) {
  return (
    <div className="kpi-card animate-fade-in-up card-hover" style={{ animationDelay:`${idx*80}ms` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats]       = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [env, setEnv]           = useState<{ temp:number; humidity:number; tempOk:boolean; humOk:boolean } | null>(null)
  const [envLoading, setEnvLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, sensorRes] = await Promise.all([
        getDashboardStats(),
        getIoTSensors().catch(() => null),
      ])
      setStats(statsRes.data.data)
      if (sensorRes?.data?.data?.length) {
        const sensors: any[] = sensorRes.data.data
        const src = sensors.filter((s:any) => s.zone==='A'||s.zone==='B')
        const pool = src.length ? src : sensors
        const avgT = parseFloat((pool.reduce((s:number,x:any)=>s+x.temperature,0)/pool.length).toFixed(1))
        const avgH = Math.round(pool.reduce((s:number,x:any)=>s+x.humidity,0)/pool.length)
        setEnv({ temp:avgT, humidity:avgH, tempOk:avgT>=2&&avgT<=8, humOk:avgH>=70&&avgH<=95 })
      }
    } catch { toast.error('Gagal memuat dashboard') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  const simulateIoT = async () => {
    setSimulating(true)
    setEnvLoading(true)
    try {
      await runIoTSimulation()
      toast.success('IoT tick disimulasikan!')
      const sRes = await getIoTSensors()
      const sensors: any[] = sRes.data.data||[]
      if (sensors.length) {
        const src = sensors.filter((s:any)=>s.zone==='A'||s.zone==='B')
        const pool = src.length ? src : sensors
        const avgT = parseFloat((pool.reduce((s:number,x:any)=>s+x.temperature,0)/pool.length).toFixed(1))
        const avgH = Math.round(pool.reduce((s:number,x:any)=>s+x.humidity,0)/pool.length)
        setEnv({ temp:avgT, humidity:avgH, tempOk:avgT>=2&&avgT<=8, humOk:avgH>=70&&avgH<=95 })
        if (sensors.some((s:any)=>s.status==='warning'))
          toast.error('⚠️ Sensor di luar range optimal!', {duration:4000})
      }
    } catch { toast.error('Gagal mensimulasikan IoT') }
    finally { setSimulating(false); setEnvLoading(false) }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold">Dashboard Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">Data real-time inventori kamu</p>
        </div>
        <button onClick={fetchStats} disabled={loading}
          className="btn btn-secondary text-xs flex items-center gap-2 disabled:opacity-60">
          {loading ? <Spinner size={12}/> : '🔄'} Refresh
        </button>
      </div>

      {/* KPI Row 1 */}
      {loading ? <SkeletonKPI count={4}/> : (
        <div className="grid grid-cols-4 gap-4 mb-5">
          <KpiBox label="Total Items"    value={formatNumber(stats?.totalItems||0)}  icon="📦" idx={0}/>
          <KpiBox label="Stock Value"    value={formatCurrency(stats?.stockValue||0)} icon="📈" color="text-blue-600" idx={1}/>
          <KpiBox label="Waste Reduction" value={`${stats?.wasteReduction||0}%`}   icon="🌱" color="text-green-600" idx={2}/>
          <KpiBox label="Critical Alerts" value={stats?.criticalAlerts||0}          icon="⚠️"  color="text-red-500" idx={3}/>
        </div>
      )}

      {/* Middle grid */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Quick Actions */}
        <div className="card animate-fade-in-up delay-300">
          <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label:'🔄 Generate Replenishment Order', path:'/replenishment' },
              { label:'🌱 View Expiring Items',          path:'/waste-prevention' },
              { label:'🧠 Run AI Forecast',              path:'/forecasting' },
              { label:'💰 Profit & Loss Dashboard',      path:'/profit' },
            ].map((a,i) => (
              <button key={a.path} onClick={()=>navigate(a.path)}
                className="btn btn-secondary w-full justify-center text-xs py-2 animate-fade-in-left card-hover"
                style={{ animationDelay:`${400+i*60}ms` }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* IoT Status */}
        <div className="card animate-fade-in-up delay-400">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Environmental Status</h3>
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"/>
              {env ? 'Live' : 'Belum simulate'}
            </span>
          </div>

          {envLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_,i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-3 w-40"/>
                  <div className="skeleton h-1.5 w-full"/>
                </div>
              ))}
            </div>
          ) : env ? (
            <>
              {[
                { label:'Temperature (Zone A/B)', val:`${env.temp}°C`, ok:env.tempOk, pct:Math.min(Math.max((env.temp+20)/50*100,0),100), range:'2–8°C' },
                { label:'Humidity (Zone A/B)',    val:`${env.humidity}%`, ok:env.humOk, pct:env.humidity, range:'70–95%' },
              ].map(e => (
                <div key={e.label} className="mb-3 animate-fade-in">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{e.label}</span>
                    <span className="font-semibold">{e.val}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${e.ok?'bg-green-500':'bg-red-500'}`}
                      style={{ width:`${e.pct}%` }}/>
                  </div>
                  <div className={`text-xs mt-0.5 ${e.ok?'text-green-600':'text-red-500'}`}>
                    {e.ok ? `✓ Optimal (${e.range})` : `⚠ Di luar range (${e.range})`}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-xs text-slate-400 text-center py-6">
              Klik tombol di bawah untuk melihat data sensor
            </div>
          )}

          <button onClick={simulateIoT} disabled={simulating}
            className="btn btn-secondary w-full justify-center text-xs py-2 mt-2 disabled:opacity-60">
            {simulating ? <><Spinner size={12}/> Mensimulasikan…</> : '📡 Simulate IoT Update'}
          </button>
        </div>
      </div>

      {/* KPI Row 2 */}
      {loading ? <SkeletonKPI count={4}/> : (
        <div className="grid grid-cols-4 gap-4">
          <KpiBox label="Waste Prevented" value={formatCurrency(stats?.wastePrevented||0)} icon="♻️" color="text-green-600" idx={0}/>
          <KpiBox label="CO₂ Saved"       value={`${stats?.co2Saved||0} kg`}               icon="🌍" color="text-teal-600" idx={1}/>
          <KpiBox label="Forecast Acc."   value={`${stats?.forecastAccuracy||94.2}%`}       icon="🧠" color="text-purple-600" idx={2}/>
          <KpiBox label="Active Orders"   value={stats?.activeOrders||0}                    icon="🚚" idx={3}/>
        </div>
      )}
    </div>
  )
}
