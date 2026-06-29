import { Router, Request, Response } from 'express'
import { WasteItem, Notification } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/items', async (req: AuthRequest, res: Response) => {
  try {
    const items = await WasteItem.find({ userId: req.userId, status: 'pending' }).sort({ daysUntilExpiry: 1 })
    res.json({ success: true, data: items })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch waste items' })
  }
})

router.post('/:id/action', async (req: AuthRequest, res: Response) => {
  try {
    const { action, detail } = req.body
    const item = await WasteItem.findOne({ _id: req.params.id, userId: req.userId })
    if (!item) { res.status(404).json({ success: false, error: 'Waste item not found' }); return }
    item.status = 'actioned'
    await item.save()
    await Notification.create({
      userId: req.userId,
      type: 'success',
      title: 'Waste Action Applied',
      message: `${item.itemName}: ${action}${detail ? ' — ' + detail : ''} applied successfully`,
      actionRoute: '/waste-prevention',
    })
    res.json({ success: true, data: item, message: 'Action applied successfully' })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to apply action' })
  }
})

export default router
