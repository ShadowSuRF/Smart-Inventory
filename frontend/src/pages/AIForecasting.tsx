import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell,
} from 'recharts'
import {
  getForecastPredictions, getCategoryForecast, getItemForecast,
  getItemsForecastSummary, triggerModelRetrain, getInventory,
} from '../lib/api'
import api from '../lib/api'
import toast from 'react-hot-toast'

const fmtK = (v: number) => {
  if (v == null) return '-'
  if (Math.abs(v) >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `$${(v/1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const riskCls = (r: string) =>
  r === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  : r === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'

interface ItemLite { _id: string; name: string; category: string }
interface ItemMeta {
  item: { _id: string; name: string; category: string; zone: string; unitPrice: number; quantity: number; fillLevel: number }
  avgDailyDemand: number; stockoutDays: number | null; stockoutRisk: 'high'|'medium'|'low'; source: string
}

export default function AIForecasting() {
  const [items, setItems]       = useState<ItemLite[]>([])
  const [selectedItemId, setSelectedItemId] = useState('ALL')
  const [search, setSearch]     = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [demand, setDemand]     = useState<any[]>([])
  const [itemMeta, setItemMeta] = useState<ItemMeta | null>(null)
  const [catData, setCatData]   = useState<any[]>([])
  const [summary, setSummary]   = useState<any[]>([])
  const [mlStats, setMlStats]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [horizon, setHorizon]   = useState(90)
  const [retraining, setRetraining] = useState(false)
  const [tab, setTab]           = useState<'demand'|'profit'>('demand')

  // Data referensi yang gak tergantung horizon/produk yg dipilih — sekali fetch
  const fetchReference = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, catRes, statsRes, summaryRes] = await Promise.all([
        getInventory(),
        getCategoryForecast(),
        api.get('/forecasting/ml-stats').catch(() => null),
        getItemsForecastSummary().catch(() => null),
      ])
      setItems(itemsRes.data.data || [])
      setCatData(catRes.data.data || [])
      if (statsRes?.data?.data) setMlStats(statsRes.data.data)
      setSummary(summaryRes?.data?.data || [])
    } catch {
      toast.error('Gagal memuat data forecast')
    } finally {
      setLoading(false)
    }
  }, [])

  // Chart utama — tergantung horizon DAN produk yg dipilih (ALL = agregat)
  const fetchChart = useCallback(async () => {
    setChartLoading(true)
    try {
      if (selectedItemId === 'ALL') {
        const predRes = await getForecastPredictions(horizon)
        setDemand(predRes.data.data?.predictions || [])
        setItemMeta(null)
      } else {
        const itemRes = await getItemForecast(selectedItemId, horizon)
        setDemand(itemRes.data.data?.predictions || [])
        setItemMeta(itemRes.data.data)
      }
    } catch {
      toast.error('Gagal memuat forecast produk ini')
    } finally {
      setChartLoading(false)
    }
  }, [horizon, selectedItemId])

  useEffect(() => { fetchReference() }, [fetchReference])
  useEffect(() => { fetchChart() }, [fetchChart])

  const refreshAll = () => { fetchReference(); fetchChart() }

  const handleRetrain = async () => {
    setRetraining(true)
    try {
      const res = await triggerModelRetrain()
      const est = res.data?.estimatedTime || '~2-3 menit'
      toast.success(`Model retraining dimulai di background — estimasi ${est}`)
      toast('Cek lagi nanti / klik 🔄 refresh utk lihat hasilnya', { icon: 'ℹ️' })
    } catch {
      toast.error('Gagal memulai retrain')
    } finally {
      setRetraining(false)
    }
  }

  const jumpToItem = (id: string) => {
    setSelectedItemId(id)
    document.getElementById('forecast-chart-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isEmpty   = !chartLoading && demand.length === 0
  const hasActual = demand.some((d: any) => d.actual != null)
  const selectedName = selectedItemId === 'ALL' ? null : items.find(i => i._id === selectedItemId)?.name
  const categories = Array.from(new Set(items.map(i => i.category))).sort()

  // Filter items berdasarkan search + kategori
  const filteredItems = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'ALL' || item.category === categoryFilter
    return matchSearch && matchCat
  })

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AI Demand Forecasting</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mlStats
              ? `${mlStats.model_type} · ${(mlStats.training_rows||31850).toLocaleString()} training rows · ${mlStats.n_features||33} fitur`
              : 'Memuat info model…'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
            🧠 AI Model Active
          </span>
          <button onClick={refreshAll} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* KPI — dari ML stats, bukan hardcode */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Forecast Accuracy</div>
          <div className="text-2xl font-semibold text-green-600">
            {mlStats?.demand_accuracy ?? '—'}{mlStats ? '%' : ''}
          </div>
          <div className="text-xs text-slate-400">
            {mlStats ? `MAPE ${mlStats.demand_mape}%` : 'Loading…'}
          </div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Training Rows</div>
          <div className="text-2xl font-semibold text-blue-600">
            {mlStats ? (mlStats.training_rows||31850).toLocaleString() : '—'}
          </div>
          <div className="text-xs text-slate-400">{mlStats?.training_period ?? '—'}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Prediction Range</div>
          <div className="text-2xl font-semibold text-blue-600">{horizon} Days</div>
          <div className="text-xs text-slate-400">Forward looking window</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Model</div>
          <div className="text-sm font-semibold text-purple-600 mt-1 leading-tight">
            {mlStats?.model_type?.split(' ')[0] ?? '—'}
          </div>
          <div className="text-xs text-slate-400">{mlStats?.n_features ?? '—'} features</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {(['demand', 'profit'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-xs px-4 py-1.5 rounded-md font-medium transition-all ${tab===k?'text-white':'text-slate-500 dark:text-slate-400'}`}
            style={tab===k?{backgroundColor:'var(--ac)'}:{}}>
            {k === 'demand' ? '📈 Demand Forecast' : '💰 Profit Forecast'}
          </button>
        ))}
      </div>

      <div id="forecast-chart-card" className="card mb-4">
        {/* Search + Filter bar */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="Cari nama produk…"
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                // kalau search dikosongkan + filter di-clear, reset ke ALL
                if (!e.target.value && categoryFilter === 'ALL') setSelectedItemId('ALL')
              }}
              className="input text-xs py-1 pl-7 w-full"
            />
          </div>
          <select className="input text-xs py-1 w-40" value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setSelectedItemId('ALL') }}>
            <option value="ALL">📂 Semua Kategori</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(search || categoryFilter !== 'ALL') && (
            <button onClick={() => { setSearch(''); setCategoryFilter('ALL'); setSelectedItemId('ALL') }}
              className="btn btn-secondary text-xs py-1">
              ✕ Reset Filter
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {selectedName
              ? `${tab === 'demand' ? 'Demand Trend' : 'Revenue & Profit Estimasi'} — ${selectedName}`
              : (tab === 'demand' ? 'Demand Trend berdasarkan Inventori Kamu' : 'Revenue & Net Profit Estimasi')}
          </h3>
          <div className="flex gap-2 items-center">
            <select className="input text-xs py-1 w-52" value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}>
              <option value="ALL">📦 Semua Produk (Agregat)</option>
              {(search || categoryFilter !== 'ALL' ? [
                // kalau ada filter, tampilkan semua hasil filter flat tanpa optgroup
                ...filteredItems.map(i => (
                  <option key={i._id} value={i._id}>{i.name} ({i.category})</option>
                ))
              ] : categories.map(cat => (
                <optgroup key={cat} label={cat}>
                  {items.filter(i => i.category === cat).map(i => (
                    <option key={i._id} value={i._id}>{i.name}</option>
                  ))}
                </optgroup>
              )))}
              {(search || categoryFilter !== 'ALL') && filteredItems.length === 0 && (
                <option disabled>— Tidak ada produk ditemukan —</option>
              )}
            </select>
            <select className="input text-xs py-1 w-28" value={horizon}
              onChange={e => setHorizon(Number(e.target.value))}>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={180}>180 Days</option>
            </select>
            <button onClick={handleRetrain} disabled={retraining}
              className="btn btn-primary text-xs py-1 disabled:opacity-60">
              {retraining ? '⏳ Training…' : '▶ Run Model'}
            </button>
          </div>
        </div>

        {/* Info bar khusus produk spesifik */}
        {itemMeta && !chartLoading && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-slate-400">Current Stock</div>
              <div className="text-lg font-semibold text-blue-600">{itemMeta.item.quantity}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-slate-400">Avg Daily Demand</div>
              <div className="text-lg font-semibold text-teal-600">{itemMeta.avgDailyDemand}/hari</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-slate-400">Est. Stockout</div>
              <div className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                {itemMeta.stockoutDays != null ? `${itemMeta.stockoutDays} hari lagi` : '—'}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-slate-400 mb-1">Risk Level</div>
              <span className={`badge text-xs ${riskCls(itemMeta.stockoutRisk)}`}>{itemMeta.stockoutRisk}</span>
            </div>
          </div>
        )}

        {chartLoading ? (
          <div className="h-48 skeleton rounded-lg" />
        ) : isEmpty ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Belum ada data inventory</div>
            <div className="text-xs mt-1">Tambahkan item inventory untuk melihat demand forecast</div>
          </div>
        ) : tab === 'demand' ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={demand}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v ? `${(v/1000).toFixed(0)}K` : '0'} />
              <Tooltip formatter={(v: any) => v != null ? v.toLocaleString() : '-'} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {hasActual && (
                <Area type="monotone" dataKey="actual" stroke="#94a3b8" fill="#f1f5f9"
                  name="Actual Demand" connectNulls={false} />
              )}
              <Area type="monotone" dataKey="predicted" stroke="#2dd4bf"
                fill="rgba(45,212,191,0.1)" strokeDasharray="6 4"
                name="Predicted Demand" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={demand.filter((d: any) => d.revenue != null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
              <Tooltip formatter={(v: any, name: string) => [v != null ? fmtK(v) : '-', name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" fill="#93c5fd" name="Revenue" radius={[3,3,0,0]} maxBarSize={24} />
              <Bar dataKey="net_profit" name="Net Profit" radius={[3,3,0,0]} maxBarSize={24}>
                {demand.filter((d: any) => d.revenue != null).map((row: any, i: number) => (
                  <Cell key={i} fill={row.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="net_profit" stroke="#8b5cf6"
                name="Trend" dot={false} strokeWidth={2} strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-product summary — semua produk sekaligus, klik buat drill-in */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Forecast per Produk</h3>
          <span className="text-xs text-slate-400">
            {(search || categoryFilter !== 'ALL')
              ? `${summary.filter(s => filteredItems.some(i => i._id === s.itemId)).length} dari ${summary.length} produk`
              : `${summary.length} produk`}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Klik baris produk buat lihat detail forecast-nya di chart atas
          {(search || categoryFilter !== 'ALL') && (
            <span className="ml-2 text-blue-500">· Filter aktif dari search bar di atas</span>
          )}
        </p>
        {loading ? (
          <div className="h-32 skeleton rounded-lg" />
        ) : summary.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-slate-400">
            <div className="text-3xl mb-2">📦</div>
            <div className="text-sm">Belum ada produk — tambahkan inventory item</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  {['Produk', 'Kategori', 'Stok', 'Pred. Demand/hari', 'Est. Stockout', 'Risk'].map(h => (
                    <th key={h} className="text-left text-slate-400 font-medium pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary
                  .filter(s => {
                    // Ikutin filter yg sama dari search bar + kategori
                    if (!search && categoryFilter === 'ALL') return true
                    return filteredItems.some(i => i._id === s.itemId)
                  })
                  .map((s: any) => (
                    <tr key={s.itemId}
                      onClick={() => jumpToItem(s.itemId)}
                      className={`border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selectedItemId === s.itemId ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                      <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">{s.name}</td>
                      <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{s.category}</td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.currentStock}</td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.predictedDailyDemand}</td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.stockoutDays != null ? `${s.stockoutDays} hari` : '—'}</td>
                      <td className="py-2"><span className={`badge text-xs ${riskCls(s.stockoutRisk)}`}>{s.stockoutRisk}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category forecast */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Forecast per Kategori (Inventory Kamu)
        </h3>
        {loading ? (
          <div className="h-44 skeleton rounded-lg" />
        ) : catData.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-slate-400">
            <div className="text-3xl mb-2">📂</div>
            <div className="text-sm">Belum ada kategori — tambahkan inventory item</div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="current" fill="#3b82f6" name="Stok Saat Ini" radius={[3,3,0,0]} />
                <Bar dataKey="predicted" fill="#22c55e" name="Prediksi Kebutuhan" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid gap-2" style={{gridTemplateColumns:`repeat(${Math.min(catData.length,7)},1fr)`}}>
              {catData.map((c: any) => (
                <div key={c.category} className="text-center">
                  <div className="text-xs text-slate-400 mb-1 truncate">{c.category?.split(' ')[0]}</div>
                  <div className={`text-sm font-bold ${c.margin >= 40 ? 'text-green-600' : c.margin >= 25 ? 'text-amber-500' : 'text-red-500'}`}>
                    {c.margin ?? '—'}%
                  </div>
                  <div className="text-xs text-slate-400">margin</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
