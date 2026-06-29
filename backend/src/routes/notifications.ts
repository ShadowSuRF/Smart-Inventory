import { Router, Response } from 'express'
import { Notification } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const notifs = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50)
    res.json({ success: true, data: notifs })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' })
  }
})

router.put('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await Notification.updateMany({ userId: req.userId }, { read: true })
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read' })
  }
})

router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { read: true }, { new: true }
    )
    if (!notif) { res.status(404).json({ success: false, error: 'Notification not found' }); return }
    res.json({ success: true, data: notif })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update notification' })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.userId })
    res.json({ success: true, message: 'Notification deleted' })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete notification' })
  }
})

export default router
