import { Router, Response } from 'express'
import { Supplier } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const suppliers = await Supplier.find({ userId: req.userId }).sort({ name: 1 })
    res.json({ success: true, data: suppliers })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch suppliers' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const supplier = new Supplier({ ...req.body, userId: req.userId })
    await supplier.save()
    res.status(201).json({ success: true, data: supplier })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to create supplier' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const supplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body, { new: true }
    )
    if (!supplier) { res.status(404).json({ success: false, error: 'Supplier not found' }); return }
    res.json({ success: true, data: supplier })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update supplier' })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const s = await Supplier.findOneAndDelete({ _id: req.params.id, userId: req.userId })
    if (!s) { res.status(404).json({ success: false, error: 'Supplier not found' }); return }
    res.json({ success: true, message: 'Supplier deleted' })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete supplier' })
  }
})

export default router
