import mqtt, { MqttClient } from 'mqtt'

let client: MqttClient | null = null
type Listener = (payload: { topic: string; data: unknown }) => void
const listeners = new Map<string, Listener[]>()

function currentUserId(): string | null {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    return u?.id || u?._id || null
  } catch { return null }
}

export function connectMQTT(): void {
  if (client?.connected) return
  const uid = currentUserId()
  if (!uid) return // belum login — jangan connect/subscribe apa-apa dulu

  const url = (import.meta as any).env?.VITE_MQTT_BROKER || 'wss://broker.hivemq.com:8884/mqtt'
  client = mqtt.connect(url, {
    clientId: `siwr-web-${uid}-${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 3000,
  })
  client.on('connect', () => {
    console.log('[MQTT] Connected')
    // Subscribe HANYA ke topic milik user yg login sendiri — sebelumnya
    // 'smart-inventory/#' nyubscribe ke data SEMUA user (gak private sama sekali).
    client?.subscribe(`smart-inventory/${uid}/#`, { qos: 1 })
  })
  client.on('message', (topic: string, payload: Buffer) => {
    try {
      const data = JSON.parse(payload.toString())
      const cbs = [...(listeners.get(topic) || []), ...(listeners.get('*') || [])]
      cbs.forEach((fn) => fn({ topic, data }))
    } catch {}
  })
  client.on('error', (e) => console.error('[MQTT]', e))
}

export function onMessage(key: string, cb: Listener): () => void {
  if (!listeners.has(key)) listeners.set(key, [])
  listeners.get(key)!.push(cb)
  return () => {
    const arr = listeners.get(key)
    if (arr) listeners.set(key, arr.filter((f) => f !== cb))
  }
}

export function isConnected() { return client?.connected ?? false }
export function disconnectMQTT() { client?.end(); client = null }
