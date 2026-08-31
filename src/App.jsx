import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DispatcherDashboard from './pages/DispatcherDashboard'
import CreateDeliveryPage from './pages/CreateDeliveryPage'
import DeliveryDetailPage from './pages/DeliveryDetailPage'
import DriverManagementPage from './pages/DriverManagementPage'
import DriverDashboard from './pages/DriverDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import LiveMapPage from './pages/LiveMapPage'
import RoutePlanningPage from "./pages/RoutePlanningPage.jsx";
export default function App() {
  return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
              path="/dispatcher"
              element={
                <ProtectedRoute allowedRole="DISPATCHER">
                  <DispatcherDashboard />
                </ProtectedRoute>
              }
          />

          <Route
              path="/dispatcher/deliveries/new"
              element={
                <ProtectedRoute allowedRole="DISPATCHER">
                  <CreateDeliveryPage />
                </ProtectedRoute>
              }
          />

          <Route
              path="/dispatcher/deliveries/:id"
              element={
                <ProtectedRoute allowedRole="DISPATCHER">
                  <DeliveryDetailPage />
                </ProtectedRoute>
              }
          />

          <Route
              path="/dispatcher/drivers"
              element={
                <ProtectedRoute allowedRole="DISPATCHER">
                  <DriverManagementPage />
                </ProtectedRoute>
              }
          />

          <Route
              path="/driver"
              element={
                <ProtectedRoute allowedRole="DRIVER">
                  <DriverDashboard />
                </ProtectedRoute>
              }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
              path="/dispatcher/map"
              element={
                  <ProtectedRoute allowedRole="DISPATCHER">
                      <LiveMapPage />
                  </ProtectedRoute>
            }
          />
            <Route path="/dispatcher/routes" element={<RoutePlanningPage />} />
        </Routes>
      </BrowserRouter>
  )
}