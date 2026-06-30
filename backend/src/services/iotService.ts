import { IoTDevice, InventoryItem, Notification } from '../models'

// MQTT handler — dipanggil kalau broker beneran terhubung & ada device fisik publish.
// Topic format: smart-inventory/{userId}/{deviceId}/{dataType}
// userId ada di topic itu sendiri supaya tiap user cuma bisa update device/item MILIKNYA —
// sebelumnya topic-nya gak nyimpen userId sama sekali jadi gak bisa private per user.
export async function handleIoTMessage(topic: string, data: any): Promise<void> {
  const parts = topic.split('/')
  if (parts.length < 4 || parts[0] !== 'smart-inventory') return
  const userId   = parts[1]
  const deviceId = parts[2]
  const dataType = parts[3]

  const device = await IoTDevice.findOne({ userId, deviceId })
  if (!device) return // bukan device terdaftar milik user ini — diabaikan

  if (dataType === 'temperature' && typeof data.temperature === 'number') {
    device.temperature = data.temperature
    device.source      = 'mqtt'
    device.lastSeen     = new Date()
    const tempOk = data.temperature >= device.tempMin && data.temperature <= device.tempMax
    device.status = tempOk ? 'online' : 'warning'
    await device.save()

    if (!tempOk) {
      await Notification.create({
        userId, type: 'warning', title: 'Temperature Alert',
        message: `Sensor ${deviceId}: ${data.temperature}°C outside range (${device.tempMin}–${device.tempMax}°C).`,
        actionRoute: '/iot', actionLabel: 'View Sensors',
      }).catch(() => {})
    }
  }

  if (dataType === 'humidity' && typeof data.humidity === 'number') {
    device.humidity = data.humidity
    device.source    = 'mqtt'
    device.lastSeen   = new Date()
    await device.save()
  }

  if (dataType === 'weight') {
    device.weight  = data.weight || 0
    device.source  = 'mqtt'
    device.lastSeen = new Date()
    await device.save()

    // rfid di-scope ke userId yg sama dgn topic — rfid cuma unik PER USER
    // (dulu di-query tanpa userId, jadi bisa salah update item milik user lain
    // kalau dua user kebetulan punya rfid yang sama persis)
    if (data.rfid) {
      const item = await InventoryItem.findOne({ userId, rfid: data.rfid })
      if (item) {
        const maxWeight = item.quantity * 0.5
        const fill = maxWeight > 0 ? Math.min(Math.round((data.weight / maxWeight) * 100), 100) : 0
        item.fillLevel = fill
        item.weight    = data.weight || 0
        await item.save()
      }
    }
  }

  if (dataType === 'battery' && typeof data.batteryLevel === 'number') {
    device.batteryLevel = data.batteryLevel
    device.source        = 'mqtt'
    device.lastSeen       = new Date()
    await device.save()
    if (data.batteryLevel < 20) {
      await Notification.create({
        userId, type: 'warning', title: 'Low Battery Alert',
        message: `Sensor ${deviceId} battery ${data.batteryLevel}%. Schedule maintenance.`,
        actionRoute: '/iot', actionLabel: 'View Sensors',
      }).catch(() => {})
    }
  }
}
