import { Router, Response } from 'express'
import { IoTDevice, InventoryItem, Notification } from '../models'
import { AuthRequest } from '../middleware/auth'

const router = Router()

// Preset threshold suggestions per kategori — dipakai frontend buat prefill form
// "Tambah Sensor", tapi user tetep bisa override manual. Bukan lagi sumber data sensor.
export const ZONE_PRESETS: Record<string, { tempMin: number; tempMax: number; humMin: number; humMax: number }> = {
  'Fresh Produce': { tempMin: 2,   tempMax: 8,   humMin: 85, humMax: 95 },
  'Dairy':         { tempMin: 2,   tempMax: 6,   humMin: 70, humMax: 85 },
  'Beverages':     { tempMin: 15,  tempMax: 22,  humMin: 40, humMax: 60 },
  'Frozen':        { tempMin: -20, tempMax: -15, humMin: 30, humMax: 50 },
  'Bakery':        { tempMin: 18,  tempMax: 24,  humMin: 50, humMax: 65 },
  'Snacks':        { tempMin: 18,  tempMax: 25,  humMin: 40, humMax: 60 },
  'Prepared Foods':{ tempMin: 4,   tempMax: 8,   humMin: 65, humMax: 80 },
}

function genReading(d: { tempMin: number; tempMax: number; humMin: number; humMax: number }, anomaly = false) {
  const baseTemp = (d.tempMin + d.tempMax) / 2
  const baseHum  = (d.humMin  + d.humMax)  / 2
  if (anomaly) {
    const drift = (Math.random() > 0.5 ? 1 : -1) * (Math.abs(d.tempMax - d.tempMin) * 0.8 + Math.random() * 3)
    return {
      temperature: parseFloat((baseTemp + drift).toFixed(1)),
      humidity:    parseFloat((baseHum + (Math.random() > 0.5 ? 15 : -15)).toFixed(1)),
      weight:      parseFloat((Math.random() * 50 + 5).toFixed(2)),
    }
  }
  return {
    temperature: parseFloat((baseTemp + (Math.random() - 0.5) * (d.tempMax - d.tempMin) * 0.4).toFixed(1)),
    humidity:    parseFloat((baseHum  + (Math.random() - 0.5) * 10).toFixed(1)),
    weight:      parseFloat((Math.random() * 60 + 10).toFixed(2)),
  }
}

// Generate deviceId yg human-readable (mis. "SEN-GUD001") tapi unik PER USER —
// bukan dari daftar global lagi. Retry kalau ternyata bentrok.
async function makeDeviceId(uid: string, zone: string): Promise<string> {
  const code = (zone.trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || 'GEN').toUpperCase()
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await IoTDevice.countDocuments({ userId: uid })
    const seq = String(count + 1 + attempt).padStart(3, '0')
    const candidate = `SEN-${code}${seq}`
    const exists = await IoTDevice.findOne({ userId: uid, deviceId: candidate })
    if (!exists) return candidate
  }
  return `SEN-${code}${Date.now().toString().slice(-5)}`
}

function shapeDevice(d: any) {
  const tempOk = d.temperature >= d.tempMin && d.temperature <= d.tempMax
  const humOk  = d.humidity    >= d.humMin  && d.humidity    <= d.humMax
  return {
    _id: d._id, sensorId: d.deviceId, name: d.name, zone: d.zone, type: d.type,
    temperature: d.temperature, humidity: d.humidity, weight: d.weight,
    batteryLevel: d.batteryLevel, status: d.status, source: d.source, lastSeen: d.lastSeen,
    optimal: { tempMin: d.tempMin, tempMax: d.tempMax, humMin: d.humMin, humMax: d.humMax },
    alerts: [
      ...(!tempOk ? [`Temperature ${d.temperature}°C outside range (${d.tempMin}–${d.tempMax}°C)`] : []),
      ...(!humOk  ? [`Humidity ${d.humidity}% outside range (${d.humMin}–${d.humMax}%)`] : []),
    ],
  }
}

// ── Device management — INI bagian "user setup", bukan dummy lagi ─────

// GET /api/iot/devices — daftar sensor/device milik user yang login (private)
router.get('/devices', async (req: AuthRequest, res: Response) => {
  try {
    const devices = await IoTDevice.find({ userId: req.userId! }).sort({ createdAt: 1 })
    res.json({ success: true, data: devices })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/iot/devices — TAMBAH sensor baru milik user (dipanggil dari popup setup)
router.post('/devices', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!
    const { name, zone, type, tempMin, tempMax, humMin, humMax } = req.body
    if (!name?.trim() || !zone?.trim()) {
      res.status(400).json({ success: false, error: 'Nama sensor dan zone/lokasi wajib diisi' })
      return
    }
    const deviceId = await makeDeviceId(uid, zone)
    const device = await IoTDevice.create({
      userId: uid, deviceId, name: name.trim(), zone: zone.trim(), type: type || 'temp+humidity',
      tempMin: tempMin ?? 2, tempMax: tempMax ?? 8, humMin: humMin ?? 60, humMax: humMax ?? 85,
      mqttTopic: `smart-inventory/${uid}/${deviceId}`,
      temperature: ((tempMin ?? 2) + (tempMax ?? 8)) / 2,
      humidity:    ((humMin ?? 60) + (humMax ?? 85)) / 2,
      weight: 0, batteryLevel: 100, status: 'online', source: 'simulated', lastSeen: new Date(),
    })
    res.status(201).json({ success: true, data: device })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PUT /api/iot/devices/:id — edit sensor milik user (ownership dicek by userId)
router.put('/devices/:id', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!
    const { name, zone, type, tempMin, tempMax, humMin, humMax } = req.body
    const device = await IoTDevice.findOne({ _id: req.params.id, userId: uid })
    if (!device) { res.status(404).json({ success: false, error: 'Sensor tidak ditemukan' }); return }
    if (name?.trim())  device.name = name.trim()
    if (zone?.trim())  device.zone = zone.trim()
    if (type)          device.type = type
    if (tempMin !== undefined) device.tempMin = tempMin
    if (tempMax !== undefined) device.tempMax = tempMax
    if (humMin  !== undefined) device.humMin  = humMin
    if (humMax  !== undefined) device.humMax  = humMax
    await device.save()
    res.json({ success: true, data: device })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/iot/devices/:id — hapus sensor milik user
router.delete('/devices/:id', async (req: AuthRequest, res: Response) => {
  try {
    const device = await IoTDevice.findOneAndDelete({ _id: req.params.id, userId: req.userId! })
    if (!device) { res.status(404).json({ success: false, error: 'Sensor tidak ditemukan' }); return }
    res.json({ success: true, data: { deletedId: req.params.id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/iot/sensors — reading terkini, dari device MILIK user ────
router.get('/sensors', async (req: AuthRequest, res: Response) => {
  try {
    const devices = await IoTDevice.find({ userId: req.userId! }).sort({ createdAt: 1 })
    res.json({ success: true, data: devices.map(shapeDevice), count: devices.length })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST /api/iot/simulate — simulate tick utk device² MILIK user ─────
// (Kalau device beneran kirim data lewat MQTT, itu masuk via iotService.ts,
//  bukan lewat sini — endpoint ini murni buat testing tanpa hardware fisik.)
router.post('/simulate', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!
    const devices = await IoTDevice.find({ userId: uid })
    if (devices.length === 0) {
      res.json({ success: true, data: [], summary: { total: 0, anomalies: 0, warnings: 0, timestamp: new Date().toISOString() }, message: 'Belum ada sensor — tambahkan sensor dulu' })
      return
    }

    const results: any[] = []
    for (const device of devices) {
      const isAnomaly = Math.random() < 0.15
      const reading   = genReading(device, isAnomaly)
      const tempOk    = reading.temperature >= device.tempMin && reading.temperature <= device.tempMax
      const humOk     = reading.humidity    >= device.humMin  && reading.humidity    <= device.humMax
      const battery   = Math.max(0, Math.min(100, device.batteryLevel - Math.round(Math.random() * 2)))

      device.temperature = reading.temperature
      device.humidity    = reading.humidity
      device.weight       = reading.weight
      device.batteryLevel = battery
      device.status        = (!tempOk || !humOk) ? 'warning' : 'online'
      device.source         = 'simulated'
      device.lastSeen       = new Date()
      await device.save()

      // Update inventory items milik user ini di zone yg sama (kalau ada)
      if (isAnomaly) {
        const zoneItems = await InventoryItem.find({ userId: uid, zone: device.zone }).limit(3)
        for (const item of zoneItems) {
          const drop = Math.round(Math.random() * 12)
          item.fillLevel = Math.max(0, item.fillLevel - drop)
          item.weight    = reading.weight
          await item.save()
        }
      }

      if (!tempOk) {
        await Notification.create({
          userId: uid,
          type:    reading.temperature > device.tempMax + 5 ? 'critical' : 'warning',
          title:   'Temperature Alert',
          message: `Sensor ${device.deviceId} (${device.zone}): ${reading.temperature}°C — range ${device.tempMin}–${device.tempMax}°C`,
          actionRoute: '/iot', actionLabel: 'View Sensors',
        })
      }
      if (battery < 20) {
        await Notification.create({
          userId: uid, type: 'warning',
          title:   'Low Battery Alert',
          message: `Sensor ${device.deviceId} battery ${battery}%. Schedule maintenance.`,
          actionRoute: '/iot', actionLabel: 'View Sensors',
        })
      }

      results.push({ sensorId: device.deviceId, zone: device.zone, anomaly: isAnomaly, ...reading, battery, tempOk, humOk })
    }

    res.json({
      success: true, data: results,
      summary: { total: results.length, anomalies: results.filter(r => r.anomaly).length, warnings: results.filter(r => !r.tempOk || !r.humOk).length, timestamp: new Date().toISOString() },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/iot/history — 24h trend, dinamis sesuai zone MILIK user ──
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!
    const devices = await IoTDevice.find({ userId: uid })
    if (devices.length === 0) {
      res.json({ success: true, zones: [], data: [] })
      return
    }

    // Ambil maksimal 4 zone (urut dari yg paling banyak device-nya) biar chart gak penuh
    const zoneCounts: Record<string, { count: number; tempMin: number; tempMax: number; humMin: number; humMax: number }> = {}
    for (const d of devices) {
      if (!zoneCounts[d.zone]) zoneCounts[d.zone] = { count: 0, tempMin: d.tempMin, tempMax: d.tempMax, humMin: d.humMin, humMax: d.humMax }
      zoneCounts[d.zone].count++
    }
    const topZones = Object.entries(zoneCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 4)
    const colors = ['#22c55e', '#3b82f6', '#6366f1', '#f59e0b']
    const zones = topZones.map(([zone], i) => ({ zone, key: `z${i}_temp`, label: zone, color: colors[i] }))

    const seed = uid.toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rng  = (i: number) => ((Math.sin(seed * 9.7 + i * 3.1) + 1) / 2)

    const hours = Array.from({ length: 24 }, (_, i) => {
      const h = new Date()
      h.setHours(h.getHours() - (23 - i), 0, 0, 0)
      const anomaly = rng(i * 7) < 0.08
      const row: any = {
        time: h.toISOString().slice(11, 16),
        timestamp: h.toISOString(),
        avgHumidity: Math.round(60 + rng(i + 3) * 20),
        anomaly, activeAlerts: anomaly ? Math.floor(rng(i + 4) * 3) + 1 : 0,
      }
      topZones.forEach(([, info], zi) => {
        const base = (info.tempMin + info.tempMax) / 2
        const spread = Math.max(1, (info.tempMax - info.tempMin) * 0.3)
        row[`z${zi}_temp`] = parseFloat((base + (rng(i + zi * 5) - 0.5) * spread * 2 + (anomaly ? spread : 0)).toFixed(1))
      })
      return row
    })
    res.json({ success: true, zones, data: hours })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/iot/stats — dihitung beneran dari device milik user ──────
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const devices  = await IoTDevice.find({ userId: req.userId! })
    const total    = devices.length
    const online   = devices.filter(d => d.status === 'online').length
    const warning  = devices.filter(d => d.status === 'warning').length
    const offline  = devices.filter(d => d.status === 'offline').length
    const avgBat   = total > 0 ? Math.round(devices.reduce((s, d) => s + d.batteryLevel, 0) / total) : 0
    const zones    = new Set(devices.map(d => d.zone)).size
    const lastSeen = devices.reduce((latest: Date | null, d) => (!latest || d.lastSeen > latest) ? d.lastSeen : latest, null as Date | null)

    res.json({
      success: true,
      data: {
        totalSensors: total, online, warning, offline,
        avgBattery: avgBat,
        uptime: total > 0 ? Math.round((online / total) * 1000) / 10 : 0,
        zonesMonitored: zones,
        lastSimulation: lastSeen,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
