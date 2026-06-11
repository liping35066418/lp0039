import { NavLink, Outlet } from 'react-router-dom'
import { Activity, Gauge, FileText, Clock } from 'lucide-react'

const navItems = [
  { to: '/', icon: Gauge, label: '测速面板' },
  { to: '/performance', icon: Activity, label: '性能检测' },
  { to: '/reports', icon: FileText, label: '历史报告' },
  { to: '/monitor', icon: Clock, label: '长时监测' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-bg">
      <nav className="w-56 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-5 border-b border-border">
          <h1 className="text-lg font-bold font-mono text-gradient-accent">SpeedRadar</h1>
          <p className="text-xs text-muted mt-1">网速雷达 · 综合测速工具</p>
        </div>
        <div className="flex-1 py-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm transition-all duration-200 ${
                  isActive
                    ? 'text-accent bg-accent/5 border-r-2 border-accent'
                    : 'text-muted hover:text-gray-300 hover:bg-white/[0.02]'
                }`
              }
              end={to === '/'}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-muted">服务运行中</span>
          </div>
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
