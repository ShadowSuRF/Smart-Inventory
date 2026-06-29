import mqtt, { MqttClient } from 'mqtt'

let client: MqttClient | null = null
type Listener = (payload: { topic: string; data: unknown }) => void
const listeners = new Map<string, Listener[]>()

export function connectMQTT(): void {
  if (client?.connected) return
  const url = (import.meta as any).env?.VITE_MQTT_BROKER || 'wss://broker.hivemq.com:8884/mqtt'
  client = mqtt.connect(url, {
    clientId: `siwr-web-${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 3000,
  })
  client.on('connect', () => {
    console.log('[MQTT] Connected')
    client?.subscribe('smart-inventory/#', { qos: 1 })
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
