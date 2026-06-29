import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'smart_inventory_secret_2026'

export interface AuthRequest extends Request {
  userId?: string
  isAdmin?: boolean
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    res.status(401).json({ success: false, error: 'No token — please login' })
    return
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; isAdmin: boolean }
    req.userId = decoded.userId
    req.isAdmin = decoded.isAdmin
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token — please login' })
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    res.status(403).json({ success: false, error: 'Admin access required' })
    return
  }
  next()
}

export function generateToken(userId: string, isAdmin: boolean): string {
  return jwt.sign({ userId, isAdmin }, JWT_SECRET, { expiresIn: '7d' })
}
