import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import SpeedTest from './pages/SpeedTest'
import Performance from './pages/Performance'
import Reports from './pages/Reports'
import Monitor from './pages/Monitor'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<SpeedTest />} />
        <Route path="performance" element={<Performance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
