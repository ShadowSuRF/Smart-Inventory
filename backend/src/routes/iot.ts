import { Router, Response } from 'express'
import { IoTSensorState, InventoryItem, Notification } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

const SENSOR_CONFIGS = [
  { sensorId: 'SEN-A001', zone: 'A', name: 'Fresh Produce Zone A - Sensor 1', type: 'weight+temp' },
  { sensorId: 'SEN-A002', zone: 'A', name: 'Fresh Produce Zone A - Sensor 2', type: 'rfid+humidity' },
  { sensorId: 'SEN-A003', zone: 'A', name: 'Fresh Produce Zone A - Sensor 3', type: 'weight+rfid' },
  { sensorId: 'SEN-B001', zone: 'B', name: 'Dairy Zone B - Sensor 1', type: 'weight+temp' },
  { sensorId: 'SEN-B002', zone: 'B', name: 'Dairy Zone B - Sensor 2', type: 'temp+humidity' },
  { sensorId: 'SEN-B003', zone: 'B', name: 'Dairy Zone B - Sensor 3', type: 'rfid+weight' },
  { sensorId: 'SEN-C001', zone: 'C', name: 'Beverages Zone C - Sensor 1', type: 'weight+rfid' },
  { sensorId: 'SEN-C002', zone: 'C', name: 'Beverages Zone C - Sensor 2', type: 'temp+humidity' },
  { sensorId: 'SEN-D001', zone: 'D', name: 'Frozen Zone D - Sensor 1', type: 'temp+weight' },
  { sensorId: 'SEN-D002', zone: 'D', name: 'Frozen Zone D - Sensor 2', type: 'humidity+rfid' },
  { sensorId: 'SEN-E001', zone: 'E', name: 'Bakery Zone E - Sensor 1', type: 'weight+rfid' },
  { sensorId: 'SEN-E002', zone: 'E', name: 'Bakery Zone E - Sensor 2', type: 'temp+humidity' },
  { sensorId: 'SEN-F001', zone: 'F', name: 'Snacks Zone F - Sensor 1', type: 'weight+rfid' },
  { sensorId: 'SEN-G001', zone: 'G', name: 'Prepared Foods Zone G - Sensor 1', type: 'temp+weight' },
]

const ZONE_OPTIMAL: Record<string, { tempMin: number; tempMax: number; humMin: number; humMax: number }> = {
  A: { tempMin: 2,   tempMax: 8,   humMin: 85, humMax: 95 },
  B: { tempMin: 2,   tempMax: 6,   humMin: 70, humMax: 85 },
  C: { tempMin: 15,  tempMax: 22,  humMin: 40, humMax: 60 },
  D: { tempMin: -20, tempMax: -15, humMin: 30, humMax: 50 },
  E: { tempMin: 18,  tempMax: 24,  humMin: 50, humMax: 65 },
  F: { tempMin: 18,  tempMax: 25,  humMin: 40, humMax: 60 },
  G: { tempMin: 4,   tempMax: 8,   humMin: 65, humMax: 80 },
}

function genReading(zone: string, anomaly = false) {
  const opt = ZONE_OPTIMAL[zone] || ZONE_OPTIMAL['C']
  const baseTemp = (opt.tempMin + opt.tempMax) / 2
  const baseHum  = (opt.humMin  + opt.humMax)  / 2
  if (anomaly) {
    const drift = (Math.random() > 0.5 ? 1 : -1) * (Math.abs(opt.tempMax - opt.tempMin) * 0.8 + Math.random() * 3)
    return {
      temperature: parseFloat((baseTemp + drift).toFixed(1)),
      humidity:    parseFloat((baseHum + (Math.random() > 0.5 ? 15 : -15)).toFixed(1)),
      weight:      parseFloat((Math.random() * 50 + 5).toFixed(2)),
    }
  }
  return {
    temperature: parseFloat((baseTemp + (Math.random() - 0.5) * (opt.tempMax - opt.tempMin) * 0.4).toFixed(1)),
    humidity:    parseFloat((baseHum  + (Math.random() - 0.5) * 10).toFixed(1)),
    weight:      parseFloat((Math.random() * 60 + 10).toFixed(2)),
  }
}

// ── GET /api/iot/sensors — sensor state milik user yang login ─────────
router.get('/sensors', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!
    // Ambil state tersimpan milik user ini
    const saved = await IoTSensorState.find({ userId: uid })
    const savedMap: Record<string, any> = {}
    saved.forEach(s => { savedMap[s.sensorId] = s })

    const sensors = SENSOR_CONFIGS.map(cfg => {
      const existing = savedMap[cfg.sensorId]
      // Kalau belum pernah simulate, generate fresh reading
      const reading = existing
        ? { temperature: existing.temperature, humidity: existing.humidity, weight: existing.weight }
        : genReading(cfg.zone)
      const opt = ZONE_OPTIMAL[cfg.zone] || ZONE_OPTIMAL['C']
      const tempOk = reading.temperature >= opt.tempMin && reading.temperature <= opt.tempMax
      const humOk  = reading.humidity    >= opt.humMin  && reading.humidity    <= opt.humMax
      return {
        sensorId:     cfg.sensorId,
        name:         cfg.name,
        zone:         cfg.zone,
        type:         cfg.type,
        temperature:  reading.temperature,
        humidity:     reading.humidity,
        weight:       reading.weight,
        batteryLevel: existing?.batteryLevel ?? Math.round(70 + Math.random() * 30),
        status:       existing?.status ?? ((!tempOk || !humOk) ? 'warning' : 'online'),
        lastSeen:     existing?.lastSeen ?? new Date(),
        optimal:      { tempMin: opt.tempMin, tempMax: opt.tempMax, humMin: opt.humMin, humMax: opt.humMax },
        alerts: [
          ...(!tempOk ? [`Temperature ${reading.temperature}°C outside range (${opt.tempMin}–${opt.tempMax}°C)`] : []),
          ...(!humOk  ? [`Humidity ${reading.humidity}% outside range (${opt.humMin}–${opt.humMax}%)`] : []),
        ],
      }
    })
    res.json({ success: true, data: sensors, count: sensors.length })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST /api/iot/simulate — simulate tick, simpan ke userId ──────────
router.post('/simulate', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!
    const results: any[] = []

    for (const cfg of SENSOR_CONFIGS) {
      const isAnomaly = Math.random() < 0.15
      const reading   = genReading(cfg.zone, isAnomaly)
      const opt       = ZONE_OPTIMAL[cfg.zone] || ZONE_OPTIMAL['C']
      const tempOk    = reading.temperature >= opt.tempMin && reading.temperature <= opt.tempMax
      const humOk     = reading.humidity    >= opt.humMin  && reading.humidity    <= opt.humMax
      const battery   = Math.round(60 + Math.random() * 40)

      // Upsert sensor state — per userId + sensorId
      await IoTSensorState.findOneAndUpdate(
        { userId: uid, sensorId: cfg.sensorId },
        {
          userId: uid, zone: cfg.zone, name: cfg.name, type: cfg.type,
          temperature: reading.temperature, humidity: reading.humidity,
          weight: reading.weight, batteryLevel: battery,
          status: (!tempOk || !humOk) ? 'warning' : 'online',
          lastSeen: new Date(),
        },
        { upsert: true, new: true }
      )

      // Update inventory items milik user ini di zone ini
      if (isAnomaly) {
        const zoneItems = await InventoryItem.find({ userId: uid, zone: cfg.zone }).limit(3)
        for (const item of zoneItems) {
          const drop = Math.round(Math.random() * 12)
          item.fillLevel = Math.max(0, item.fillLevel - drop)
          item.weight    = reading.weight
          await item.save()
        }
      }

      // Notifikasi hanya untuk user yang login
      if (!tempOk) {
        await Notification.create({
          userId: uid,
          type:    reading.temperature > opt.tempMax + 5 ? 'critical' : 'warning',
          title:   'Temperature Alert',
          message: `Sensor ${cfg.sensorId} (Zone ${cfg.zone}): ${reading.temperature}°C — range ${opt.tempMin}–${opt.tempMax}°C`,
          actionRoute: '/iot', actionLabel: 'View Sensors',
        })
      }
      if (battery < 20) {
        await Notification.create({
          userId: uid, type: 'warning',
          title:   'Low Battery Alert',
          message: `Sensor ${cfg.sensorId} battery ${battery}%. Schedule maintenance.`,
          actionRoute: '/iot', actionLabel: 'View Sensors',
        })
      }

      results.push({ sensorId: cfg.sensorId, zone: cfg.zone, anomaly: isAnomaly, ...reading, battery, tempOk, humOk })
    }

    res.json({
      success: true, data: results,
      summary: { total: results.length, anomalies: results.filter(r => r.anomaly).length, warnings: results.filter(r => !r.tempOk || !r.humOk).length, timestamp: new Date().toISOString() },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/iot/history — 24h per user ──────────────────────────────
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    // Seed history dengan sedikit variasi per userId supaya beda antar user
    const uid = req.userId!
    const seed = uid.toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rng  = (i: number) => ((Math.sin(seed * 9.7 + i * 3.1) + 1) / 2)

    const hours = Array.from({ length: 24 }, (_, i) => {
      const h = new Date()
      h.setHours(h.getHours() - (23 - i), 0, 0, 0)
      const anomaly = rng(i * 7) < 0.08
      return {
        time: h.toISOString().slice(11, 16),
        timestamp: h.toISOString(),
        zoneA_temp:  parseFloat((4 + (rng(i)     - 0.5) * 2 + (anomaly ? 4 : 0)).toFixed(1)),
        zoneB_temp:  parseFloat((4 + (rng(i + 1) - 0.5) * 1.5).toFixed(1)),
        zoneD_temp:  parseFloat((-17 + (rng(i + 2) - 0.5) * 2).toFixed(1)),
        avgHumidity: Math.round(60 + rng(i + 3) * 20),
        anomaly, activeAlerts: anomaly ? Math.floor(rng(i + 4) * 3) + 1 : 0,
      }
    })
    res.json({ success: true, data: hours })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/iot/stats — stats sensor milik user ─────────────────────
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const uid    = req.userId!
    const sensors = await IoTSensorState.find({ userId: uid })
    const online  = sensors.filter(s => s.status === 'online').length
    const warning = sensors.filter(s => s.status === 'warning').length
    const avgBat  = sensors.length > 0
      ? Math.round(sensors.reduce((s, l) => s + l.batteryLevel, 0) / sensors.length)
      : 85

    res.json({
      success: true,
      data: {
        totalSensors:    SENSOR_CONFIGS.length,
        online:          sensors.length > 0 ? online  : SENSOR_CONFIGS.length - 2,
        warning:         sensors.length > 0 ? warning : 2,
        offline:         0, avgBattery: avgBat, uptime: 98.5,
        updatesPerMin:   12420, avgResponseMs: 2400, zonesMonitored: 7,
        lastSimulation:  sensors[0]?.lastSeen ?? null,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
