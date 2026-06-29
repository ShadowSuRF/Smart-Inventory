import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import InventoryTracking from './pages/InventoryTracking'
import ExcelImport from './pages/ExcelImport'
import AIForecasting from './pages/AIForecasting'
import WastePrevention from './pages/WastePrevention'
import AutoReplenishment from './pages/AutoReplenishment'
import Analytics from './pages/Analytics'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import IoTSensorNetwork from './pages/IoTSensorNetwork'
import ProfitDashboard from './pages/ProfitDashboard'
import { connectMQTT } from './lib/mqtt'
import { useSettings } from './context/SettingsContext'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { settings } = useSettings()

  useEffect(() => { connectMQTT() }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/*" element={
        <PrivateRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<InventoryTracking />} />
              <Route path="/iot" element={<IoTSensorNetwork />} />
              <Route path="/excel-import" element={<ExcelImport />} />
              <Route path="/forecasting" element={<AIForecasting />} />
              <Route path="/waste-prevention" element={<WastePrevention />} />
              <Route path="/replenishment" element={<AutoReplenishment />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/profit" element={<ProfitDashboard />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />
    </Routes>
  )
}
