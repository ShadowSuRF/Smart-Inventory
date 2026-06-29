import mongoose, { Schema, Document, Types } from 'mongoose'
import bcrypt from 'bcryptjs'

// ── User ──────────────────────────────────────────────────────────────
export interface IUser extends Document {
  name: string; email: string; password: string
  role: string; institution: string; initials: string; isAdmin: boolean
  comparePassword(pw: string): Promise<boolean>
}
const UserSchema = new Schema<IUser>({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 8 },
  role:        { type: String, default: 'Staff' },
  institution: { type: String, default: '' },
  initials:    { type: String, default: '' },
  isAdmin:     { type: Boolean, default: false },
}, { timestamps: true })
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  if (!this.initials)
    this.initials = this.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  next()
})
UserSchema.methods.comparePassword = async function (pw: string) { return bcrypt.compare(pw, this.password) }
export const User = mongoose.model<IUser>('User', UserSchema)

// ── InventoryItem ─────────────────────────────────────────────────────
export interface IInventoryItem extends Document {
  userId: Types.ObjectId; name: string; rfid: string; category: string
  zone: string; shelf: string; quantity: number; unit: string
  unitPrice: number; fillLevel: number; weight: number
  status: 'optimal' | 'low_stock' | 'critical'
  expiryDate: Date; supplierId: string
}
const InventoryItemSchema = new Schema<IInventoryItem>({
  userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:     { type: String, required: true, trim: true },
  rfid:     { type: String, required: true, trim: true },
  category: { type: String, required: true, enum: ['Fresh Produce','Dairy','Beverages','Frozen','Bakery','Snacks','Prepared Foods'], default: 'Fresh Produce' },
  zone:     { type: String, required: true, default: 'A' },
  shelf:    { type: String, required: true, default: '1' },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  unit:     { type: String, default: 'pcs' },
  unitPrice:{ type: Number, required: true, min: 0, default: 0 },
  fillLevel:{ type: Number, required: true, min: 0, max: 100, default: 80 },
  weight:   { type: Number, default: 0 },
  status:   { type: String, enum: ['optimal','low_stock','critical'], default: 'optimal' },
  expiryDate:  { type: Date, required: true },
  supplierId:  { type: String, default: '' },
}, { timestamps: true })
InventoryItemSchema.index({ userId: 1, rfid: 1 }, { unique: true })
InventoryItemSchema.pre('save', function (next) {
  if (this.fillLevel >= 60) this.status = 'optimal'
  else if (this.fillLevel >= 20) this.status = 'low_stock'
  else this.status = 'critical'
  next()
})
export const InventoryItem = mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema)

// ── Supplier ──────────────────────────────────────────────────────────
export interface ISupplier extends Document {
  userId: Types.ObjectId; name: string; contactEmail: string; contactPhone: string
  responseTimeHours: number; reliabilityPercent: number; rating: number
  status: 'active' | 'inactive' | 'pending'; activeOrders: number
}
const SupplierSchema = new Schema<ISupplier>({
  userId:            { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:              { type: String, required: true, trim: true },
  contactEmail:      { type: String, required: true, trim: true },
  contactPhone:      { type: String, default: '' },
  responseTimeHours: { type: Number, default: 3 },
  reliabilityPercent:{ type: Number, default: 90 },
  rating:            { type: Number, default: 4 },
  status:            { type: String, enum: ['active','inactive','pending'], default: 'active' },
  activeOrders:      { type: Number, default: 0 },
}, { timestamps: true })
export const Supplier = mongoose.model<ISupplier>('Supplier', SupplierSchema)

// ── ReplenishmentOrder ────────────────────────────────────────────────
export interface IReplenishmentOrder extends Document {
  userId: Types.ObjectId; itemId: string; itemName: string
  supplierId: string; supplierName: string; quantity: number
  unitPrice: number; totalCost: number; priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'ordered' | 'shipped' | 'delivered'
  stockoutDays: number; reorderPoint: number; currentStock: number; suggestedQuantity: number
}
const ReplenishmentOrderSchema = new Schema<IReplenishmentOrder>({
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemId: { type: String, default: '' }, itemName: { type: String, required: true },
  supplierId: { type: String, default: '' }, supplierName: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, default: 5 }, totalCost: { type: Number, default: 0 },
  priority: { type: String, enum: ['high','medium','low'], default: 'medium' },
  status:   { type: String, enum: ['pending','approved','ordered','shipped','delivered'], default: 'pending' },
  stockoutDays: { type: Number, default: 7 }, reorderPoint: { type: Number, default: 50 },
  currentStock: { type: Number, default: 0 }, suggestedQuantity: { type: Number, default: 100 },
}, { timestamps: true })
export const ReplenishmentOrder = mongoose.model<IReplenishmentOrder>('ReplenishmentOrder', ReplenishmentOrderSchema)

// ── WasteItem ─────────────────────────────────────────────────────────
export interface IWasteItem extends Document {
  userId: Types.ObjectId; itemId: string; itemName: string; category: string
  quantity: number; value: number; daysUntilExpiry: number; aiRecommendation: string
  recommendedAction: 'flash_sale' | 'bundle' | 'donation' | 'promotion' | 'kit' | 'alert'
  status: 'pending' | 'actioned' | 'disposed'; expiryDate: Date
}
const WasteItemSchema = new Schema<IWasteItem>({
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemId:           { type: String, default: '' },
  itemName:         { type: String, required: true },
  category:         { type: String, required: true },
  quantity:         { type: Number, required: true },
  value:            { type: Number, required: true },
  daysUntilExpiry:  { type: Number, required: true },
  aiRecommendation: { type: String, default: '' },
  recommendedAction:{ type: String, enum: ['flash_sale','bundle','donation','promotion','kit','alert'], default: 'alert' },
  status:           { type: String, enum: ['pending','actioned','disposed'], default: 'pending' },
  expiryDate:       { type: Date, default: Date.now },
}, { timestamps: true })
export const WasteItem = mongoose.model<IWasteItem>('WasteItem', WasteItemSchema)

// ── Notification ──────────────────────────────────────────────────────
export interface INotification extends Document {
  userId: Types.ObjectId; type: 'critical' | 'warning' | 'success' | 'info'
  title: string; message: string; read: boolean; actionRoute?: string; actionLabel?: string
}
const NotificationSchema = new Schema<INotification>({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:        { type: String, enum: ['critical','warning','success','info'], required: true },
  title:       { type: String, required: true },
  message:     { type: String, required: true },
  read:        { type: Boolean, default: false },
  actionRoute: { type: String }, actionLabel: { type: String },
}, { timestamps: true })
export const Notification = mongoose.model<INotification>('Notification', NotificationSchema)

// ── IoTSensorState — per-user sensor state ────────────────────────────
export interface IIoTSensorState extends Document {
  userId: Types.ObjectId          // ← tiap user punya "virtual" sensor mereka sendiri
  sensorId: string                // e.g. "SEN-A001" — unique per user
  zone: string; name: string; type: string
  temperature: number; humidity: number; weight: number
  batteryLevel: number; status: 'online' | 'offline' | 'warning'
  lastSeen: Date
}
const IoTSensorStateSchema = new Schema<IIoTSensorState>({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sensorId:    { type: String, required: true },
  zone:        { type: String, default: 'A' },
  name:        { type: String, default: '' },
  type:        { type: String, default: 'weight+temp' },
  temperature: { type: Number, default: 4 },
  humidity:    { type: Number, default: 55 },
  weight:      { type: Number, default: 0 },
  batteryLevel:{ type: Number, default: 85 },
  status:      { type: String, enum: ['online','offline','warning'], default: 'online' },
  lastSeen:    { type: Date, default: Date.now },
}, { timestamps: true })
// compound unique: sensorId unik per user
IoTSensorStateSchema.index({ userId: 1, sensorId: 1 }, { unique: true })
export const IoTSensorState = mongoose.model<IIoTSensorState>('IoTSensorState', IoTSensorStateSchema)

// ── ImportLog ─────────────────────────────────────────────────────────
export interface IImportLog extends Document {
  userId: Types.ObjectId; filename: string
  imported: number; skipped: number; total: number; status: 'success' | 'error'
}
const ImportLogSchema = new Schema<IImportLog>({
  userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  filename: { type: String, required: true },
  imported: { type: Number, default: 0 }, skipped: { type: Number, default: 0 },
  total:    { type: Number, default: 0 }, status: { type: String, enum: ['success','error'], default: 'success' },
}, { timestamps: true })
export const ImportLog = mongoose.model<IImportLog>('ImportLog', ImportLogSchema)

// ── UserAnalyticsSnapshot — cached per-user analytics ─────────────────
export interface IUserAnalyticsSnapshot extends Document {
  userId: Types.ObjectId
  totalRevenue: number; totalCOGS: number; totalWasteLoss: number
  totalGrossProfit: number; totalNetProfit: number; profitMargin: number
  updatedAt: Date
}
const UserAnalyticsSnapshotSchema = new Schema<IUserAnalyticsSnapshot>({
  userId:          { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalRevenue:    { type: Number, default: 0 }, totalCOGS: { type: Number, default: 0 },
  totalWasteLoss:  { type: Number, default: 0 }, totalGrossProfit: { type: Number, default: 0 },
  totalNetProfit:  { type: Number, default: 0 }, profitMargin: { type: Number, default: 0 },
}, { timestamps: true })
export const UserAnalyticsSnapshot = mongoose.model<IUserAnalyticsSnapshot>('UserAnalyticsSnapshot', UserAnalyticsSnapshotSchema)
