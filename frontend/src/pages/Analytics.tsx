import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getAnalytics, getAnalyticsHeatmap } from '../lib/api'
import { fmtRp } from '../lib/currency'
import toast from 'react-hot-toast'

const ratingBadge = (r: string) =>
  r==='excellent'?'bg-green-100 text-green-700':r==='good'?'bg-blue-100 text-blue-700':r==='average'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'

function heatColor(v: number) {
  if (v >= 80) return 'bg-green-500 text-white'
  if (v >= 65) return 'bg-green-300 text-green-900'
  if (v >= 50) return 'bg-amber-300 text-amber-900'
  if (v >= 30) return 'bg-orange-300 text-orange-900'
  return 'bg-red-400 text-white'
}
function statusBadge(s: string) {
  if (s === 'warning') return 'badge bg-amber-100 text-amber-700'
  if (s === 'critical') return 'badge bg-red-100 text-red-700'
  if (s === 'low') return 'badge bg-orange-100 text-orange-700'
  return 'badge bg-green-100 text-green-700'
}

interface HeatZone {
  zone: string; baseFill: number; days: number[]; deviceCount: number; itemCount: number
  avgTemp: number | null; avgHumidity: number | null; status: string
}

export default function Analytics() {
  const [data, setData]       = useState<any>(null)
  const [zones, setZones]     = useState<HeatZone[]>([])
  const [heatDays, setHeatDays] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [analyticsRes, heatmapRes] = await Promise.all([
        getAnalytics(),
        getAnalyticsHeatmap().catch(() => null),
      ])
      setData(analyticsRes.data.data)
      if (heatmapRes?.data?.data) {
        setZones(heatmapRes.data.data)
        setHeatDays(heatmapRes.data.days || ['Sen','Sel','Rab','Kam','Jum','Sab','Min'])
      }
    } catch {
      toast.error('Gagal memuat analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // fmtRp from currency.ts

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Advanced Analytics</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Insight mendalam dari data inventori kamu</p>
        </div>
        <button onClick={fetchData} className="btn btn-secondary text-xs">🔄 Refresh</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {loading ? [...Array(4)].map((_,i) => (
          <div key={i} className="kpi-card animate-pulse"><div className="h-8 bg-slate-200 dark:bg-slate-700 rounded" /></div>
        )) : (
          <>
            <div className="kpi-card">
              <div className="text-xs text-slate-500 dark:text-slate-400">Stock Turnover</div>
              <div className="text-2xl font-semibold">{data?.stockTurnover ?? '—'}{data?.stockTurnover ? ' days' : ''}</div>
              <div className="text-xs text-slate-400">Rata-rata perputaran stok</div>
            </div>
            <div className="kpi-card">
              <div className="text-xs text-slate-500 dark:text-slate-400">Waste Rate</div>
              <div className="text-2xl font-semibold">{data?.wasteRate ?? '—'}{data?.wasteRate ? '%' : ''}</div>
              <div className="text-xs text-slate-400">Persentase terbuang</div>
            </div>
            <div className="kpi-card">
              <div className="text-xs text-slate-500 dark:text-slate-400">Fill Rate</div>
              <div className="text-2xl font-semibold text-green-600">{data?.fillRate ?? '—'}{data?.fillRate ? '%' : ''}</div>
              <div className="text-xs text-slate-400">Rata-rata pengisian</div>
            </div>
            <div className="kpi-card">
              <div className="text-xs text-slate-500 dark:text-slate-400">Net Profit Est.</div>
              <div className="text-2xl font-semibold text-blue-600">{data?.totalNetProfit ? fmtRp(data.totalNetProfit) : '—'}</div>
              <div className="text-xs text-slate-400">Estimasi dari inventori</div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Waste by Category */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Waste by Category</h3>
          {loading ? <div className="h-44 skeleton rounded-lg" /> : (
            data?.wasteByCategory?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.wasteByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize:10 }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize:10 }} width={100} />
                  <Tooltip formatter={(v: any) => [fmtRp(Number(v)), 'Waste Loss (Rp)']} />
                  <Bar dataKey="value" fill="#ef4444" radius={[0,3,3,0]} name="Waste Loss" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-sm text-slate-400">
                Belum ada data waste — tambahkan inventory item
              </div>
            )
          )}
        </div>

        {/* Stock Turnover Rate */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Stock Turnover Rate</h3>
          {loading ? <div className="h-44 skeleton rounded-lg" /> : (
            data?.turnoverRates?.length > 0 ? (
              <div className="space-y-2.5">
                {data.turnoverRates.map((t: any) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 w-24 truncate text-right">{t.name}</div>
                    <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${t.rating==='excellent'?'bg-green-500':t.rating==='good'?'bg-blue-500':t.rating==='average'?'bg-amber-500':'bg-red-500'}`}
                        style={{ width:`${Math.min((t.days/15)*100,100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-8">{t.days}d</span>
                    <span className={`badge ${ratingBadge(t.rating)} text-xs`}>{t.rating}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-sm text-slate-400">
                Belum ada data — tambahkan inventory
              </div>
            )
          )}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[
          { label: 'Total Revenue Est.', val: data?.totalRevenue, color: 'text-blue-600' },
          { label: 'Total Gross Profit', val: data?.totalGrossProfit, color: 'text-green-600' },
          { label: 'Total Waste Loss', val: data?.totalWasteLoss, color: 'text-red-500' },
        ].map(k => (
          <div key={k.label} className="card text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.label}</div>
            <div className={`text-xl font-semibold ${k.color}`}>
              {loading ? '…' : k.val ? fmtRp(k.val) : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap — zona REAL milik user, bukan Zone A-G dummy */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Stock Level Heatmap per Lokasi
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Data dari zona IoT sensor & inventory kamu — bukan zona default
            </p>
          </div>
          <div className="flex gap-1.5 text-xs text-slate-400 items-center">
            <span className="w-3 h-3 rounded bg-green-500 inline-block" /> Penuh
            <span className="w-3 h-3 rounded bg-amber-300 inline-block ml-2" /> Sedang
            <span className="w-3 h-3 rounded bg-red-400 inline-block ml-2" /> Kritis
          </div>
        </div>

        {loading ? <div className="h-36 skeleton rounded-lg" /> : zones.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <div className="text-3xl mb-2">📡</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Belum ada zona</div>
            <div className="text-xs mt-1">
              Tambahkan sensor di halaman <strong>IoT Sensor Network</strong> atau inventory item dengan zone, lalu klik Refresh
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-slate-400 font-normal pb-2 pr-3 w-28">Lokasi / Zona</th>
                  {heatDays.map(d => <th key={d} className="text-slate-400 font-normal pb-2 px-1 text-center">{d}</th>)}
                  <th className="text-slate-400 font-normal pb-2 px-2 text-center">Sensor</th>
                  <th className="text-slate-400 font-normal pb-2 px-2 text-center">Suhu</th>
                  <th className="text-slate-400 font-normal pb-2 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {zones.map(z => (
                  <tr key={z.zone} className="border-t border-slate-50 dark:border-slate-800">
                    <td className="pr-3 py-1.5 text-slate-700 dark:text-slate-300 font-semibold max-w-[7rem] truncate" title={z.zone}>
                      {z.zone}
                    </td>
                    {z.days.map((val, di) => (
                      <td key={di} className="px-1 py-1">
                        <div className={`rounded text-center py-1 text-xs font-semibold ${heatColor(val)}`}>{val}%</div>
                      </td>
                    ))}
                    <td className="px-2 text-center text-slate-500 dark:text-slate-400">
                      {z.deviceCount > 0 ? `📡 ${z.deviceCount}` : `📦 ${z.itemCount}`}
                    </td>
                    <td className="px-2 text-center text-slate-600 dark:text-slate-300">
                      {z.avgTemp !== null ? `${z.avgTemp}°C` : '—'}
                    </td>
                    <td className="px-2 text-center">
                      <span className={statusBadge(z.status)}>
                        {z.status === 'warning' ? '⚠ Warning' : z.status === 'critical' ? '🔴 Kritis' : z.status === 'low' ? '🟠 Rendah' : '✓ Optimal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
