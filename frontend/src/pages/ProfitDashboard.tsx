import { useEffect, useState, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell,
  ReferenceLine,
} from 'recharts'
import api from '../lib/api'
import toast from 'react-hot-toast'

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return fmt(v)
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316']

interface MonthRow {
  month: string; ym: string
  revenue: number; cogs: number; waste: number
  gross_profit: number; net_profit: number; units_sold: number; margin: number
}

interface CatRow {
  category: string; revenue: number; net_profit: number; margin: number
  current: number; predicted: number
}

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

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, cRes, aRes] = await Promise.all([
        api.get('/forecasting/monthly-profit'),
        api.get('/forecasting/category'),
        api.get('/analytics'),
      ])
      setMonthly(mRes.data.data || [])
      setCatData(cRes.data.data || [])
      setAnalytics(aRes.data.data || null)
    } catch {
      toast.error('Failed to load profit data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Filter by period
  const filteredMonthly = (() => {
    if (period === 'all' || monthly.length === 0) return monthly
    const n = period === '3m' ? 3 : period === '6m' ? 6 : 12
    return monthly.slice(-n)
  })()

  // KPI calcs from filtered period
  const totalRev  = filteredMonthly.reduce((s, r) => s + r.revenue, 0)
  const totalNet  = filteredMonthly.reduce((s, r) => s + r.net_profit, 0)
  const totalWaste= filteredMonthly.reduce((s, r) => s + r.waste, 0)
  const totalGross= filteredMonthly.reduce((s, r) => s + r.gross_profit, 0)
  const avgMargin = totalRev > 0 ? totalNet / totalRev * 100 : 0
  const profitMonths = filteredMonthly.filter(r => r.net_profit >= 0).length
  const lossMonths   = filteredMonthly.filter(r => r.net_profit < 0).length

  // MoM change
  const last  = filteredMonthly[filteredMonthly.length - 1]
  const prev  = filteredMonthly[filteredMonthly.length - 2]
  const momRev = prev && prev.revenue > 0 ? (last?.revenue - prev.revenue) / prev.revenue * 100 : 0
  const momNet = prev && Math.abs(prev.net_profit) > 0 ? (last?.net_profit - prev.net_profit) / Math.abs(prev.net_profit) * 100 : 0

  // Pie data for categories
  const pieCats = catData.map(c => ({ name: c.category, value: Math.max(0, Math.round(c.net_profit)) }))

  const PERIODS: { k: Period; l: string }[] = [
    { k: '3m', l: '3 Months' }, { k: '6m', l: '6 Months' },
    { k: '12m', l: '12 Months' }, { k: 'all', l: 'All Time' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profit & Loss Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Financial insights from {monthly.length > 0 ? `${monthly[0]?.ym} → ${monthly[monthly.length-1]?.ym}` : 'CSV data'} · 31,850 transactions
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Period selector */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {PERIODS.map(p => (
              <button
                key={p.k}
                onClick={() => setPeriod(p.k)}
                className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${period === p.k ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                style={period === p.k ? { backgroundColor: 'var(--ac)' } : {}}
              >{p.l}</button>
            ))}
          </div>
          <button onClick={fetchAll} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        {[
          { label:'Total Revenue', val: totalRev, sub: `MoM ${pct(momRev)}`, color:'text-blue-600', icon:'💰', good: momRev >= 0 },
          { label:'Gross Profit',  val: totalGross, sub: `${(totalGross/Math.max(totalRev,1)*100).toFixed(1)}% gross margin`, color:'text-green-600', icon:'📈' },
          { label:'Net Profit',    val: totalNet, sub: `MoM ${pct(momNet)}`, color: totalNet >= 0 ? 'text-green-600' : 'text-red-500', icon: totalNet >= 0 ? '✅' : '🔴', good: totalNet >= 0 },
          { label:'Waste Loss',    val: totalWaste, sub: `${(totalWaste/Math.max(totalRev,1)*100).toFixed(1)}% of revenue`, color:'text-red-500', icon:'♻️' },
          { label:'Net Margin',    val: null, pct: avgMargin, sub: `${profitMonths}↑ / ${lossMonths}↓ months`, color: avgMargin >= 0 ? 'text-purple-600' : 'text-red-500', icon:'📊' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="flex justify-between items-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">{k.label}</div>
              <span className="text-base">{k.icon}</span>
            </div>
            <div className={`text-xl font-bold ${k.color}`}>
              {k.val !== null ? fmtK(k.val) : `${k.pct!.toFixed(1)}%`}
            </div>
            <div className="text-xs text-slate-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Profit / Loss bar chart + margin line */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monthly Revenue vs Net Profit & Margin</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block"/>Revenue</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block"/>Net Profit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 inline-block"/>Margin %</span>
          </div>
        </div>
        {loading ? <div className="h-56 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={filteredMonthly} margin={{ top: 4, right: 40, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="left" y={0} stroke="#ef4444" strokeDasharray="4 2" />
              <Bar yAxisId="left" dataKey="revenue" fill="#93c5fd" name="Revenue" radius={[3,3,0,0]} maxBarSize={28} />
              <Bar yAxisId="left" dataKey="net_profit" name="Net Profit" radius={[3,3,0,0]} maxBarSize={28}>
                {filteredMonthly.map((row, i) => (
                  <Cell key={i} fill={row.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#8b5cf6" name="margin" dot={{ r: 3 }} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue vs COGS vs Waste Area */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Revenue vs Cost Structure</h3>
          {loading ? <div className="h-44 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={filteredMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="revenue"      stroke="#3b82f6" fill="rgba(59,130,246,0.15)" name="Revenue"     strokeWidth={2} />
                <Area type="monotone" dataKey="gross_profit" stroke="#22c55e" fill="rgba(34,197,94,0.15)"  name="Gross Profit" strokeWidth={2} />
                <Area type="monotone" dataKey="waste"        stroke="#ef4444" fill="rgba(239,68,68,0.12)"  name="Waste Loss"  strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart by category */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Net Profit by Category</h3>
          {loading ? <div className="h-44 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg" /> : (
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
                {catData.map((c, i) => (
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
      </div>

      {/* Top products + waste analysis */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Top 5 products by profit */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">🏆 Top Products by Net Profit</h3>
          <div className="space-y-2.5">
            {(analytics?.topProducts || []).map((p, i) => {
              const maxProfit = analytics?.topProducts?.[0]?.net_profit || 1
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
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min((p.net_profit/maxProfit)*100, 100)}%` }} />
                  </div>
                </div>
              )
            })}
            {!analytics?.topProducts?.length && <div className="text-xs text-slate-400 text-center py-4">No data</div>}
          </div>
        </div>

        {/* Waste loss heatmap by category */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">🗑 Waste Loss by Category</h3>
          <div className="space-y-2">
            {(analytics?.wasteByCategory || []).map((w) => {
              const maxWaste = Math.max(...(analytics?.wasteByCategory||[]).map(x => x.value))
              const pctW = maxWaste > 0 ? (w.value / maxWaste) * 100 : 0
              const severity = pctW >= 70 ? 'text-red-600 bg-red-500' : pctW >= 40 ? 'text-amber-600 bg-amber-500' : 'text-blue-600 bg-blue-400'
              const [tc, bc] = severity.split(' ')
              return (
                <div key={w.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">{w.category}</span>
                    <span className={`font-semibold ${tc}`}>{fmtK(w.value)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bc}`} style={{ width: `${pctW}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-xs text-red-600 dark:text-red-400 font-semibold">
              Total Waste Loss: {fmtK(analytics?.totalWasteLoss || 0)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {analytics ? `${(analytics.totalWasteLoss/analytics.totalRevenue*100).toFixed(1)}% of total revenue` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Summary financial table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">📋 Monthly P&L Summary ({period === 'all' ? 'All Time' : `Last ${period}`})</h3>
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
              {loading ? (
                [...Array(5)].map((_,i) => (
                  <tr key={i}><td colSpan={8}><div className="h-6 animate-pulse bg-slate-100 dark:bg-slate-800 rounded my-1" /></td></tr>
                ))
              ) : (
                [...filteredMonthly].reverse().map(row => (
                  <tr key={row.ym} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-1.5 pr-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.month}</td>
                    <td className="py-1.5 pr-3 text-blue-600 font-medium">{fmtK(row.revenue)}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{fmtK(row.cogs)}</td>
                    <td className="py-1.5 pr-3 text-green-600 font-medium">{fmtK(row.gross_profit)}</td>
                    <td className="py-1.5 pr-3 text-red-500">{fmtK(row.waste)}</td>
                    <td className={`py-1.5 pr-3 font-bold ${row.net_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {row.net_profit >= 0 ? '' : '−'}{fmtK(Math.abs(row.net_profit))}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={`badge text-xs ${row.margin >= 35 ? 'bg-green-100 text-green-700' : row.margin >= 20 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {row.margin}%
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-500">{row.units_sold.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Totals row */}
            {!loading && filteredMonthly.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50">
                  <td className="py-2 pr-3 font-bold text-slate-900 dark:text-slate-100">TOTAL</td>
                  <td className="py-2 pr-3 text-blue-700 font-bold">{fmtK(totalRev)}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 font-semibold">{fmtK(filteredMonthly.reduce((s,r)=>s+r.cogs,0))}</td>
                  <td className="py-2 pr-3 text-green-700 font-bold">{fmtK(totalGross)}</td>
                  <td className="py-2 pr-3 text-red-600 font-bold">{fmtK(totalWaste)}</td>
                  <td className={`py-2 pr-3 font-bold text-base ${totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtK(totalNet)}</td>
                  <td className="py-2 pr-3">
                    <span className={`badge text-xs font-bold ${avgMargin >= 35 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {avgMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 text-slate-600 dark:text-slate-400 font-semibold">{filteredMonthly.reduce((s,r)=>s+r.units_sold,0).toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
