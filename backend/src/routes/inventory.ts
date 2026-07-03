import { Router, Response } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { InventoryItem, ImportLog } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

const VALID_CATS = ['Fresh Produce','Dairy','Beverages','Frozen','Bakery','Snacks','Prepared Foods']
const VALID_CATS_LOWER = VALID_CATS.map(c => c.toLowerCase())

function normalizeCategory(raw: string): string {
  if (!raw) return 'Fresh Produce'
  const lower = raw.trim().toLowerCase()
  const idx   = VALID_CATS_LOWER.indexOf(lower)
  if (idx >= 0) return VALID_CATS[idx]
  // Fuzzy match
  if (lower.includes('dairy') || lower.includes('milk'))   return 'Dairy'
  if (lower.includes('bever') || lower.includes('drink'))  return 'Beverages'
  if (lower.includes('frozen') || lower.includes('ice'))   return 'Frozen'
  if (lower.includes('bake') || lower.includes('bread'))   return 'Bakery'
  if (lower.includes('snack') || lower.includes('chip'))   return 'Snacks'
  if (lower.includes('prepar') || lower.includes('deli'))  return 'Prepared Foods'
  return 'Fresh Produce'
}

// GET /api/inventory
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, category, zone, search } = req.query as Record<string, string>
    const filter: Record<string, any> = { userId: req.userId }
    if (status)   filter.status   = status
    if (category) filter.category = category
    if (zone)     filter.zone     = zone
    if (search)   filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { rfid: { $regex: search, $options: 'i' } },
    ]
    const items = await InventoryItem.find(filter).sort({ updatedAt: -1 })
    res.json({ success: true, data: items, count: items.length })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch inventory' })
  }
})

router.get('/import/logs', async (req: AuthRequest, res: Response) => {
  try {
    const logs = await ImportLog.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(20)
    res.json({ success: true, data: logs })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch logs' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await InventoryItem.findOne({ _id: req.params.id, userId: req.userId })
    if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return }
    res.json({ success: true, data: item })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch item' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const item = new InventoryItem({ ...req.body, userId: req.userId })
    await item.save()
    res.status(201).json({ success: true, data: item })
  } catch (err: any) {
    if (err.code === 11000) res.status(409).json({ success: false, error: 'RFID sudah ada di inventorymu' })
    else res.status(400).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body, { new: true, runValidators: true }
    )
    if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return }
    res.json({ success: true, data: item })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await InventoryItem.findOneAndDelete({ _id: req.params.id, userId: req.userId })
    if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return }
    res.json({ success: true, message: 'Deleted' })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete' })
  }
})

// ── POST /api/inventory/import ────────────────────────────────────────
router.post('/import', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const filename = req.file?.originalname || 'upload'
  let imported = 0, skipped = 0
  const errors: string[] = []

  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Tidak ada file yang diupload' })
      return
    }

    // Parse file — support xlsx, xls, csv
    let rows: any[] = []
    try {
      const wb  = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true, raw: false })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    } catch (parseErr) {
      res.status(400).json({ success: false, error: 'Gagal baca file — pastikan format Excel/CSV valid' })
      return
    }

    if (!rows.length) {
      res.status(400).json({ success: false, error: 'File kosong' })
      return
    }

    // Generate session ID unik untuk sesi import ini (untuk fitur undo)
    const sessionId = `import_${Date.now()}_${Math.random().toString(36).slice(2,8)}`

    // Deduplikasi: kalau banyak baris per RFID (misal CSV harian),
    // ambil baris terakhir per SKU supaya data paling fresh
    const deduped: Map<string, any> = new Map()
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row   = rows[rowIdx]
      const rawId = String(row['SKU_Code'] || row['RFID_Tag'] || row['rfid'] || row['SKU'] || '').trim()
      const key   = rawId || `__auto__${rowIdx}`
      deduped.set(key, { ...row, __origIdx: rowIdx }) // last-write-wins
    }
    const uniqueRows = Array.from(deduped.values())
    console.log("[Import] " + rows.length + " rows -> " + uniqueRows.length + " unique items")

    // Process tiap baris unik
    for (let rowIdx = 0; rowIdx < uniqueRows.length; rowIdx++) {
      const row = uniqueRows[rowIdx]
      try {
        // RFID/SKU — buat unik kalau tidak ada
        const rawRfid = String(
          row['SKU_Code'] || row['RFID_Tag'] || row['rfid'] || row['SKU'] || row['sku'] || ''
        ).trim()
        const rfid = rawRfid || `IMP-${req.userId!.toString().slice(-4)}-${Date.now()}-${rowIdx}`

        // Name
        const name = String(
          row['Product_Name'] || row['name'] || row['Name'] || row['item'] || `Item ${rowIdx + 1}`
        ).trim() || `Item ${rowIdx + 1}`

        // Category — normalize
        const category = normalizeCategory(String(row['Category'] || row['category'] || ''))

        // Zone — ambil huruf pertama, default A
        const zoneRaw = String(row['Zone'] || row['zone'] || row['Location_ID'] || 'A').trim()
        const zone    = zoneRaw.match(/^[A-Ga-g]/i) ? zoneRaw[0].toUpperCase() : 'A'
        const shelf   = String(row['Shelf'] || row['shelf'] || '1').trim() || '1'

        // Numbers — parse dengan safe fallback
        const quantity  = Math.max(0, parseFloat(String(row['Stock_Level'] || row['Quantity'] || row['quantity'] || row['Units_Sold'] || 0)) || 0)
        const unitPrice = Math.max(0, parseFloat(String(row['Unit_Price']    || row['unitPrice'] || row['price'] || row['Price'] || 0)) || 0)
        const fillLevel = Math.min(100, Math.max(0, parseFloat(String(row['Fill_Level_Pct'] || row['fillLevel'] || row['fill'] || 80)) || 80))
        const weight    = Math.max(0, parseFloat(String(row['weight'] || row['Weight'] || 0)) || 0)
        const unit      = String(row['unit'] || row['Unit'] || 'pcs').trim() || 'pcs'

        // Expiry date
        let expiryDate: Date
        const rawExp = row['Expiry_Date'] || row['expiry_date'] || row['ExpiryDate'] || row['expiry'] || ''
        if (rawExp instanceof Date && !isNaN(rawExp.getTime())) {
          expiryDate = rawExp
        } else if (rawExp) {
          const parsed = new Date(String(rawExp).trim())
          expiryDate   = !isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + 30 * 86400000)
        } else {
          expiryDate = new Date(Date.now() + 30 * 86400000)
        }

        const supplierId = String(row['Supplier_Code'] || row['supplierId'] || row['Supplier'] || '').trim()

        // Upsert: sama userId + rfid → update, baru → insert
        // importSession disimpan untuk fitur undo — bisa hapus semua item dari satu sesi import
        await InventoryItem.findOneAndUpdate(
          { userId: req.userId, rfid },
          {
            $set: {
              userId: req.userId, rfid, name, category, zone, shelf,
              quantity, unitPrice, fillLevel, weight, unit, expiryDate, supplierId,
              importSession: sessionId,  // tag sesi import untuk undo
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        imported++
      } catch (rowErr: any) {
        skipped++
        if (errors.length < 5) errors.push(`Baris ${rowIdx + 2}: ${rowErr.message || 'Error'}`)
      }
    }

    // Simpan log import ke MongoDB
    await ImportLog.create({
      userId: req.userId, filename,
      imported, skipped, total: uniqueRows.length, status: 'success',
    }).catch(() => {})

    res.json({
      success: true,
      data: { imported, skipped, total: rows.length, errors, sessionId },  // kirim sessionId ke frontend
    })
  } catch (err: any) {
    await ImportLog.create({
      userId: req.userId, filename,
      imported, skipped, total: 0, status: 'error',
    }).catch(() => {})
    res.status(500).json({ success: false, error: `Import gagal: ${err.message}` })
  }
})

// ── DELETE /api/inventory/import-session/:sessionId — batalkan/undo import ──
// Hapus semua item yang ditambahkan dari satu sesi import tertentu.
// Hanya bisa dibatalkan kalau item masih ada (belum diedit manual).
router.delete('/import-session/:sessionId', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID diperlukan' })

    const result = await InventoryItem.deleteMany({
      userId: req.userId,
      importSession: sessionId,
    })

    if (result.deletedCount === 0) {
      return res.json({ success: false, error: 'Tidak ada item yang ditemukan dari sesi import ini (mungkin sudah dihapus atau diedit)' })
    }

    res.json({
      success: true,
      deleted: result.deletedCount,
      message: `${result.deletedCount} item dari sesi import berhasil dihapus`,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
