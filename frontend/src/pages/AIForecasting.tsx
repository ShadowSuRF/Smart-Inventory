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

import { fmtRp } from '../lib/currency'

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
  const [forecastSource, setForecastSource] = useState<'ml'|'fallback'|'ml_offline'|'ml_not_trained'|'no_data'|null>(null)
  const [forecastAccuracy, setForecastAccuracy] = useState<number|null>(null)
  const [forecastMessage, setForecastMessage] = useState<string|null>(null)
  const [itemMeta, setItemMeta] = useState<ItemMeta | null>(null)
  const [catData, setCatData]   = useState<any[]>([])
  const [summary, setSummary]   = useState<any[]>([])
  const [mlStats, setMlStats]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [horizon, setHorizon]   = useState(90)
  const [retraining, setRetraining] = useState(false)
  const [trainingPhase, setTrainingPhase] = useState<string|null>(null)
  const [trainingProgress, setTrainingProgress] = useState(0)
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
      // Selalu set mlStats — bahkan null accuracy (not_trained) supaya KPI tampil benar, bukan stuck "Memuat…"
      setMlStats(statsRes?.data?.data || { online: false, demand_accuracy: null, training_rows: 0, data_source: 'not_trained' })
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
        const predRes = await getForecastPredictions(horizon).catch((e: any) => {
          // Flask return 400 kalau model belum ditraining dari inventory user
          if (e?.response?.data?.error === 'model_not_trained') {
            setForecastSource('ml_not_trained')
            setForecastMessage(e.response.data.message)
          }
          return null
        })
        if (!predRes) return
        const d = predRes.data.data
        setDemand(d?.predictions || [])
        setForecastSource(d?.source || null)
        setForecastAccuracy(d?.accuracy ?? null)
        setForecastMessage(d?.message || null)
        setItemMeta(null)
      } else {
        const itemRes = await getItemForecast(selectedItemId, horizon).catch((e: any) => {
          if (e?.response?.data?.error === 'model_not_trained') {
            setForecastSource('ml_not_trained')
            setForecastMessage(e.response.data.message)
          }
          return null
        })
        if (!itemRes) return
        const d = itemRes.data.data
        setDemand(d?.predictions || [])
        setForecastSource(d?.source || null)
        setForecastAccuracy(d?.accuracy ?? null)
        setForecastMessage(d?.message || null)
        setItemMeta(d)
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
    if (items.length === 0) {
      toast.error('Belum ada inventory. Import data dulu sebelum training.')
      return
    }
    setRetraining(true)
    setTrainingProgress(0)
    setTrainingPhase('Mengirim data inventory ke ML engine...')

    // Trigger training (return segera — async di backend)
    try {
      await triggerModelRetrain()
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Gagal memulai training. Pastikan Flask ML API jalan: python3 ml/app.py'
      toast.error(msg)
      setRetraining(false); setTrainingPhase(null)
      return
    }

    // Animasi progress + polling /retrain-status tiap 2 detik
    const PHASES = [
      { pct: 10, msg: `Memuat ${items.length} produk dari MongoDB...` },
      { pct: 25, msg: 'Membuat time-series training data (2.5 tahun)...' },
      { pct: 45, msg: 'Feature engineering 33 fitur...' },
      { pct: 65, msg: 'Melatih Gradient Boosting (demand model)...' },
      { pct: 82, msg: 'Melatih Gradient Boosting (profit model)...' },
      { pct: 92, msg: 'Menyimpan model ke MongoDB...' },
    ]
    let phaseIdx = 0
    const startTime = Date.now()
    const MAX_WAIT = 8 * 60 * 1000

    await new Promise<void>((resolve) => {
      const tick = setInterval(async () => {
        const elapsed = Date.now() - startTime

        // Animasi progress
        const timeBasedPct = Math.min(90, (elapsed / (items.length * 30000 + 15000)) * 90)
        const targetPct = Math.max(phaseIdx < PHASES.length ? PHASES[phaseIdx].pct : 90, timeBasedPct)
        setTrainingProgress(p => Math.min(p + (targetPct - p) * 0.3, 90))

        const expectedPhaseIdx = Math.min(Math.floor(elapsed / (items.length * 5000 + 10000)), PHASES.length - 1)
        if (expectedPhaseIdx > phaseIdx) {
          phaseIdx = expectedPhaseIdx
          setTrainingPhase(PHASES[phaseIdx].msg)
        }

        if (elapsed > MAX_WAIT) {
          clearInterval(tick)
          toast.error('Training timeout — cek terminal Flask')
          setRetraining(false); setTrainingPhase(null)
          resolve(); return
        }

        // Poll /retrain-status
        try {
          const statusRes = await api.get('/forecasting/retrain-status')
          const { status, result } = statusRes.data

          if (status === 'done') {
            clearInterval(tick)
            setTrainingProgress(100)
            setTrainingPhase('✅ Training selesai!')

            if (result?.success) {
              // Langsung update mlStats dari result — tidak perlu fetch ulang
              setMlStats({
                online:          true,
                model_type:      'GradientBoostingRegressor (scikit-learn)',
                demand_accuracy: result.demand_accuracy,
                demand_mape:     result.demand_mape,
                profit_accuracy: result.profit_accuracy,
                training_rows:   result.training_rows,
                n_features:      33,
                trained_at:      result.trained_at,
                data_source:     result.data_source,
                data_label:      result.data_label,
                inventory_count: result.inventory_count,
              })
              toast.success(
                `✅ Training selesai! Accuracy: ${result.demand_accuracy?.toFixed(1)}%  |  ${result.training_rows?.toLocaleString()} rows dari ${result.inventory_count} produk`
              )
              // Refresh chart
              setTimeout(async () => {
                await fetchChart()
                setRetraining(false); setTrainingPhase(null); setTrainingProgress(0)
              }, 600)
            } else {
              toast.error(result?.error || 'Training gagal')
              setRetraining(false); setTrainingPhase(null)
            }
            resolve()
          }
          // status === 'in_progress' → lanjut tunggu
        } catch { /* ignore poll error */ }
      }, 2000)
    })
  }

  const jumpToItem = (id: string) => {
    setSelectedItemId(id)
    document.getElementById('forecast-chart-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
              ? `${mlStats.model_type} · ${mlStats.training_rows ? mlStats.training_rows.toLocaleString() + ' training rows' : 'belum training'} · ${mlStats.n_features || 33} fitur`
              : 'Memuat info model…'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Status badge: jujur soal ML nyala atau tidak, dan akurasi beneran */}
          {mlStats?.online ? (
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              🧠 ML API Online
              {mlStats.demand_accuracy != null && ` · ${mlStats.demand_accuracy}% acc`}
            </span>
          ) : mlStats?.online === false ? (
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              ⚠ ML API Offline — estimasi sederhana
            </span>
          ) : (
            <span className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
              Mengecek ML API…
            </span>
          )}
          <button onClick={refreshAll} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* Data source warning — tampil kalau masih pakai global CSV */}
      {mlStats?.data_source === 'global_csv' && items.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 flex items-start gap-2">
          <span className="text-amber-500 flex-shrink-0 mt-0.5">⚠</span>
          <div className="text-xs text-amber-700 dark:text-amber-400 flex-1">
            <strong>Model masih ditraining dari data global</strong> — bukan dari inventory kamu.
            Klik <strong>"▶ Run Model"</strong> di bawah untuk melatih ulang model menggunakan {items.length} produk yang sudah kamu input.
            Setelah retrain, accuracy dan prediksi akan mencerminkan pola dari data kamu sendiri.
          </div>
        </div>
      )}
      {mlStats?.data_source === 'user_inventory' && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 flex items-center gap-2">
          <span className="text-green-500">✅</span>
          <div className="text-xs text-green-700 dark:text-green-400">
            Model sudah ditraining dari <strong>{mlStats.data_label}</strong>. Forecasting menggunakan pola dari data inventorimu sendiri.
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {/* Accuracy — baca dari mlStats, bukan tunggu chart load */}
        <div className="kpi-card" title={mlStats?.demand_accuracy ? `Akurasi diukur dari 15% data sintetis yang di-generate dari pola inventory kamu (bukan dari transaksi penjualan real). MAPE = ${mlStats.demand_mape}%` : ''}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Forecast Accuracy</div>
          <div className={`text-2xl font-semibold ${
            mlStats?.demand_accuracy != null ? 'text-green-600' : 'text-slate-400'
          }`}>
            {mlStats?.demand_accuracy != null ? `${mlStats.demand_accuracy}%` : '—'}
          </div>
          <div className="text-xs text-slate-400">
            {mlStats?.demand_accuracy != null
              ? `MAPE ${mlStats.demand_mape ?? '?'}% · ${mlStats.online ? 'Live' : 'Cached'}`
              : mlStats?.data_source === 'not_trained' ? 'Belum di-training' : 'Memuat…'}
          </div>
        </div>

        {/* Training Rows — jujur soal sumber data, tidak hardcode 31850 */}
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Training Rows</div>
          <div className={`text-2xl font-semibold ${
            mlStats?.training_rows ? 'text-blue-600' : 'text-slate-400'
          }`}>
            {mlStats?.training_rows ? mlStats.training_rows.toLocaleString() : '—'}
          </div>
          <div className="text-xs text-slate-400 leading-tight mt-0.5">
            {mlStats?.data_source === 'user_inventory'
              ? <span className="text-green-600 font-medium">✓ Dari inventory kamu</span>
              : mlStats?.data_source === 'global_csv'
              ? <span className="text-amber-600">⚠ Data global (bukan data kamu)</span>
              : mlStats ? 'Data training' : '—'}
          </div>
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
              className="btn btn-primary text-xs py-1 disabled:opacity-70 disabled:cursor-wait flex items-center gap-1.5">
              {retraining ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full inline-block"
                    style={{ animation:'spin 0.8s linear infinite' }} />
                  Training {trainingProgress.toFixed(0)}%...
                </>
              ) : '▶ Run Model'}
            </button>
          </div>
        </div>

        {/* Banner: ML offline — tampil HANYA jika ada fallback data lama, bukan ml_offline */}
        {forecastSource === 'fallback' && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 flex items-start gap-2">
            <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
            <div>
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">ML API Offline — menggunakan estimasi sederhana</div>
              <div className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Data chart ini dihitung dari rumus seasonal math berbasis inventory kamu — <strong>bukan dari model Gradient Boosting</strong>.
                Jalankan <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">python3 ml/app.py</code> di terminal untuk aktifkan ML API (port 5002).
              </div>
            </div>
          </div>
        )}
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
        ) : retraining ? (
          /* ── Training in progress overlay ── */
          <div className="h-48 flex flex-col items-center justify-center gap-3">
            {/* Progress bar */}
            <div className="w-full max-w-sm">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span className="font-medium">🧠 Melatih model dari inventory kamu...</span>
                <span>{trainingProgress.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${trainingProgress}%`,
                    backgroundColor: trainingProgress === 100 ? '#22c55e' : 'var(--ac)',
                  }}
                />
              </div>
            </div>

            {/* Current phase message */}
            <div className="text-xs text-center text-slate-600 dark:text-slate-300 max-w-xs animate-pulse">
              {trainingPhase || 'Memulai training...'}
            </div>

            {/* Item count info */}
            <div className="text-xs text-slate-400 text-center">
              {items.length} produk · {(items.length * 2.5 * 365).toLocaleString()} baris training data
            </div>

            {/* Animated dots */}
            <div className="flex gap-1">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--ac)',
                    animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                    opacity: 0.7,
                  }} />
              ))}
            </div>

            {/* Note: training time estimate */}
            <div className="text-xs text-slate-400 italic">
              Estimasi: {items.length <= 5 ? '~30 detik' : items.length <= 20 ? '~1-2 menit' : '~3-5 menit'} —
              jangan tutup halaman ini
            </div>
          </div>
        ) : forecastSource === 'no_data' || (demand.length === 0 && !forecastSource) ? (
          /* ── State 1: Belum ada inventory sama sekali ── */
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="text-4xl">📦</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Belum ada data inventory</div>
            <div className="text-xs text-center max-w-xs">
              Tambahkan item manual di menu <strong>Inventory</strong> atau import file CSV/Excel via menu <strong>Excel Import</strong> dulu
            </div>
            <div className="flex gap-2 mt-1">
              <a href="/inventory"    className="btn btn-primary text-xs py-1">+ Tambah Manual</a>
              <a href="/excel-import" className="btn btn-secondary text-xs py-1">📥 Import Excel</a>
            </div>
          </div>
        ) : forecastSource === 'ml_offline' ? (
          /* ── State 2: Ada inventory tapi Flask belum jalan ── */
          <div className="h-48 flex flex-col items-center justify-center gap-2">
            <div className="text-4xl">🧠</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
              ML API belum dijalankan
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-sm">
              {forecastMessage || 'Kamu sudah punya inventory. Jalankan Flask API untuk melihat forecasting.'}
            </div>
            <div className="mt-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg font-mono text-xs text-slate-600 dark:text-slate-300">
              python3 ml/app.py
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Setelah jalan, klik 🔄 Refresh atau ▶ Run Model
            </div>
          </div>
        ) : forecastSource === 'ml_not_trained' ? (
          /* ── State 3: Flask jalan tapi model masih dari global CSV ── */
          <div className="h-48 flex flex-col items-center justify-center gap-2">
            <div className="text-4xl">🎯</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Belum ditraining dari data kamu
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-sm">
              Flask sudah jalan, tapi model belum dilatih dari inventory kamu.<br/>
              Klik <strong>▶ Run Model</strong> untuk melatih dari {items.length} produk kamu.
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 text-center">
              ⚠ Forecasting tidak akan tampil sampai kamu klik Run Model
            </div>
          </div>
        ) : demand.length === 0 ? (
          /* ── State 3: ML jalan tapi prediksi kosong ── */
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
            Tidak ada data prediksi. Coba klik ▶ Run Model untuk generate forecasting.
          </div>
        ) : tab === 'demand' ? (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={demand}>
              <defs>
                <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2dd4bf" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.20}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              {/* domain: min-10% sampai max+10% supaya variasi terlihat jelas */}
              <YAxis tick={{ fontSize: 11 }}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : String(v)}
                domain={[(dataMin: number) => Math.floor(dataMin * 0.88), (dataMax: number) => Math.ceil(dataMax * 1.08)]}
              />
              <Tooltip formatter={(v: any) => v != null ? v.toLocaleString() : '-'} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {hasActual && (
                <Area type="monotone" dataKey="actual" stroke="#94a3b8"
                  fill="url(#actualGrad)" strokeWidth={2}
                  name="Actual Demand" connectNulls={false} dot={false} />
              )}
              <Area type="monotone" dataKey="predicted" stroke="#0ea572"
                fill="url(#demandGrad)" strokeWidth={2.5} strokeDasharray="7 4"
                name="Predicted Demand" connectNulls={false} dot={{ r: 3, fill: '#0ea572' }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={demand} margin={{ top:4, right:48, bottom:0, left:4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              {/* Revenue bars (left axis) */}
              <YAxis yAxisId="rev" tick={{ fontSize: 10 }} tickFormatter={v => fmtRp(v)}
                domain={[(d: number) => Math.floor(d * 0.82), (d: number) => Math.ceil(d * 1.10)]} width={60} />
              {/* Net profit line (right axis) — scale terpisah supaya kelihatan variasinya */}
              <YAxis yAxisId="net" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => fmtRp(v)}
                domain={[(d: number) => Math.floor(d * 0.82), (d: number) => Math.ceil(d * 1.10)]} width={50} />
              <Tooltip formatter={(v: any, name: string) => [v != null ? fmtRp(v) : '-', name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey="revenue" fill="#93c5fd" name="Revenue" radius={[3,3,0,0]} maxBarSize={24} opacity={0.85} />
              <Bar yAxisId="net" dataKey="net_profit" name="Net Profit" radius={[3,3,0,0]} maxBarSize={24}>
                {demand.map((row: any, i: number) => (
                  <Cell key={i} fill={row.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
              <Line yAxisId="net" type="monotone" dataKey="net_profit" stroke="#8b5cf6"
                name="Trend" dot={false} strokeWidth={2.5} strokeDasharray="5 3" connectNulls />
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
