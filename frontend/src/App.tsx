import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Layout from './components/layout/Layout'
import PageLoader from './components/ui/PageLoader'
import { useSettings } from './context/SettingsContext'

// Lazy load pages for faster initial load
const Landing          = lazy(() => import('./pages/Landing'))
const Login            = lazy(() => import('./pages/Login'))
const Register         = lazy(() => import('./pages/Register'))
const Dashboard        = lazy(() => import('./pages/Dashboard'))
const InventoryTracking= lazy(() => import('./pages/InventoryTracking'))
const ExcelImport      = lazy(() => import('./pages/ExcelImport'))
const AIForecasting    = lazy(() => import('./pages/AIForecasting'))
const WastePrevention  = lazy(() => import('./pages/WastePrevention'))
const AutoReplenishment= lazy(() => import('./pages/AutoReplenishment'))
const Analytics        = lazy(() => import('./pages/Analytics'))
const Notifications    = lazy(() => import('./pages/Notifications'))
const Settings         = lazy(() => import('./pages/Settings'))
const IoTSensorNetwork = lazy(() => import('./pages/IoTSensorNetwork'))
const ProfitDashboard  = lazy(() => import('./pages/ProfitDashboard'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Page wrapper — adds fade-in animation per navigation
function PageWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="page-enter">
      <Suspense fallback={<PageLoader text="Memuat halaman" />}>
        {children}
      </Suspense>
    </div>
  )
}

export default function App() {
  const { settings } = useSettings()

  return (
    <Suspense fallback={<PageLoader fullscreen text="Memuat Smart Inventory" />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<PageWrapper><Landing /></PageWrapper>} />
        <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
        <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />

        {/* Protected routes with Layout */}
        <Route path="/*" element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"    element={<PageWrapper><Dashboard /></PageWrapper>} />
                <Route path="/inventory"    element={<PageWrapper><InventoryTracking /></PageWrapper>} />
                <Route path="/iot"          element={<PageWrapper><IoTSensorNetwork /></PageWrapper>} />
                <Route path="/excel-import" element={<PageWrapper><ExcelImport /></PageWrapper>} />
                <Route path="/forecasting"  element={<PageWrapper><AIForecasting /></PageWrapper>} />
                <Route path="/waste-prevention" element={<PageWrapper><WastePrevention /></PageWrapper>} />
                <Route path="/replenishment" element={<PageWrapper><AutoReplenishment /></PageWrapper>} />
                <Route path="/analytics"    element={<PageWrapper><Analytics /></PageWrapper>} />
                <Route path="/profit"       element={<PageWrapper><ProfitDashboard /></PageWrapper>} />
                <Route path="/notifications" element={<PageWrapper><Notifications /></PageWrapper>} />
                <Route path="/settings"     element={<PageWrapper><Settings /></PageWrapper>} />
              </Routes>
            </Layout>
          </PrivateRoute>
        } />
      </Routes>
    </Suspense>
  )
}
