import { InventoryItem, Notification } from '../models'

// MQTT handler — hanya dipakai kalau broker terhubung
export async function handleIoTMessage(topic: string, data: any): Promise<void> {
  const parts    = topic.split('/')
  if (parts.length < 4) return
  const sensorId = parts[2]
  const dataType = parts[3]

  if (dataType === 'temperature' && data.temperature) {
    if (data.temperature > 25 || data.temperature < -25) {
      await Notification.create({
        userId: data.userId,
        type: 'warning', title: 'Temperature Alert',
        message: `Sensor ${sensorId}: ${data.temperature}°C outside safe range.`,
        actionRoute: '/iot', actionLabel: 'View Sensors',
      }).catch(() => {})
    }
  }

  if (dataType === 'weight' && data.rfid) {
    const item = await InventoryItem.findOne({ rfid: data.rfid })
    if (item) {
      const maxWeight = item.quantity * 0.5
      const fill = maxWeight > 0 ? Math.min(Math.round((data.weight / maxWeight) * 100), 100) : 0
      item.fillLevel = fill
      item.weight    = data.weight || 0
      await item.save()
    }
  }
}
