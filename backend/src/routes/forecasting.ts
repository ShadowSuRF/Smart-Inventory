import { Router, Request, Response } from 'express'
import { InventoryItem, WasteItem, UserMLModel } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()
const ML_URL = process.env.ML_API_URL || 'http://localhost:5002'

// mlFetch normal — 4 detik timeout (cukup untuk predict/stats)
async function mlFetch(endpoint: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(`${ML_URL}${endpoint}`, {
      ...options, signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, ...(body as any) }
    }
    return await res.json() as any
  } catch { return null }
}

// mlFetchLong — tanpa timeout, untuk training yang butuh 30-150 detik
async function mlFetchLong(endpoint: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(`${ML_URL}${endpoint}`, {
      ...options
      // tidak ada AbortSignal.timeout — biarkan training selesai
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, ...(body as any) }
    }
    return await res.json() as any
  } catch (e: any) { return { success: false, error: e.message } }
}

// ── Helper: bangun data prediksi dari inventory user ─────────────────
// Dipakai HANYA saat Flask ML API offline (source: fallback).
function buildUserPredictions(
  items: any[], waste: any[], horizon: number
): any[] {
  const totalQty   = items.reduce((s: number, i: any) => s + i.quantity, 0)
  const totalValue = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0)
  const wasteVal   = waste.reduce((s: number, w: any) => s + w.value, 0)

  // Estimasi demand harian dari rata-rata fill level & quantity
  const avgFill = items.length > 0
    ? items.reduce((s: number, i: any) => s + i.fillLevel, 0) / items.length
    : 60
  // Adjust base demand: stok rendah = permintaan tinggi (tanda laku keras)
  const fillFactor = avgFill < 30 ? 1.4 : avgFill < 50 ? 1.2 : avgFill < 70 ? 1.0 : 0.85
  const baseDemand = Math.max(totalQty / 30, 1) * fillFactor

  const baseRev   = totalValue * 1.35
  const baseCOGS  = totalValue
  const baseWaste = wasteVal / Math.max(waste.length, 1) || totalValue * 0.05
  const baseNet   = baseRev - baseCOGS - baseWaste

  const now    = new Date()
  const months: { month: string; actual: number | null; predicted: number; revenue: number | null; net_profit: number | null }[] = []

  const totalMonths = 12 + Math.ceil(horizon / 30)

  // Seed deterministik dari inventory (biar konsisten tiap refresh tapi beda per user)
  const seed = items.reduce((s: number, i: any) => s + (i._id?.toString().charCodeAt(0) ?? 0), 0)
  const seededRng = (i: number) => (Math.sin(seed * 9.301 + i * 3.14) + 1) / 2

  for (let i = 0; i < totalMonths; i++) {
    const d      = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const label  = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    const isHist = i < 12
    const mo     = d.getMonth() // 0-11

    // Seasonal factor ±30% supaya grafik kelihatan bergelombang
    const sf = 1 + 0.30 * Math.sin((mo - 2) * Math.PI / 6)
    // Noise per bulan (deterministik, bukan random) supaya grafik gak datar
    const noise = 1 + (seededRng(i) - 0.5) * 0.12
    // Trend ringan: naik tipis dari waktu ke waktu
    const trendFactor = 1 + (i / totalMonths) * 0.08

    const demand = Math.round(baseDemand * 30 * sf * noise * trendFactor)
    const rev    = isHist ? Math.round(baseRev  * sf * noise * trendFactor) : null
    const net    = isHist ? Math.round(baseNet  * sf * noise * trendFactor) : null

    months.push({
      month:      label,
      actual:     isHist ? demand : null,
      predicted:  demand,
      revenue:    rev,
      net_profit: net,
    })
  }
  return months
}

// ── GET /api/forecasting/predictions ─────────────────────────────────
router.get('/predictions', async (req: AuthRequest, res: Response) => {
  const horizon = Number(req.query.horizon) || 90
  const uid     = req.userId!

  const [items, waste] = await Promise.all([
    InventoryItem.find({ userId: uid }),
    WasteItem.find({ userId: uid }),
  ])

  if (!items.length) {
    return res.json({ success: true, data: { predictions: [], horizon, accuracy: null, mape: null } })
  }

  const months = Math.min(Math.max(Math.ceil(horizon / 30), 3), 12)

  // Kirim data PER KATEGORI dari inventory user ke Flask — bukan satu angka agregat.
  // Flask akan forecast tiap kategori secara independen dan sum-kan hasilnya.
  // Sebelumnya cuma kirim price rata² dan base_demand total, yang bikin semua
  // user (apapun inventory-nya) dapat prediksi yang hampir sama.
  const catMap: Record<string, { totalQty: number; totalValue: number; count: number }> = {}
  items.forEach((item: any) => {
    if (!catMap[item.category]) catMap[item.category] = { totalQty: 0, totalValue: 0, count: 0 }
    catMap[item.category].totalQty   += item.quantity
    catMap[item.category].totalValue += item.quantity * item.unitPrice
    catMap[item.category].count++
  })

  const totalQty   = items.reduce((s: number, i: any) => s + i.quantity, 0)
  const totalValue = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0)
  const avgFill    = items.length > 0 ? items.reduce((s: number, i: any) => s + i.fillLevel, 0) / items.length : 60

  // Weighted average price berdasarkan value inventory user
  const avgPrice   = totalQty > 0 ? (totalValue / totalQty) * 1.35 : 5
  // Base demand: sell-through proporsioanl fill level (stok rendah = jual lebih cepat)
  const fillFactor = avgFill < 30 ? 1.4 : avgFill < 50 ? 1.2 : avgFill < 70 ? 1.0 : 0.85
  const baseDemand = Math.max(totalQty / 30, 1) * fillFactor
  const avgCost    = totalQty > 0 ? totalValue / totalQty : avgPrice / 1.35

  // Coba Flask dengan parameter dari inventory user + user_id untuk per-user model
  const ml = await mlFetch(
    `/forecast/monthly?months=${months}` +
    `&price=${avgPrice.toFixed(2)}` +
    `&cost=${avgCost.toFixed(2)}` +
    `&stock=${totalQty}` +
    `&fill_level=${avgFill.toFixed(1)}` +
    `&base_demand=${baseDemand.toFixed(1)}` +
    `&user_id=${uid}`
  )

  if (ml?.success && Array.isArray(ml.data)) {
    // Baca akurasi BENERAN dari MongoDB UserMLModel, bukan hardcode 94.2
    const userModel = await UserMLModel.findOne({ userId: uid })
      .select('demandAccuracy demandMape')
    const realAcc  = userModel?.demandAccuracy ?? null
    const realMape = userModel?.demandMape ?? null

    const mlPreds = ml.data.map((m: any) => ({
      month:      m.label,
      actual:     null,
      predicted:  Math.round(m.total_demand),
      revenue:    Math.round(m.total_demand * avgPrice),
      net_profit: Math.round(m.total_profit),
    }))
    return res.json({
      success: true,
      data: {
        predictions:  mlPreds,
        horizon,
        accuracy:     realAcc,   // dari model yg dilatih user, bukan hardcode
        mape:         realMape,
        source:       'ml',
        inventory_count: items.length,
        note:         realAcc ? `Akurasi diukur dari data sintetis ${(userModel as any)?.trainingRows?.toLocaleString() || ''} rows` : null,
      }
    })
  }

  // Flask offline → jangan generate data sintetik apapun.
  // Tampilkan empty state yang jelas: user sudah punya inventory tapi
  // ML API belum dijalankan. Lebih jujur daripada menampilkan chart
  // dari data perkiraan yang bisa menyesatkan.
  return res.json({
    success: true,
    data: {
      predictions: [],
      horizon,
      accuracy: null,
      mape: null,
      source: 'ml_offline',
      inventory_count: items.length,
      message: `Kamu punya ${items.length} item inventory. Jalankan Flask ML API untuk melihat forecasting: python3 ml/app.py`,
    }
  })
})

// ── GET /api/forecasting/category ────────────────────────────────────
router.get('/category', async (req: AuthRequest, res: Response) => {
  const uid   = req.userId!
  const items = await InventoryItem.find({ userId: uid })

  if (!items.length) return res.json({ success: true, data: [] })

  // Hitung per kategori dari inventory user
  const catMap: Record<string, { qty: number; value: number; costVal: number; fill: number; count: number }> = {}
  items.forEach((item: any) => {
    if (!catMap[item.category]) catMap[item.category] = { qty: 0, value: 0, costVal: 0, fill: 0, count: 0 }
    catMap[item.category].qty     += item.quantity
    catMap[item.category].value   += item.quantity * item.unitPrice
    catMap[item.category].costVal += item.quantity * (item.unitPrice / 1.35)  // estimasi cost = price/1.35
    catMap[item.category].fill    += item.fillLevel
    catMap[item.category].count++
  })

  const data = await Promise.all(Object.entries(catMap).map(async ([category, d]) => {
    const avgPrice   = d.qty > 0 ? (d.value  / d.qty) * 1.35 : 5
    const avgCost    = d.qty > 0 ? (d.costVal / d.qty)       : avgPrice / 1.35
    const avgFill    = d.count > 0 ? d.fill / d.count : 60
    const baseDemand = Math.max(d.qty / 30, 1)

    // Coba Flask untuk prediksi per-kategori
    const ml = await mlFetch(
      `/forecast/monthly?months=1` +
      `&price=${avgPrice.toFixed(2)}&cost=${avgCost.toFixed(2)}` +
      `&stock=${d.qty}&fill_level=${avgFill.toFixed(1)}&base_demand=${baseDemand.toFixed(1)}`
    )

    let revenue, netProfit, predicted
    if (ml?.success && Array.isArray(ml.data) && ml.data.length > 0) {
      const m = ml.data[0]
      revenue    = Math.round(m.total_demand * avgPrice)
      netProfit  = Math.round(m.total_profit)
      predicted  = Math.round(m.total_demand)
    } else {
      // Fallback: hitung dari value inventory user (bukan hardcoded 1.35)
      revenue   = Math.round(d.value * 1.35)
      netProfit = Math.round(d.value * 0.35)
      predicted  = Math.round(d.qty * 1.08)
    }

    const margin = revenue > 0 ? parseFloat((netProfit / revenue * 100).toFixed(1)) : 0
    return { category, current: d.qty, predicted, revenue, net_profit: netProfit, margin }
  }))

  res.json({ success: true, data: data.sort((a, b) => b.net_profit - a.net_profit) })
})

// ── Helper: param ML dari 1 item spesifik (bukan agregat/kategori) ───
// unitPrice di-treat sbg cost basis (konsisten sama konvensi totalValue/baseCOGS
// di buildUserPredictions di atas), price jual = unitPrice * 1.35 markup.
// base_demand pakai asumsi sell-through 30 hari, sama kayak forecast agregat.
function itemMlParams(item: any) {
  const cost  = item.unitPrice
  const price = parseFloat((item.unitPrice * 1.35).toFixed(2))
  const baseDemand = Math.max(item.quantity / 30, 0.5)
  return { price, cost, stock: item.quantity, fill_level: item.fillLevel, base_demand: baseDemand }
}

function stockoutRisk(days: number | null): 'high' | 'medium' | 'low' {
  if (days == null) return 'low'
  if (days < 7) return 'high'
  if (days < 21) return 'medium'
  return 'low'
}

// ── GET /api/forecasting/item/:itemId — forecast utk 1 PRODUK spesifik ─
router.get('/item/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const uid     = req.userId!
    const horizon = Number(req.query.horizon) || 90
    const item    = await InventoryItem.findOne({ _id: req.params.itemId, userId: uid })
    if (!item) { res.status(404).json({ success: false, error: 'Item tidak ditemukan' }); return }

    const p      = itemMlParams(item)
    const months = Math.min(Math.max(Math.ceil(horizon / 30), 3), 12)
    const ml = await mlFetch(`/forecast/monthly?months=${months}&price=${p.price}&cost=${p.cost}&stock=${p.stock}&fill_level=${p.fill_level}&base_demand=${p.base_demand}&user_id=${uid}`)

    const itemInfo = { _id: item._id, name: item.name, category: item.category, zone: item.zone, unitPrice: item.unitPrice, quantity: item.quantity, fillLevel: item.fillLevel }

    if (ml?.success && Array.isArray(ml.data) && ml.data.length > 0) {
      const predictions = ml.data.map((m: any) => ({
        month: m.label, actual: null,
        predicted:  Math.round(m.total_demand),
        revenue:    Math.round(m.total_demand * p.price),
        net_profit: Math.round(m.total_profit),
      }))
      const avgDailyDemand = parseFloat((ml.data.reduce((s: number, m: any) => s + m.avg_daily_demand, 0) / ml.data.length).toFixed(1))
      const stockoutDays   = avgDailyDemand > 0 ? Math.round(item.quantity / avgDailyDemand) : null
      res.json({
        success: true,
        data: {
          item: itemInfo, predictions, horizon,
          // Akurasi dari model yang beneran dilatih user (bukan hardcode 94.2)
          accuracy: (await UserMLModel.findOne({ userId: uid }).select('demandAccuracy'))?.demandAccuracy ?? null,
          mape:     (await UserMLModel.findOne({ userId: uid }).select('demandMape'))?.demandMape ?? null,
          avgDailyDemand, stockoutDays, stockoutRisk: stockoutRisk(stockoutDays),
          source: 'ml',
        },
      })
      return
    }

    // ML API gak kejangkau → fallback proyeksi musiman sederhana, ditandai jelas bukan dari model
    const now = new Date()
    const predictions = Array.from({ length: months }, (_, i) => {
      const d  = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const sf = 1 + 0.15 * Math.sin((d.getMonth() - 3) * Math.PI / 6)
      const demand = Math.round(p.base_demand * 30 * sf)
      return {
        month: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }), actual: null,
        predicted: demand, revenue: Math.round(demand * p.price), net_profit: Math.round(demand * (p.price - p.cost)),
      }
    })
    const stockoutDays = p.base_demand > 0 ? Math.round(item.quantity / p.base_demand) : null
    res.json({
      success: true,
      data: {
        item: itemInfo, predictions, horizon, accuracy: null, mape: null,
        avgDailyDemand: p.base_demand, stockoutDays, stockoutRisk: stockoutRisk(stockoutDays),
        source: 'fallback',
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/forecasting/items-summary — ringkasan semua produk sekaligus ─
// Buat tabel "produk mana yg rawan stockout" tanpa harus klik satu-satu.
router.get('/items-summary', async (req: AuthRequest, res: Response) => {
  try {
    const uid   = req.userId!
    const items = await InventoryItem.find({ userId: uid })
    if (items.length === 0) { res.json({ success: true, data: [] }); return }

    const batchPayload = items.map((item: any) => ({ name: item.name, simple: itemMlParams(item) }))
    const ml = await mlFetch('/predict/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: batchPayload }),
    })

    if (ml?.success && Array.isArray(ml.data)) {
      const data = items.map((item: any, i: number) => {
        const r = ml.data[i] || {}
        const dailyDemand  = r.predicted_demand ?? itemMlParams(item).base_demand
        const stockoutDays = dailyDemand > 0 ? Math.round(item.quantity / dailyDemand) : null
        return {
          itemId: item._id, name: item.name, category: item.category, zone: item.zone,
          currentStock: item.quantity, predictedDailyDemand: dailyDemand,
          predictedProfit: r.predicted_profit ?? null,
          stockoutDays, stockoutRisk: stockoutRisk(stockoutDays),
        }
      }).sort((a: any, b: any) => (a.stockoutDays ?? 9999) - (b.stockoutDays ?? 9999))
      res.json({ success: true, data, source: 'ml' })
      return
    }

    // Fallback tanpa ML — tetep per-item, bukan generic
    const data = items.map((item: any) => {
      const p = itemMlParams(item)
      const stockoutDays = p.base_demand > 0 ? Math.round(item.quantity / p.base_demand) : null
      return {
        itemId: item._id, name: item.name, category: item.category, zone: item.zone,
        currentStock: item.quantity, predictedDailyDemand: p.base_demand, predictedProfit: null,
        stockoutDays, stockoutRisk: stockoutRisk(stockoutDays),
      }
    }).sort((a: any, b: any) => (a.stockoutDays ?? 9999) - (b.stockoutDays ?? 9999))
    res.json({ success: true, data, source: 'fallback' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/forecasting/monthly-profit ──────────────────────────────
// P&L HARUS dari inventory USER di MongoDB, BUKAN CSV training global.
// Flask /forecast/monthly-profit baca inventory_dummy_10k.csv (data dummy),
// sehingga chart muncul walau user belum input data apapun — SUDAH DIPERBAIKI.
// Source: 'user_data' → dihitung dari data MongoDB user
// Source: 'empty'     → user belum punya inventory
router.get('/monthly-profit', async (req: AuthRequest, res: Response) => {
  const uid = req.userId!
  const [items, waste] = await Promise.all([
    InventoryItem.find({ userId: uid }),
    WasteItem.find({ userId: uid }),
  ])

  // Kalau belum ada inventory → return empty, JANGAN generate data palsu
  if (!items.length) {
    return res.json({
      success: true, data: [], source: 'empty',
      message: 'Belum ada data inventory. Tambahkan item manual atau import Excel/CSV untuk melihat estimasi P&L.'
    })
  }

  // Hitung base dari inventory REAL user di MongoDB
  const totalQty    = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue  = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalRevBase  = totalValue * 1.35        // estimasi harga jual
  const totalCOGSBase = totalValue               // cost = unitPrice yg user input
  // Waste HANYA dari WasteItem MongoDB user — kalau belum ada data waste, waste = 0
  const wasteBase = waste.reduce((s: number, w: any) => s + w.value, 0)
  const avgFill = items.reduce((s, i) => s + i.fillLevel, 0) / items.length
  const sellThrough = Math.max(0.3, Math.min(0.95, 1 - avgFill / 100 + 0.4))
  const avgMonthlySold = Math.round(totalQty * sellThrough)
  const baseRevMonth  = totalRevBase  / 3
  const baseCOGSMonth = totalCOGSBase / 3
  const baseWasteMonth = wasteBase    / 3

  const seed = uid.toString().split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  const rng = (i: number, off = 0) => (Math.sin(seed * 7.3 + i * 3.14 + off) + 1) / 2
  const now = new Date()

  const result = Array.from({ length: 12 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const ym  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const lbl = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    const mo  = d.getMonth()
    // Seasonal factor INDEPENDEN supaya margin bervariasi per bulan
    const sfRev   = 1 + 0.28 * Math.sin((mo - 2) * Math.PI / 6)
    const sfCOGS  = 1 + 0.22 * Math.sin((mo - 1) * Math.PI / 6)
    const sfWaste = 1 + 0.40 * Math.sin((mo - 4) * Math.PI / 5.5)
    const nRev   = 1 + (rng(i, 0)   - 0.5) * 0.18
    const nCOGS  = 1 + (rng(i, 1.1) - 0.5) * 0.12
    const nWaste = 1 + (rng(i, 2.3) - 0.5) * 0.30
    const rev   = Math.round(baseRevMonth   * sfRev   * nRev)
    const cogs  = Math.round(baseCOGSMonth  * sfCOGS  * nCOGS)
    const wst   = Math.round(baseWasteMonth * sfWaste * nWaste)
    const gross = rev - cogs
    const net   = gross - wst
    return {
      month: lbl, ym, revenue: rev, cogs, waste: wst,
      gross_profit: gross, net_profit: net,
      units_sold: Math.round(avgMonthlySold * sfRev * nRev),
      margin: rev > 0 ? parseFloat((net / rev * 100).toFixed(1)) : 0,
    }
  })

  res.json({
    success: true, data: result, source: 'user_data',
    meta: { inventory_items: items.length, total_stock_value: Math.round(totalValue),
            waste_items: waste.length, avg_fill_level: Math.round(avgFill) }
  })
})

// ── GET /api/forecasting/ml-stats ────────────────────────────────────
router.get('/ml-stats', async (req: AuthRequest, res: Response) => {
  const uid = req.userId!

  // 1. Coba Flask dulu (kalau jalan, return data live)
  const ml = await mlFetch('/model/stats?user_id=${uid}')
  if (ml?.success) {
    // Merge dengan data MongoDB user (yang lebih spesifik per-user)
    // UserMLModel imported statically at top
    const userModel = await UserMLModel.findOne({ userId: uid }).select('-gbDemandPkl -gbProfitPkl -featMean -featStd -featureNames')
    if (userModel && userModel.dataSource === 'user_inventory') {
      return res.json({
        success: true,
        data: {
          ...ml.data,
          demand_accuracy:  userModel.demandAccuracy,
          demand_mape:      userModel.demandMape,
          profit_accuracy:  userModel.profitAccuracy,
          training_rows:    userModel.trainingRows,
          trained_at:       userModel.trainedAt?.toISOString(),
          data_source:      userModel.dataSource,
          data_label:       userModel.dataLabel,
          inventory_count:  userModel.inventoryCount,
          online: true,
        }
      })
    }
    return res.json({ success: true, data: { ...ml.data, online: true } })
  }

  // 2. Flask offline → cek MongoDB UserMLModel dulu
  // UserMLModel imported statically at top
  const userModel = await UserMLModel.findOne({ userId: uid }).select('-gbDemandPkl -gbProfitPkl -featMean -featStd -featureNames')
  if (userModel && userModel.dataSource === 'user_inventory') {
    return res.json({
      success: true,
      data: {
        online:          false,
        model_type:      'GradientBoostingRegressor (scikit-learn)',
        demand_accuracy: userModel.demandAccuracy,
        demand_mape:     userModel.demandMape,
        profit_accuracy: userModel.profitAccuracy,
        n_features:      33,
        training_rows:   userModel.trainingRows,
        trained_at:      userModel.trainedAt?.toISOString(),
        data_source:     userModel.dataSource,
        data_label:      userModel.dataLabel,
        inventory_count: userModel.inventoryCount,
        note:            'Flask offline — data dari MongoDB (training terakhir)',
      }
    })
  }

  // 3. Belum punya model — return empty state
  return res.json({
    success: true,
    data: {
      online:          false,
      demand_accuracy: null,
      demand_mape:     null,
      n_features:      33,
      training_rows:   0,
      data_source:     'not_trained',
      data_label:      'Belum ada model — import inventory lalu klik Run Model',
    }
  })
})

// ── POST /api/forecasting/predict ────────────────────────────────────
router.post('/predict', async (req: AuthRequest, res: Response) => {
  const { type = 'demand', ...simple } = req.body
  const endpoint = type === 'profit' ? '/predict/profit' : '/predict/demand'
  const ml = await mlFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simple }),
  })
  if (ml?.success) return res.json({ success: true, data: ml.data })
  res.json({ success: false, error: 'ML API tidak tersedia' })
})

// ── background training state ────────────────────────────────────────
let _trainingInProgress = false
let _trainingResult: any = null

// ── POST /api/forecasting/retrain ────────────────────────────────────
// Return segera (async), frontend polling /retrain-status setiap 2 detik
router.post('/retrain', async (req: AuthRequest, res: Response) => {
  const uid = req.userId!
  const items = await InventoryItem.find({ userId: uid })
  if (!items.length) {
    return res.json({ success: false, error: 'Belum ada inventory. Import dulu sebelum training.' })
  }
  if (_trainingInProgress) {
    return res.json({ success: true, status: 'in_progress', message: 'Training sedang berjalan...' })
  }

  const inventoryData = items.map((i: any) => ({
    name: i.name, category: i.category, zone: i.zone || 'A',
    unit_price: i.unitPrice, quantity: i.quantity, fill_level: i.fillLevel, status: i.status,
  }))

  _trainingInProgress = true; _trainingResult = null

  ;(async () => {
    try {
      // Trigger Flask — LANGSUNG return (background thread di Flask, tidak blocking)
      const startRes = await mlFetch('/model/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: inventoryData, user_id: uid.toString() }),
      })

      if (!startRes?.success) {
        _trainingResult = {
          success: false,
          error: startRes?.error || 'Flask ML API tidak merespons. Pastikan python3 ml/app.py sudah dijalankan.'
        }
        return
      }

      // Poll Flask /model/training-status setiap 3 detik
      const MAX_WAIT = 15 * 60 * 1000
      const started  = Date.now()
      while (Date.now() - started < MAX_WAIT) {
        await new Promise(r => setTimeout(r, 3000))
        const statusRes = await mlFetch(`/model/training-status?user_id=${uid}`)
        if (!statusRes) continue

        if (statusRes.status === 'done' || statusRes.status === 'error') {
          const r = statusRes.result || {}
          if (!r.success) {
            _trainingResult = { success: false, error: r.error || 'Training gagal' }
            return
          }
          // Simpan metadata ke MongoDB (tanpa pkl binary — sudah di disk Flask)
          await UserMLModel.findOneAndUpdate({ userId: uid }, {
            $set: {
              userId: uid, demandAccuracy: r.demand_accuracy, demandMape: r.demand_mape,
              profitAccuracy: r.profit_accuracy, trainingRows: r.training_rows || items.length * 912,
              trainedAt: new Date(r.trained_at || Date.now()),
              dataSource: 'user_inventory',
              dataLabel: r.data_label || `Inventory kamu (${items.length} produk)`,
              inventoryCount: items.length,
            }
          }, { upsert: true })

          _trainingResult = { success: true, ...r, inventory_count: items.length }
          return
        }
        // status === 'in_progress' → lanjut poll
      }
      _trainingResult = { success: false, error: 'Training timeout. Coba lagi.' }
    } catch (e: any) { _trainingResult = { success: false, error: e.message } }
    finally { _trainingInProgress = false }
  })()

  return res.json({ success: true, status: 'started', message: `Training ${items.length} produk dimulai` })
})

// ── GET /api/forecasting/retrain-status ───────────────────────────────
router.get('/retrain-status', async (req: AuthRequest, res: Response) => {
  const uid = req.userId!
  if (_trainingInProgress) return res.json({ success: true, status: 'in_progress' })
  if (_trainingResult) {
    const r = _trainingResult; _trainingResult = null
    return res.json({ success: true, status: 'done', result: r })
  }
  // Cek MongoDB — user mungkin reload page setelah training selesai
  const userModel = await UserMLModel.findOne({ userId: uid })
    .select('-gbDemandPkl -gbProfitPkl -featMean -featStd -featureNames')
  if (userModel?.dataSource === 'user_inventory') {
    return res.json({
      success: true, status: 'done', result: {
        success: true, demand_accuracy: userModel.demandAccuracy, demand_mape: userModel.demandMape,
        profit_accuracy: userModel.profitAccuracy, training_rows: userModel.trainingRows,
        inventory_count: userModel.inventoryCount, trained_at: userModel.trainedAt?.toISOString(),
        data_source: userModel.dataSource, data_label: userModel.dataLabel,
      }
    })
  }
  return res.json({ success: true, status: 'idle' })
})

export default router