import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.error || err.message || 'Network error'
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
      return Promise.reject(err)
    }
    toast.error(msg)
    return Promise.reject(err)
  }
)

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })
export const register = (data: { name: string; email: string; password: string; role?: string; institution?: string }) =>
  api.post('/auth/register', data)
export const logout = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me')

export const getDashboardStats = () => api.get('/dashboard/stats')

export const getInventory = (params?: Record<string, string>) => api.get('/inventory', { params })
export const createInventoryItem = (data: unknown) => api.post('/inventory', data)
export const updateInventoryItem = (id: string, data: unknown) => api.put(`/inventory/${id}`, data)
export const deleteInventoryItem = (id: string) => api.delete(`/inventory/${id}`)
export const importInventoryExcel = (formData: FormData) =>
  api.post('/inventory/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const getForecastPredictions = (horizon = 90) =>
  api.get('/forecasting/predictions', { params: { horizon } })
export const getCategoryForecast = () => api.get('/forecasting/category')
export const triggerModelRetrain = () => api.post('/forecasting/retrain')

export const getWasteItems = () => api.get('/waste/items')
export const applyWasteAction = (id: string, action: string, detail: string) =>
  api.post(`/waste/${id}/action`, { action, detail })

export const getReplenishmentSuggestions = () => api.get('/replenishment/suggestions')
export const createReplenishmentOrder = (data: unknown) => api.post('/replenishment/orders', data)
export const bulkCreateOrders = (itemIds: string[]) => api.post('/replenishment/orders/bulk', { itemIds })
export const updateOrderStatus = (id: string, status: string) => api.put(`/replenishment/orders/${id}`, { status })

export const getSuppliers = () => api.get('/suppliers')
export const createSupplier = (data: unknown) => api.post('/suppliers', data)
export const updateSupplier = (id: string, data: unknown) => api.put(`/suppliers/${id}`, data)
export const deleteSupplier = (id: string) => api.delete(`/suppliers/${id}`)

export const getAnalytics = () => api.get('/analytics')

export const getIoTSensors = () => api.get('/iot/sensors')
export const runIoTSimulation = () => api.post('/iot/simulate')
export const getIoTHistory = () => api.get('/iot/history')
export const getIoTStats = () => api.get('/iot/stats')

export const getNotifications = () => api.get('/notifications')
export const markNotificationRead = (id: string) => api.put(`/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.put('/notifications/read-all')
export const deleteNotification = (id: string) => api.delete(`/notifications/${id}`)

export default api
