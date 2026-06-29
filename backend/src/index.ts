import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

import authRoutes from './routes/auth'
import inventoryRoutes from './routes/inventory'
import dashboardRoutes from './routes/dashboard'
import forecastingRoutes from './routes/forecasting'
import wasteRoutes from './routes/waste'
import replenishmentRoutes from './routes/replenishment'
import supplierRoutes from './routes/suppliers'
import analyticsRoutes from './routes/analytics'
import notificationRoutes from './routes/notifications'
import { requireAuth } from './middleware/auth'
import iotRoutes from './routes/iot'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'))

app.use('/api/auth', authRoutes)
app.use('/api/dashboard', requireAuth, dashboardRoutes)
app.use('/api/inventory', requireAuth, inventoryRoutes)
app.use('/api/forecasting', requireAuth, forecastingRoutes)
app.use('/api/waste', requireAuth, wasteRoutes)
app.use('/api/replenishment', requireAuth, replenishmentRoutes)
app.use('/api/suppliers', requireAuth, supplierRoutes)
app.use('/api/analytics', requireAuth, analyticsRoutes)
app.use('/api/notifications', requireAuth, notificationRoutes)
app.use('/api/iot', requireAuth, iotRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', timestamp: new Date().toISOString() }))

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message)
  res.status(500).json({ success: false, error: err.message })
})

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_inventory'
  try {
    await mongoose.connect(uri)
    console.log('[DB] MongoDB connected ✅')
  } catch (err: any) {
    console.warn('[DB] MongoDB not available — some features require database')
    console.warn('[DB] Run: brew install mongodb-community && brew services start mongodb-community')
    console.warn('[DB] Then seed: npm run seed')
  }
}

function connectMQTT() {
  const broker = process.env.MQTT_BROKER || ''
  if (!broker || broker.includes('your-hivemq-host')) {
    console.warn('[MQTT] No broker configured — skipping (optional)')
    return
  }
  try {
    const mqtt = require('mqtt')
    const client = mqtt.connect(broker, {
      clientId: `siwr-${Date.now()}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 5000,
    })
    client.on('connect', () => { console.log('[MQTT] Connected ✅'); client.subscribe('smart-inventory/#') })
    client.on('error', (e: Error) => console.error('[MQTT]', e.message))
  } catch { console.warn('[MQTT] Failed to connect') }
}

async function start() {
  await connectDB()
  connectMQTT()
  app.listen(PORT, () => {
    console.log(`\n[Server] Running on http://localhost:${PORT} ✅`)
    console.log('[Server] Login: admin@smartinventory.com / admin123')
    console.log('[Server] Run "npm run seed" to populate MongoDB with dummy data\n')
  })
}

start()
