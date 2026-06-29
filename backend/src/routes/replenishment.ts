import { Router, Response } from 'express'
import { ReplenishmentOrder, InventoryItem, Notification } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/suggestions', async (req: AuthRequest, res: Response) => {
  try {
    const orders = await ReplenishmentOrder.find({ userId: req.userId, status: 'pending' }).sort({ priority: 1 })
    if (orders.length) return res.json({ success: true, data: orders })

    const critItems = await InventoryItem.find({ userId: req.userId, status: { $in: ['critical','low_stock'] } }).limit(8)
    const suggestions = critItems.map(i => ({
      _id: i._id, itemId: i._id, itemName: i.name,
      supplierId: i.supplierId, supplierName: 'FreshDirect Suppliers',
      currentStock: i.quantity, reorderPoint: Math.round(i.quantity * 1.5),
      suggestedQuantity: Math.round(i.quantity * 3),
      priority: i.status === 'critical' ? 'high' : 'medium',
      stockoutDays: i.status === 'critical' ? 3 : 6,
      totalCost: Math.round(i.quantity * 3 * i.unitPrice),
      unitPrice: i.unitPrice, status: 'pending',
    }))
    res.json({ success: true, data: suggestions })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch suggestions' })
  }
})

router.post('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const order = new ReplenishmentOrder({ ...req.body, userId: req.userId })
    await order.save()
    await Notification.create({
      userId: req.userId, type: 'success',
      title: 'Order Created',
      message: `Replenishment order for ${order.itemName} placed — qty: ${order.quantity}`,
      actionRoute: '/replenishment', actionLabel: 'View Orders',
    })
    res.status(201).json({ success: true, data: order })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to create order' })
  }
})

router.post('/orders/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { itemIds } = req.body as { itemIds: string[] }
    const created = []
    for (const id of (itemIds || [])) {
      const item = await InventoryItem.findOne({ _id: id, userId: req.userId })
      if (!item) continue
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

router.put('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const order = await ReplenishmentOrder.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body, { new: true }
    )
    if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return }
    res.json({ success: true, data: order })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update order' })
  }
})

export default router
