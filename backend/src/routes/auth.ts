import { Router, Request, Response } from 'express'
import { User } from '../models'
import { generateToken, requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, institution } = req.body
    if (!name || !email || !password) {
      res.status(400).json({ success: false, error: 'Name, email and password are required' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
      return
    }
    const exists = await User.findOne({ email: email.toLowerCase() })
    if (exists) {
      res.status(409).json({ success: false, error: 'Email already registered' })
      return
    }
    const user = await User.create({ name, email, password, role: role || 'Staff', institution: institution || '', isAdmin: false })
    const token = generateToken(user._id.toString(), user.isAdmin)
    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, institution: user.institution, initials: user.initials, isAdmin: user.isAdmin }
      }
    })
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ success: false, error: 'Email already registered' })
    } else {
      res.status(500).json({ success: false, error: 'Registration failed. Please try again.' })
    }
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' })
      return
    }
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password' })
      return
    }
    const valid = await user.comparePassword(password)
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid email or password' })
      return
    }
    const token = generateToken(user._id.toString(), user.isAdmin)
    res.json({
      success: true,
      data: {
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, institution: user.institution, initials: user.initials, isAdmin: user.isAdmin }
      }
    })
  } catch {
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' })
  }
})

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' })
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select('-password')
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }
    res.json({ success: true, data: user })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch user' })
  }
})

export default router
