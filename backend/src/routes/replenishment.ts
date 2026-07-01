import { Router, Response } from 'express'
import { ReplenishmentOrder, InventoryItem, Notification } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

// ── GET /suggestions ──────────────────────────────────────────────────
// Logic baru: tampilkan item critical/low_stock yang BELUM punya order aktif
// (pending/ordered). Kalau item sudah punya order pending/ordered, jangan
// masukkan lagi ke suggestions — inilah yang bikin item "balik lagi" setelah diorder.
router.get('/suggestions', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!

    // Ambil semua pending/ordered orders milik user
    const activeOrders = await ReplenishmentOrder.find({
      userId: uid, status: { $in: ['pending', 'ordered'] }
    })
    const orderedItemIds = new Set(activeOrders.map(o => o.itemId?.toString()).filter(Boolean))

    // Item critical/low_stock yang BELUM ada order aktif-nya
    const critItems = await InventoryItem.find({
      userId: uid, status: { $in: ['critical', 'low_stock'] }
    })
    const unorderedItems = critItems.filter(i => !orderedItemIds.has(i._id.toString()))

    const suggestions = unorderedItems.map(i => ({
      _id:              i._id,
      itemId:           i._id,
      itemName:         i.name,
      supplierId:       i.supplierId,
      supplierName:     'FreshDirect Suppliers',
      currentStock:     i.quantity,
      reorderPoint:     Math.round(i.quantity * 1.5),
      suggestedQuantity:Math.round(i.quantity * 3),
      priority:         i.status === 'critical' ? 'high' : 'medium',
      stockoutDays:     i.status === 'critical' ? 3 : 7,
      totalCost:        Math.round(i.quantity * 3 * i.unitPrice),
      unitPrice:        i.unitPrice,
      status:           'pending',
      category:         i.category,
      zone:             i.zone,
    }))

    // Kalau ada pending orders, tampilkan juga (biar user bisa lihat status)
    const pendingOrders = activeOrders.filter(o => o.status === 'pending')

    res.json({ success: true, data: [...suggestions, ...pendingOrders] })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch suggestions' })
  }
})

// ── GET /orders — semua order milik user (termasuk completed/cancelled) ─
router.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query as { status?: string }
    const filter: any = { userId: req.userId }
    if (status) filter.status = status
    const orders = await ReplenishmentOrder.find(filter).sort({ createdAt: -1 }).limit(50)
    res.json({ success: true, data: orders })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' })
  }
})

// ── POST /orders ───────────────────────────────────────────────────────
router.post('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const order = new ReplenishmentOrder({ ...req.body, userId: req.userId })
    await order.save()
    await Notification.create({
      userId: req.userId, type: 'success',
      title:   'Order Created',
      message: `Replenishment order untuk ${order.itemName} dibuat — qty: ${order.quantity || order.suggestedQuantity}`,
      actionRoute: '/replenishment', actionLabel: 'Lihat Orders',
    })
    res.status(201).json({ success: true, data: order })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to create order' })
  }
})

// ── POST /orders/bulk ─────────────────────────────────────────────────
router.post('/orders/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { itemIds } = req.body as { itemIds: string[] }
    const created = []
    for (const id of (itemIds || [])) {
      const item = await InventoryItem.findOne({ _id: id, userId: req.userId })
      if (!item) continue
      // Cek apakah sudah ada order aktif untuk item ini
      const existing = await ReplenishmentOrder.findOne({ itemId: item._id, userId: req.userId, status: { $in: ['pending','ordered'] } })
      if (existing) continue
      const order = await ReplenishmentOrder.create({
        userId: req.userId,
        itemId: item._id, itemName: item.name,
        supplierId: item.supplierId, supplierName: 'Auto-assigned',
        quantity: Math.round(item.quantity * 3), unitPrice: item.unitPrice,
        totalCost: Math.round(item.quantity * 3 * item.unitPrice),
        priority: 'high', status: 'pending',
        currentStock: item.quantity, suggestedQuantity: Math.round(item.quantity * 3),
      })
      created.push(order)
    }
    res.json({ success: true, data: created, count: created.length })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create bulk orders' })
  }
})

// ── PUT /orders/:id — update status order (pending→ordered→completed/cancelled) ─
router.put('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const order = await ReplenishmentOrder.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    )
    if (!order) { res.status(404).json({ success: false, error: 'Order tidak ditemukan' }); return }

    // Kalau order di-complete (received), naikkan stok inventory item-nya
    if (req.body.status === 'completed' && order.itemId) {
      const qty = order.quantity || order.suggestedQuantity || 0
      if (qty > 0) {
        const item = await InventoryItem.findOne({ _id: order.itemId, userId: req.userId })
        if (item) {
          item.quantity += qty
          item.weight = Math.max(0, item.weight || 0) + qty * 0.5
          await item.save()
          await Notification.create({
            userId: req.userId, type: 'success',
            title: 'Stok Diperbarui',
            message: `${item.name}: +${qty} unit diterima. Stok sekarang: ${item.quantity}`,
            actionRoute: '/inventory', actionLabel: 'Lihat Inventory',
          })
        }
      }
    }

    res.json({ success: true, data: order })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update order' })
  }
})

// ── DELETE /orders/:id ────────────────────────────────────────────────
router.delete('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const order = await ReplenishmentOrder.findOneAndDelete({ _id: req.params.id, userId: req.userId })
    if (!order) { res.status(404).json({ success: false, error: 'Order tidak ditemukan' }); return }
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete order' })
  }
})

export default router
