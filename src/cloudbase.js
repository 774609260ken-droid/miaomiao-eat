import cloudbase from '@cloudbase/js-sdk'

const CLOUD_CONFIG = {
  env: 'ken1370838788-d9gyeeebwdbba971e',
  region: 'ap-shanghai',
  collection: 'orders',
  roomId: 'miaomiao-ken',
}

let app = null
let db = null
let ordersCollection = null
let currentUserId = ''

export function getCloudConfig() {
  return {
    ...CLOUD_CONFIG,
    enabled: Boolean(CLOUD_CONFIG.env && !CLOUD_CONFIG.env.startsWith('YOUR_')),
  }
}

function toMillis(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Date.parse(value) || 0
  if (typeof value === 'object') {
    if ('$date' in value) return new Date(value.$date).getTime()
    if ('seconds' in value) return Number(value.seconds) * 1000
  }
  return 0
}

function normalizeOrder(doc) {
  return {
    ...doc,
    id: doc.orderId || doc.id || doc._id,
    createdAtMs: doc.createdAtMs || toMillis(doc.createdAt) || Date.now(),
  }
}

export async function initOrderCloud() {
  const config = getCloudConfig()
  if (!config.enabled) return { enabled: false, userId: '' }

  app = cloudbase.init({ env: config.env, region: config.region })
  const loginResult = await app.auth.signInAnonymously()
  if (loginResult?.error) throw loginResult.error

  currentUserId = loginResult?.data?.user?.id || loginResult?.data?.user?.uid || ''
  if (!currentUserId) {
    const sessionResult = await app.auth.getSession()
    if (sessionResult?.error) throw sessionResult.error
    currentUserId = sessionResult?.data?.session?.user?.id || sessionResult?.data?.session?.user?.uid || ''
  }

  db = app.database()
  ordersCollection = db.collection(config.collection)
  return { enabled: true, userId: currentUserId }
}

function collection() {
  if (!ordersCollection) throw new Error('CloudBase 尚未初始化')
  return ordersCollection
}

export async function fetchCloudOrders() {
  const config = getCloudConfig()
  const result = await collection()
    .where({ roomId: config.roomId })
    .orderBy('createdAtMs', 'asc')
    .limit(100)
    .get()

  return (result?.data || [])
    .map(normalizeOrder)
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
}

export async function createCloudOrder(order) {
  const config = getCloudConfig()
  return collection().add({
    ...order,
    orderId: order.id,
    roomId: config.roomId,
    createdBy: currentUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

export async function updateCloudOrder(orderId, status) {
  const config = getCloudConfig()
  return collection()
    .where({ roomId: config.roomId, orderId })
    .update({ status, updatedAt: new Date() })
}

export function watchCloudOrders(onChange, onError) {
  const config = getCloudConfig()
  const watcher = collection()
    .where({ roomId: config.roomId })
    .watch({
      onChange(snapshot) {
        const orders = (snapshot?.docs || [])
          .map(normalizeOrder)
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
        onChange(orders)
      },
      onError,
    })
  return () => watcher?.close?.()
}
