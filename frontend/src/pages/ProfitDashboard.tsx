import { useEffect, useState, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell,
  ReferenceLine,
} from 'recharts'
import api from '../lib/api'
import { Spinner } from '../components/ui/PageLoader'
import toast from 'react-hot-toast'

const fmtK = (v: number) => {
  if (v == null || isNaN(v)) return '—'
  if (Math.abs(v) >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `$${(v/1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
const PIE_COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316']

interface MonthRow {
  month: string; ym: string
  revenue: number; cogs: number; waste: number
  gross_profit: number; net_profit: number; units_sold: number; margin: number
}
interface CatRow { category: string; revenue: number; net_profit: number; margin: number; current: number; predicted: number }
interface Analytics {
  totalRevenue: number; totalCOGS: number; totalWasteLoss: number
  totalGrossProfit: number; totalNetProfit: number; profitMargin: number
  topProducts: { name: string; net_profit: number; units_sold: number; margin: number }[]
  wasteByCategory: { category: string; value: number }[]
}
type Period = '3m' | '6m' | '12m' | 'all'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card shadow-lg text-xs p-3 min-w-[180px]">
      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold">
            {p.dataKey === 'margin' ? `${p.value}%` : fmtK(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ProfitDashboard() {
  const [monthly, setMonthly] = useState<MonthRow[]>([])
  const [catData, setCatData] = useState<CatRow[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('12m')
  const [dataSource, setDataSource] = useState<'csv'|'fallback'|'user_data'|'empty'|null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, cRes, aRes] = await Promise.all([
        api.get('/forecasting/monthly-profit'),
        api.get('/forecasting/category').catch(() => null),
        api.get('/analytics').catch(() => null),
      ])
      setMonthly(mRes.data.data || [])
      setDataSource(mRes.data.source || null)
      setCatData(cRes?.data?.data || [])
      setAnalytics(aRes?.data?.data || null)
    } catch {
      toast.error('Gagal memuat data P&L')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filteredMonthly = (() => {
    if (period === 'all' || monthly.length === 0) return monthly
    const n = period === '3m' ? 3 : period === '6m' ? 6 : 12
    return monthly.slice(-n)
  })()

  const totalRev   = filteredMonthly.reduce((s, r) => s + r.revenue, 0)
  const totalNet   = filteredMonthly.reduce((s, r) => s + r.net_profit, 0)
  const totalWaste = filteredMonthly.reduce((s, r) => s + r.waste, 0)
  const totalGross = filteredMonthly.reduce((s, r) => s + r.gross_profit, 0)
  const avgMargin  = totalRev > 0 ? totalNet / totalRev * 100 : 0
  const profitMonths = filteredMonthly.filter(r => r.net_profit >= 0).length
  const lossMonths   = filteredMonthly.filter(r => r.net_profit < 0).length
  const last = filteredMonthly[filteredMonthly.length - 1]
  const prev = filteredMonthly[filteredMonthly.length - 2]
  const momRev = prev?.revenue > 0 ? (last?.revenue - prev.revenue) / prev.revenue * 100 : 0
  const momNet = prev && Math.abs(prev.net_profit) > 0 ? (last?.net_profit - prev.net_profit) / Math.abs(prev.net_profit) * 100 : 0

  const pieCats = catData.map(c => ({ name: c.category, value: Math.max(0, Math.round(c.net_profit)) }))
  const PERIODS: { k: Period; l: string }[] = [
    { k:'3m', l:'3 Bulan' }, { k:'6m', l:'6 Bulan' },
    { k:'12m', l:'12 Bulan' }, { k:'all', l:'Semua' },
  ]

  // Domain helpers supaya variasi kelihatan (Y-axis tidak mulai dari 0)
  const domainRevenue = filteredMonthly.length > 1
    ? [(d: number) => Math.floor(d * 0.82), (d: number) => Math.ceil(d * 1.10)] as any
    : [0, 'auto']
  const domainMargin  = filteredMonthly.length > 1
    ? [(d: number) => Math.floor(d * 0.85), (d: number) => Math.ceil(d * 1.12)] as any
    : ['auto', 'auto']

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profit & Loss Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
            {monthly.length > 0
              ? `${monthly[0]?.ym} → ${monthly[monthly.length-1]?.ym}`
              : 'Memuat data…'}
            {dataSource === 'user_data' && (
              <span className="badge bg-blue-100 text-blue-700 text-xs">
                📊 Estimasi dari inventory kamu
              </span>
            )}
            {dataSource === 'empty' && (
              <span className="badge bg-slate-100 text-slate-500 text-xs">Belum ada data</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {PERIODS.map(p => (
              <button key={p.k} onClick={() => setPeriod(p.k)}
                className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${period===p.k ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                style={period===p.k ? { backgroundColor:'var(--ac)' } : {}}>
                {p.l}
              </button>
            ))}
          </div>
          <button onClick={fetchAll} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* Empty state — belum ada inventory */}
      {!loading && dataSource === 'empty' && (
        <div className="mb-5 p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-4xl mb-3">📊</div>
          <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
            Belum ada data untuk ditampilkan
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-lg mx-auto">
            Grafik P&L dihitung dari inventory <strong>milikmu sendiri</strong> di MongoDB Atlas —
            bukan dari data dummy atau data training ML.
          </div>
          <div className="flex gap-3 justify-center flex-wrap text-sm">
            <a href="/inventory" className="btn btn-primary text-xs">+ Tambah Item Manual</a>
            <a href="/excel-import" className="btn btn-secondary text-xs">📥 Import via Excel/CSV</a>
          </div>
          <div className="mt-4 text-xs text-slate-400 max-w-md mx-auto">
            💡 Sudah punya file Excel/CSV? Gunakan menu <strong>Excel Import</strong> di sidebar —
            setelah data masuk, halaman ini otomatis menghitung estimasi P&L dari harga & stok yang kamu import.
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        {[
          { label:'Total Revenue',  val:totalRev,   sub:`MoM ${pct(momRev)}`,                                    color:'text-blue-600',   icon:'💰' },
          { label:'Gross Profit',   val:totalGross, sub:`${(totalGross/Math.max(totalRev,1)*100).toFixed(1)}% gross margin`, color:'text-green-600',  icon:'📈' },
          { label:'Net Profit',     val:totalNet,   sub:`MoM ${pct(momNet)}`,                                    color:totalNet>=0?'text-green-600':'text-red-500', icon:totalNet>=0?'✅':'🔴' },
          { label:'Waste Loss',     val:totalWaste, sub:`${(totalWaste/Math.max(totalRev,1)*100).toFixed(1)}% of revenue`, color:'text-red-500',    icon:'♻️' },
          { label:'Net Margin',     val:null, pct:avgMargin, sub:`${profitMonths}↑ / ${lossMonths}↓ months`,    color:avgMargin>=0?'text-purple-600':'text-red-500', icon:'📊' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="flex justify-between items-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">{k.label}</div>
              <span className="text-base">{k.icon}</span>
            </div>
            <div className={`text-xl font-bold ${k.color}`}>
              {loading ? '…' : k.val !== null ? fmtK(k.val) : `${k.pct!.toFixed(1)}%`}
            </div>
            <div className="text-xs text-slate-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart utama: Revenue bars + Margin line — dual Y-axis */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monthly Revenue, Net Profit & Margin</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block"/>Revenue</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block"/>Net Profit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 inline-block"/>Margin %</span>
          </div>
        </div>
        {loading ? <div className="h-56 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg" /> : filteredMonthly.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Belum ada data — tambahkan inventory item</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={filteredMonthly} margin={{ top:8, right:50, bottom:0, left:10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize:10 }} />
              {/* Left Y-axis: Revenue & Net Profit — domain zoom ke data */}
              <YAxis yAxisId="money" tick={{ fontSize:10 }} tickFormatter={v => fmtK(v)}
                domain={domainRevenue} width={64} />
              {/* Right Y-axis: Margin % — independent domain */}
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize:10 }}
                tickFormatter={v => `${v}%`} domain={domainMargin} width={42} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="money" y={0} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} />
              <Bar yAxisId="money" dataKey="revenue" fill="#93c5fd" name="Revenue"
                radius={[3,3,0,0]} maxBarSize={24} opacity={0.85} />
              <Bar yAxisId="money" dataKey="net_profit" name="Net Profit"
                radius={[3,3,0,0]} maxBarSize={24}>
                {filteredMonthly.map((row, i) => (
                  <Cell key={i} fill={row.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
              <Line yAxisId="pct" type="monotone" dataKey="margin"
                stroke="#8b5cf6" name="Margin %" dot={{ r:3, fill:'#8b5cf6' }}
                strokeWidth={2.5} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue vs Cost Structure + Net Profit Trend */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Revenue vs Cost — AreaChart dengan domain zoom */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Revenue vs Cost Structure</h3>
          {loading ? <div className="skeleton h-44 w-full rounded-lg" /> : filteredMonthly.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-slate-400 text-sm">Belum ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={188}>
              <AreaChart data={filteredMonthly} margin={{ top:4, right:4, bottom:0, left:4 }}>
                <defs>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03}/>
                  </linearGradient>
                  <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.03}/>
                  </linearGradient>
                  <linearGradient id="gradWaste" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.03}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize:9 }} />
                {/* Domain zoom: min 80% → max 110% dari data range */}
                <YAxis tick={{ fontSize:9 }} tickFormatter={v => fmtK(v)}
                  domain={[(d: number) => Math.floor(d * 0.80), (d: number) => Math.ceil(d * 1.08)]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:10 }} />
                <Area type="monotone" dataKey="revenue"      stroke="#3b82f6" fill="url(#gradRev)"   name="Revenue"      strokeWidth={2.5} dot={false} />
                <Area type="monotone" dataKey="gross_profit" stroke="#22c55e" fill="url(#gradGross)" name="Gross Profit"  strokeWidth={2}   dot={false} />
                <Area type="monotone" dataKey="waste"        stroke="#ef4444" fill="url(#gradWaste)" name="Waste Loss"    strokeWidth={1.8} dot={false} strokeDasharray="5 3" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Net Profit Trend — ComposedChart line + bar fill */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Net Profit Trend</h3>
          {loading ? <div className="skeleton h-44 w-full rounded-lg" /> : filteredMonthly.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-slate-400 text-sm">Belum ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={188}>
              <ComposedChart data={filteredMonthly} margin={{ top:4, right:4, bottom:0, left:4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize:9 }} />
                <YAxis tick={{ fontSize:9 }} tickFormatter={v => fmtK(v)}
                  domain={[(d: number) => Math.floor(d * 0.82), (d: number) => Math.ceil(d * 1.10)]} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
                <Bar dataKey="net_profit" name="Net Profit" radius={[3,3,0,0]} maxBarSize={22} opacity={0.75}>
                  {filteredMonthly.map((row, i) => (
                    <Cell key={i} fill={row.net_profit >= 0 ? '#86efac' : '#fca5a5'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="net_profit" stroke="#16a34a" name="Trend"
                  dot={{ r:3, fill:'#16a34a' }} strokeWidth={2.5} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Pie chart */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Net Profit by Category</h3>
          {loading ? <div className="skeleton h-44 w-full rounded-lg" /> : (
            <div className="flex items-center gap-2">
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie data={pieCats} cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" paddingAngle={2}>
                    {pieCats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtK(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {catData.length === 0
                  ? <div className="text-xs text-slate-400 text-center py-4">Belum ada data kategori</div>
                  : catData.map((c, i) => (
                    <div key={c.category} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1 text-slate-600 dark:text-slate-400 truncate">{c.category}</span>
                      <span className={`font-semibold ${c.margin >= 40 ? 'text-green-600' : c.margin >= 25 ? 'text-amber-500' : 'text-red-500'}`}>
                        {c.margin}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">🏆 Top Products by Net Profit</h3>
          <div className="space-y-2.5">
            {loading ? [...Array(5)].map((_,i) => <div key={i} className="h-6 skeleton rounded" />) :
             !analytics?.topProducts?.length
              ? <div className="text-xs text-slate-400 text-center py-4">Belum ada data produk</div>
              : analytics.topProducts.map((p, i) => {
                  const maxP = analytics.topProducts[0].net_profit || 1
                  return (
                    <div key={p.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-36">
                          <span className="text-slate-400 mr-1">#{i+1}</span>{p.name}
                        </span>
                        <div className="flex gap-3 flex-shrink-0">
                          <span className="text-slate-400">{p.units_sold.toLocaleString()} sold</span>
                          <span className={`font-semibold ${p.net_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {fmtK(p.net_profit)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width:`${Math.min((p.net_profit/maxP)*100,100)}%` }} />
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </div>
      </div>

      {/* Waste analysis */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">🗑 Waste Loss by Category</h3>
        {!analytics?.wasteByCategory?.length
          ? <div className="text-xs text-slate-400 text-center py-4">Belum ada data waste</div>
          : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {analytics.wasteByCategory.map((w) => {
                const maxW = Math.max(...analytics.wasteByCategory.map(x => x.value))
                const pctW = maxW > 0 ? (w.value / maxW) * 100 : 0
                const cls = pctW >= 70 ? 'text-red-600 bg-red-500' : pctW >= 40 ? 'text-amber-600 bg-amber-500' : 'text-blue-600 bg-blue-400'
                const [tc, bc] = cls.split(' ')
                return (
                  <div key={w.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">{w.category}</span>
                      <span className={`font-semibold ${tc}`}>{fmtK(w.value)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${bc}`} style={{ width:`${pctW}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col justify-center items-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{fmtK(analytics.totalWasteLoss || 0)}</div>
              <div className="text-xs text-red-500 mt-1">Total Waste Loss</div>
              <div className="text-xs text-slate-500 mt-2">
                {analytics.totalRevenue > 0
                  ? `${(analytics.totalWasteLoss/analytics.totalRevenue*100).toFixed(1)}% dari total revenue`
                  : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Monthly P&L Table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          📋 Monthly P&L Summary
          <span className="ml-2 text-xs font-normal text-slate-400">({period === 'all' ? 'All Time' : `Last ${period}`})</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                {['Month','Revenue','COGS','Gross Profit','Waste Loss','Net Profit','Margin','Units Sold'].map(h => (
                  <th key={h} className="text-left text-slate-400 font-medium pb-2 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(5)].map((_,i) => (
                <tr key={i}><td colSpan={8}><div className="h-6 animate-pulse bg-slate-100 dark:bg-slate-800 rounded my-1" /></td></tr>
              )) : [...filteredMonthly].reverse().map(row => (
                <tr key={row.ym} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.month}</td>
                  <td className="py-1.5 pr-3 text-blue-600 font-medium">{fmtK(row.revenue)}</td>
                  <td className="py-1.5 pr-3 text-slate-500">{fmtK(row.cogs)}</td>
                  <td className="py-1.5 pr-3 text-green-600 font-medium">{fmtK(row.gross_profit)}</td>
                  <td className="py-1.5 pr-3 text-red-500">{fmtK(row.waste)}</td>
                  <td className={`py-1.5 pr-3 font-bold ${row.net_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {fmtK(row.net_profit)}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className={`badge text-xs ${row.margin >= 35 ? 'bg-green-100 text-green-700' : row.margin >= 20 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {row.margin}%
                    </span>
                  </td>
                  <td className="py-1.5 text-slate-500">{row.units_sold.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {!loading && filteredMonthly.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50">
                  <td className="py-2 pr-3 font-bold text-slate-900 dark:text-slate-100">TOTAL</td>
                  <td className="py-2 pr-3 text-blue-700 font-bold">{fmtK(totalRev)}</td>
                  <td className="py-2 pr-3 text-slate-600 font-semibold">{fmtK(filteredMonthly.reduce((s,r)=>s+r.cogs,0))}</td>
                  <td className="py-2 pr-3 text-green-700 font-bold">{fmtK(totalGross)}</td>
                  <td className="py-2 pr-3 text-red-600 font-bold">{fmtK(totalWaste)}</td>
                  <td className={`py-2 pr-3 font-bold text-base ${totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtK(totalNet)}</td>
                  <td className="py-2 pr-3">
                    <span className={`badge text-xs font-bold ${avgMargin >= 35 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {avgMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 text-slate-600 font-semibold">{filteredMonthly.reduce((s,r)=>s+r.units_sold,0).toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
