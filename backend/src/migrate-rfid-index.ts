/**
 * migrate-rfid-index.ts
 * ─────────────────────
 * Masalah: ada index global `rfid_1` (unique tanpa userId) yang terbuat
 * dari versi sebelumnya. Index ini bikin dua user gak bisa punya item
 * dengan RFID yang sama, padahal harusnya RFID itu unik PER USER.
 *
 * Solusi:
 *   1. Drop index lama `rfid_1`
 *   2. Pastikan compound index `{ userId, rfid }` sudah ada
 *      (sudah didefinisikan di models/index.ts — Mongoose bikin otomatis,
 *       tapi kalau index lama masih ada bisa konflik)
 *
 * Cara run:
 *   cd backend && npx ts-node-dev --transpile-only src/migrate-rfid-index.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-inventory'
  console.log('[migrate] Connecting to MongoDB…')
  await mongoose.connect(uri)
  console.log('[migrate] Connected ✅')

  const col = mongoose.connection.db!.collection('inventoryitems')

  // 1. List existing indexes
  const indexes = await col.indexes()
  console.log('[migrate] Existing indexes:', indexes.map((i: any) => i.name))

  // 2. Drop the old global rfid_1 if it exists
  const hasOldIdx = indexes.some((i: any) => i.name === 'rfid_1')
  if (hasOldIdx) {
    await col.dropIndex('rfid_1')
    console.log('[migrate] ✅ Dropped old global rfid_1 index')
  } else {
    console.log('[migrate] ℹ️  rfid_1 index not found — maybe already dropped or renamed')
  }

  // 3. Also drop any other stale unique rfid indexes (e.g. rfid_1 with sparse flag)
  const stale = indexes.filter((i: any) =>
    i.key && i.key.rfid !== undefined && Object.keys(i.key).length === 1 && i.name !== '_id_'
  )
  for (const idx of stale) {
    try {
      await col.dropIndex(idx.name as string)
      console.log(`[migrate] Dropped stale index: ${idx.name}`)
    } catch (e: any) {
      console.warn(`[migrate] Could not drop ${idx.name}:`, e.message)
    }
  }

  // 4. Ensure the compound userId+rfid unique index exists
  await col.createIndex({ userId: 1, rfid: 1 }, { unique: true, name: 'userId_1_rfid_1' })
  console.log('[migrate] ✅ Compound index { userId, rfid } ensured')

  // 5. Verify final state
  const finalIndexes = await col.indexes()
  console.log('[migrate] Final indexes:', finalIndexes.map((i: any) => `${i.name} → ${JSON.stringify(i.key)}`))

  await mongoose.disconnect()
  console.log('[migrate] Done — RFID is now unique per user, not globally ✅')
}

run().catch(e => { console.error('[migrate] FAILED:', e); process.exit(1) })
