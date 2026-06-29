export interface InventoryItem {
  _id: string
  name: string
  rfid: string
  category: string
  zone: string
  shelf: string
  quantity: number
  unit: string
  unitPrice: number
  fillLevel: number
  weight: number
  status: 'optimal' | 'low_stock' | 'critical'
  expiryDate: string
  supplierId: string
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  _id: string
  name: string
  contactEmail: string
  contactPhone: string
  responseTimeHours: number
  reliabilityPercent: number
  rating: number
  status: 'active' | 'inactive' | 'pending'
  activeOrders: number
  createdAt: string
}

export interface ReplenishmentOrder {
  _id: string
  itemId: string
  itemName: string
  supplierId: string
  supplierName: string
  quantity: number
  unitPrice: number
  totalCost: number
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'ordered' | 'shipped' | 'delivered'
  stockoutDays: number
  reorderPoint: number
  currentStock: number
  suggestedQuantity: number
  createdAt: string
}

export interface WasteItem {
  _id: string
  itemId: string
  itemName: string
  category: string
  quantity: number
  value: number
  daysUntilExpiry: number
  aiRecommendation: string
  recommendedAction: 'flash_sale' | 'bundle' | 'donation' | 'promotion' | 'kit' | 'alert'
  status: 'pending' | 'actioned' | 'disposed'
  expiryDate: string
}

export interface Notification {
  _id: string
  type: 'critical' | 'warning' | 'success' | 'info'
  title: string
  message: string
  read: boolean
  actionRoute?: string
  actionLabel?: string
  createdAt: string
}

export interface DashboardStats {
  totalItems: number
  stockValue: number
  wasteReduction: number
  criticalAlerts: number
  activeOrders: number
  forecastAccuracy: number
  co2Saved: number
  wastePrevented: number
}

export type Theme = 'light' | 'dark' | 'system'
export type AccentColor = 'blue' | 'purple' | 'green' | 'red' | 'amber' | 'cyan'
