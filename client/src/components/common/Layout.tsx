import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Menu,
  X,
  Home,
  Briefcase,
  TrendingUp,
  FileText,
  Users,
  User,
  BarChart3,
  Settings,
  Bell,
  Network,
  Zap,
} from 'lucide-react'
import { useAppStore } from '@/stores/app.store'

const navItems = [
  { label: 'Dashboard', path: '/', icon: Home },
  { label: 'Jobs', path: '/jobs', icon: Briefcase },
  { label: 'Pipeline', path: '/pipeline', icon: TrendingUp },
  { label: 'Review Queue', path: '/review', icon: FileText },
  { label: 'Personas', path: '/personas', icon: Users },
  { label: 'Profile', path: '/profile', icon: User },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { sidebarCollapsed, setSidebarCollapsed, toasts, removeToast, systemHealthy } =
    useAppStore()

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg p-2 lg:hidden"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 lg:relative lg:translate-x-0 ${
          sidebarCollapsed ? '-translate-x-full' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <Zap className="h-6 w-6 text-primary-600" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">JobHunter AI</h1>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 px-3 py-6">
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-200'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* System health indicator */}
        <div className="border-t border-gray-200 px-3 py-4 dark:border-gray-800">
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              systemHealthy
                ? 'bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-200'
                : 'bg-error-100 text-error-700 dark:bg-error-900 dark:text-error-200'
            }`}
          >
            <div className={`h-2 w-2 rounded-full ${systemHealthy ? 'bg-success-500' : 'bg-error-500'}`} />
            {systemHealthy ? 'System Healthy' : 'System Issues'}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {navItems.find(({ path }) => path === location.pathname)?.label || 'Dashboard'}
            </h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 lg:flex"
              >
                <Menu size={20} />
              </button>
              <button className="relative rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Bell size={20} />
                {toasts.length > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-error-500" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
        {toasts.map(({ id, message, type }) => (
          <div
            key={id}
            className={`animate-slide-in flex items-center gap-3 rounded-lg px-4 py-3 text-white shadow-lg ${
              type === 'success'
                ? 'bg-success-500'
                : type === 'error'
                  ? 'bg-error-500'
                  : type === 'warning'
                    ? 'bg-warning-500'
                    : 'bg-primary-500'
            }`}
          >
            <span>{message}</span>
            <button
              onClick={() => removeToast(id)}
              className="ml-auto rounded hover:opacity-80"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  )
}
