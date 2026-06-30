import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { User, InventoryItem, Supplier, WasteItem, Notification, ReplenishmentOrder, IoTDevice, ImportLog } from './models'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_inventory'

async function seed() {
  await mongoose.connect(MONGODB_URI)
  console.log('[Seed] Connected to MongoDB')

  await Promise.all([
    User.deleteMany({}),
    InventoryItem.deleteMany({}),
    Supplier.deleteMany({}),
    WasteItem.deleteMany({}),
    Notification.deleteMany({}),
    ReplenishmentOrder.deleteMany({}),
    IoTDevice.deleteMany({}),
    ImportLog.deleteMany({}),
  ])
  console.log('[Seed] Cleared existing data')

  // Users
  const admin = await User.create({
    name: 'Admin', email: 'admin@smartinventory.com', password: 'admin123',
    role: 'System Administrator', institution: 'BINUS University', initials: 'AD', isAdmin: true,
  })
  const erick = await User.create({
    name: 'Erick Santoso', email: 'erick@binus.edu', password: 'password123',
    role: 'IT Developer', institution: 'BINUS University', initials: 'ES', isAdmin: false,
  })
  console.log('[Seed] Created 2 users')

  // Seed data untuk KEDUA user (masing-masing punya data sendiri)
  for (const user of [erick, admin]) {
    const uid = user._id

    const suppliers = await Supplier.insertMany([
      { userId: uid, name:'FreshDirect Suppliers', contactEmail:'fresh@direct.com', contactPhone:'+62-21-1234', responseTimeHours:2.3, reliabilityPercent:98, rating:5, status:'active', activeOrders:12 },
      { userId: uid, name:'Local Organic Farms',   contactEmail:'organic@farms.id',  contactPhone:'+62-21-5678', responseTimeHours:1.8, reliabilityPercent:97, rating:5, status:'active', activeOrders:5 },
      { userId: uid, name:'Metro Wholesale Co.',   contactEmail:'metro@wholesale.co', contactPhone:'+62-21-9012', responseTimeHours:3.5, reliabilityPercent:92, rating:4, status:'active', activeOrders:15 },
      { userId: uid, name:'Global Food Distributors', contactEmail:'gfd@global.com', contactPhone:'+62-21-3456', responseTimeHours:4.1, reliabilityPercent:95, rating:4, status:'active', activeOrders:8 },
    ])

    const now  = new Date()
    const days = (n: number) => new Date(now.getTime() + n * 86400000)
    // Beda RFID per user supaya tidak clash (compound index userId+rfid)
    const pfx = user.email === 'erick@binus.edu' ? 'E' : 'A'

    const items = await InventoryItem.insertMany([
      { userId: uid, name:'Fresh Produce A1',     rfid:`RFID-${pfx}A001`, category:'Fresh Produce', zone:'A', shelf:'1', quantity:100, unit:'kg',  unitPrice:5, fillLevel:85, weight:45.2, expiryDate:days(14), supplierId:suppliers[0]._id.toString() },
      { userId: uid, name:'Dairy Products B2',    rfid:`RFID-${pfx}B002`, category:'Dairy',         zone:'B', shelf:'2', quantity:80,  unit:'L',   unitPrice:5, fillLevel:72, weight:32.8, expiryDate:days(7),  supplierId:suppliers[0]._id.toString() },
      { userId: uid, name:'Beverages C3',         rfid:`RFID-${pfx}C003`, category:'Beverages',     zone:'C', shelf:'3', quantity:30,  unit:'btl', unitPrice:4, fillLevel:35, weight:18.5, expiryDate:days(60), supplierId:suppliers[2]._id.toString() },
      { userId: uid, name:'Frozen Foods D1',      rfid:`RFID-${pfx}D001`, category:'Frozen',        zone:'D', shelf:'1', quantity:10,  unit:'pcs', unitPrice:8, fillLevel:15, weight:8.2,  expiryDate:days(90), supplierId:suppliers[2]._id.toString() },
      { userId: uid, name:'Bakery Items E2',      rfid:`RFID-${pfx}E002`, category:'Bakery',        zone:'E', shelf:'2', quantity:70,  unit:'pcs', unitPrice:4, fillLevel:68, weight:28.4, expiryDate:days(3),  supplierId:suppliers[0]._id.toString() },
      { userId: uid, name:'Snacks & Chips F1',    rfid:`RFID-${pfx}F001`, category:'Snacks',        zone:'F', shelf:'1', quantity:40,  unit:'pcs', unitPrice:5, fillLevel:42, weight:22.1, expiryDate:days(120),supplierId:suppliers[2]._id.toString() },
      { userId: uid, name:'Organic Strawberries', rfid:`RFID-${pfx}G001`, category:'Fresh Produce', zone:'A', shelf:'2', quantity:45,  unit:'kg',  unitPrice:4, fillLevel:60, weight:22.5, expiryDate:days(2),  supplierId:suppliers[1]._id.toString() },
      { userId: uid, name:'Fresh Milk (1L)',       rfid:`RFID-${pfx}H001`, category:'Dairy',         zone:'B', shelf:'1', quantity:28,  unit:'L',   unitPrice:3, fillLevel:18, weight:28.0, expiryDate:days(3),  supplierId:suppliers[0]._id.toString() },
      { userId: uid, name:'Artisan Bread',         rfid:`RFID-${pfx}I001`, category:'Bakery',        zone:'E', shelf:'1', quantity:16,  unit:'pcs', unitPrice:4, fillLevel:25, weight:8.0,  expiryDate:days(1),  supplierId:suppliers[0]._id.toString() },
      { userId: uid, name:'Greek Yogurt',          rfid:`RFID-${pfx}J001`, category:'Dairy',         zone:'B', shelf:'3', quantity:32,  unit:'pcs', unitPrice:3, fillLevel:45, weight:9.6,  expiryDate:days(5),  supplierId:suppliers[0]._id.toString() },
      { userId: uid, name:'Mixed Salad Greens',    rfid:`RFID-${pfx}K001`, category:'Fresh Produce', zone:'A', shelf:'3', quantity:22,  unit:'kg',  unitPrice:3, fillLevel:55, weight:11.0, expiryDate:days(4),  supplierId:suppliers[1]._id.toString() },
      { userId: uid, name:'Deli Sandwiches',       rfid:`RFID-${pfx}L001`, category:'Prepared Foods',zone:'G', shelf:'1', quantity:12,  unit:'pcs', unitPrice:9, fillLevel:35, weight:6.0,  expiryDate:days(7),  supplierId:suppliers[0]._id.toString() },
    ])

    await WasteItem.insertMany([
      { userId: uid, itemId:items[6]._id.toString(), itemName:'Organic Strawberries', category:'Fresh Produce', quantity:45, value:180, daysUntilExpiry:2, aiRecommendation:'Apply 30% discount immediately or create "Berry Smoothie Special" promotion', recommendedAction:'flash_sale', status:'pending', expiryDate:days(2) },
      { userId: uid, itemId:items[7]._id.toString(), itemName:'Fresh Milk (1L)',       category:'Dairy',         quantity:28, value:84,  daysUntilExpiry:3, aiRecommendation:'Bundle with cereal or offer "Buy 2 Get 1 Free" deal', recommendedAction:'bundle', status:'pending', expiryDate:days(3) },
      { userId: uid, itemId:items[8]._id.toString(), itemName:'Artisan Bread',         category:'Bakery',        quantity:16, value:64,  daysUntilExpiry:1, aiRecommendation:'Donate to local food bank or create bread pudding promotion', recommendedAction:'donation', status:'pending', expiryDate:days(1) },
      { userId: uid, itemId:items[9]._id.toString(), itemName:'Greek Yogurt',          category:'Dairy',         quantity:32, value:96,  daysUntilExpiry:5, aiRecommendation:'Feature in healthy breakfast promotion or partner with nearby gym', recommendedAction:'promotion', status:'pending', expiryDate:days(5) },
      { userId: uid, itemId:items[10]._id.toString(),itemName:'Mixed Salad Greens',    category:'Fresh Produce', quantity:22, value:66,  daysUntilExpiry:4, aiRecommendation:'Create "Fresh Salad Kit" with dressing and toppings for added value', recommendedAction:'kit', status:'pending', expiryDate:days(4) },
    ])

    await ReplenishmentOrder.insertMany([
      { userId: uid, itemId:items[7]._id.toString(), itemName:'Fresh Milk (1L)',      supplierId:suppliers[0]._id.toString(), supplierName:'FreshDirect Suppliers', quantity:120, unitPrice:3, totalCost:360, priority:'high',   status:'pending', stockoutDays:3, reorderPoint:50,  currentStock:28, suggestedQuantity:120 },
      { userId: uid, itemId:items[6]._id.toString(), itemName:'Organic Strawberries', supplierId:suppliers[1]._id.toString(), supplierName:'Local Organic Farms',   quantity:150, unitPrice:4, totalCost:600, priority:'high',   status:'pending', stockoutDays:2, reorderPoint:80,  currentStock:45, suggestedQuantity:150 },
      { userId: uid, itemId:items[9]._id.toString(), itemName:'Greek Yogurt',         supplierId:suppliers[0]._id.toString(), supplierName:'FreshDirect Suppliers', quantity:200, unitPrice:3, totalCost:600, priority:'medium', status:'pending', stockoutDays:5, reorderPoint:100, currentStock:62, suggestedQuantity:200 },
    ])

    await Notification.insertMany([
      { userId: uid, type:'critical', title:'Critical Stock Alert', message:`Fresh Milk below minimum threshold (8 units). Immediate reorder recommended.`, read:false, actionRoute:'/replenishment', actionLabel:'Create Order' },
      { userId: uid, type:'critical', title:'Expiration Alert',     message:`Organic Strawberries expire in 2 days (45 units). AI suggests 30% discount.`, read:false, actionRoute:'/waste-prevention', actionLabel:'Apply Discount' },
      { userId: uid, type:'warning',  title:'Temperature Alert',    message:`Zone D cooler at 5.2°C. Currently within acceptable range but monitoring.`, read:false, actionRoute:'/analytics', actionLabel:'View Details' },
      { userId: uid, type:'success',  title:'Replenishment Done',   message:`Automated order for Beverages Zone C placed with Supplier #3.`, read:true },
      { userId: uid, type:'info',     title:'AI Model Update',      message:`Demand forecasting model updated. Accuracy improved to 94.2%.`, read:true },
      { userId: uid, type:'success',  title:'Waste Milestone',      message:`You've prevented $4,280 in waste this month, exceeding target by 15%!`, read:true, actionRoute:'/analytics', actionLabel:'View Report' },
    ])

    // IoT devices — contoh starter milik masing² user sendiri (bukan template global).
    // User tetep bisa edit/hapus/nambah sendiri dari popup "Tambah Sensor" di halaman IoT.
    const devicePresets: { name: string; zone: string; type: string; tempMin: number; tempMax: number; humMin: number; humMax: number }[] = [
      { name: 'Cold Storage Sensor 1', zone: 'A', type: 'weight+temp',    tempMin: 2,   tempMax: 8,   humMin: 85, humMax: 95 },
      { name: 'Dairy Fridge Sensor',   zone: 'B', type: 'temp+humidity', tempMin: 2,   tempMax: 6,   humMin: 70, humMax: 85 },
      { name: 'Freezer Unit Sensor',   zone: 'D', type: 'temp+weight',   tempMin: -20, tempMax: -15, humMin: 30, humMax: 50 },
      { name: 'Bakery Shelf Sensor',   zone: 'E', type: 'weight+rfid',   tempMin: 18,  tempMax: 24,  humMin: 50, humMax: 65 },
    ]
    for (const [i, p] of devicePresets.entries()) {
      const deviceId = `SEN-${p.zone}${String(i + 1).padStart(3, '0')}`
      const baseTemp = (p.tempMin + p.tempMax) / 2
      const baseHum  = (p.humMin + p.humMax) / 2
      await IoTDevice.create({
        userId: uid, deviceId, name: p.name, zone: p.zone, type: p.type,
        tempMin: p.tempMin, tempMax: p.tempMax, humMin: p.humMin, humMax: p.humMax,
        mqttTopic: `smart-inventory/${uid}/${deviceId}`,
        temperature: baseTemp, humidity: baseHum, weight: 0,
        batteryLevel: 80 + Math.round(Math.random() * 20),
        status: 'online', source: 'simulated', lastSeen: new Date(),
      })
    }

    console.log(`[Seed] Data seeded for ${user.email}`)
  }

  console.log('\n[Seed] ✅ Done!')
  console.log('  erick@binus.edu   / password123')
  console.log('  admin@smartinventory.com / admin123')
  await mongoose.disconnect()
}

seed().catch(err => { console.error('[Seed] Error:', err); process.exit(1) })
