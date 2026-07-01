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
import { handleIoTMessage } from './services/iotService'

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

// Health check — expose di /health (direct backend) DAN /api/health (lewat Vite proxy)
// Frontend pakai api.get('/health') → Vite proxy forward ke /api/health → backend ini
const healthHandler = (_req: any, res: any) => res.json({
  status: 'ok',
  db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  timestamp: new Date().toISOString(),
})
app.get('/health', healthHandler)
app.get('/api/health', healthHandler)   // ← ini yang diperlukan frontend

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message)
  res.status(500).json({ success: false, error: err.message })
})

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_inventory'
  try {
    await mongoose.connect(uri)
    console.log('[DB] MongoDB connected ✅')
    // Auto-migrate: drop index rfid_1 global jika masih ada (bug lama)
    await autoMigrateRfidIndex()
  } catch (err: any) {
    console.warn('[DB] MongoDB not available — some features require database')
  }
}

async function autoMigrateRfidIndex() {
  // Index rfid_1 (global unique tanpa userId) bikin user berbeda tidak bisa
  // punya produk dengan RFID sama. Seharusnya unik HANYA per user {userId+rfid}.
  // Script migrate-rfid-index.ts ada tapi perlu run manual — ini versi auto.
  try {
    const col = mongoose.connection.db?.collection('inventoryitems')
    if (!col) return
    const indexes = await col.indexes()
    const staleGlobal = indexes.filter((idx: any) =>
      idx.key && idx.key.rfid !== undefined && !idx.key.userId && idx.name !== '_id_'
    )
    for (const idx of staleGlobal) {
      await col.dropIndex(idx.name as string)
      console.log(`[DB] Auto-migrated: dropped global index '${idx.name}' (was blocking cross-user duplicate RFID) ✅`)
    }
    // Pastikan compound index {userId, rfid} ada
    const hasCompound = indexes.some((idx: any) => idx.key?.userId === 1 && idx.key?.rfid === 1)
    if (!hasCompound) {
      await col.createIndex({ userId: 1, rfid: 1 }, { unique: true, name: 'userId_1_rfid_1' })
      console.log('[DB] Auto-migrated: created compound index {userId, rfid} ✅')
    }
  } catch (e: any) {
    console.warn('[DB] Auto-migration skipped (non-critical):', e.message)
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
    client.on('connect', () => {
      console.log('[MQTT] Connected ✅')
      client.subscribe('smart-inventory/#')
    })
    // Sebelumnya gak ada listener 'message' sama sekali — handleIoTMessage()
    // di iotService.ts gak akan pernah kepanggil walau broker beneran nyala.
    client.on('message', (topic: string, payload: Buffer) => {
      try {
        const data = JSON.parse(payload.toString())
        handleIoTMessage(topic, data).catch((e: Error) => console.error('[MQTT] handler error', e.message))
      } catch {
        console.warn('[MQTT] Ignored non-JSON payload on', topic)
      }
    })
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
