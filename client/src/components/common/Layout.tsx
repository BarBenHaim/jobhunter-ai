import { useState, useEffect } from 'react'
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
  Zap,
  FileBadge,
  BookOpen,
  Brain,
  Sparkles,
  DollarSign,
} from 'lucide-react'
import { useAppStore } from '@/stores/app.store'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

/** Cost Tracker Widget — shows today's API spend */
const CostTrackerWidget = () => {
  const [costs, setCosts] = useState<{
    anthropic: { calls: number; cost: number }
    serpapi: { calls: number; cost: number }
    total: number
  } | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const res = await fetch(`${API_BASE}/costs/today`)
        const data = await res.json()
        if (data.success) setCosts(data.data)
      } catch {
        // silently fail
      }
    }
    fetchCosts()
    const interval = setInterval(fetchCosts, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  if (!costs) return null

  const totalDisplay = costs.total < 0.01
    ? `$${costs.total.toFixed(4)}`
    : `$${costs.total.toFixed(2)}`

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-xl transition-all duration-300 ${
          costs.total > 1
            ? 'bg-warning-500/90 text-white'
            : costs.total > 0.1
              ? 'bg-amber-100/90 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
              : 'bg-white/80 text-gray-700 dark:bg-gray-800/80 dark:text-gray-300'
        } border border-gray-200/30 dark:border-gray-700/30 hover:scale-105`}
      >
        <DollarSign size={16} className={costs.total > 1 ? 'text-white' : 'text-green-600 dark:text-green-400'} />
        <span>{totalDisplay}</span>
        <span className="text-xs opacity-60">today</span>
      </button>

      {expanded && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-gray-200/30 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:border-gray-700/30 dark:bg-gray-800/95 animate-fade-in">
          <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <DollarSign size={14} />
            API Costs Today
          </h4>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span className="text-gray-600 dark:text-gray-400">Claude AI</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-gray-900 dark:text-white">
                  ${costs.anthropic.cost < 0.01 ? costs.anthropic.cost.toFixed(4) : costs.anthropic.cost.toFixed(2)}
                </span>
                <span className="ml-1.5 text-xs text-gray-400">({costs.anthropic.calls} calls)</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-gray-600 dark:text-gray-400">SerpAPI</span>
              </div>
              <div className="text-right">
                <span className="font-medium text-gray-900 dark:text-white">
                  ${costs.serpapi.cost < 0.01 ? costs.serpapi.cost.toFixed(4) : costs.serpapi.cost.toFixed(2)}
                </span>
                <span className="ml-1.5 text-xs text-gray-400">({costs.serpapi.calls} calls)</span>
              </div>
            </div>

            <div className="mt-2 border-t border-gray-200/50 pt-2 dark:border-gray-700/50">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-gray-900 dark:text-white">{totalDisplay}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const navItems = [
  { label: 'Dashboard', path: '/', icon: Home },
  { label: 'Jobs', path: '/jobs', icon: Briefcase },
  { label: 'Pipeline', path: '/pipeline', icon: TrendingUp },
  { label: 'Review Queue', path: '/review', icon: FileText },
  { label: 'Personas', path: '/personas', icon: Users },
  { label: 'Profile', path: '/profile', icon: User },
  { label: 'CV Generator', path: '/cv-generator', icon: FileBadge },
  { label: 'Intelligence', path: '/intelligence', icon: Brain },
  { label: 'Discovery', path: '/discovery', icon: Sparkles },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'Guide', path: '/guide', icon: BookOpen },
]

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { sidebarCollapsed, setSidebarCollapsed, toasts, removeToast, systemHealthy } =
    useAppStore()

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-primary-50/30 dark:from-gray-950 dark:via-gray-950 dark:to-primary-950/20">
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-xl p-2.5 glass shadow-glass lg:hidden active:scale-95 transition-transform"
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col overflow-y-auto
          border-r border-gray-200/30 bg-white/80 backdrop-blur-xl
          transition-all duration-300 ease-out
          dark:border-gray-800/30 dark:bg-gray-900/80
          lg:relative lg:translate-x-0 ${
          sidebarCollapsed ? '-translate-x-full' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 shadow-md shadow-primary-500/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold gradient-text">JobHunter AI</h1>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'
                }`}
              >
                <Icon
                  size={18}
                  className={`transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? 'text-primary-600 dark:text-primary-400' : ''
                  }`}
                />
                {label}
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse-soft" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* System health indicator */}
        <div className="mx-3 mb-4">
          <div
            className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 ${
              systemHealthy
                ? 'bg-success-50/80 text-success-700 dark:bg-success-900/20 dark:text-success-300'
                : 'bg-error-50/80 text-error-700 dark:bg-error-900/20 dark:text-error-300'
            }`}
          >
            <div className={`h-2 w-2 rounded-full animate-pulse-soft ${systemHealthy ? 'bg-success-500' : 'bg-error-500'}`} />
            {systemHealthy ? 'System Healthy' : 'System Issues'}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="border-b border-gray-200/30 bg-white/60 backdrop-blur-xl px-6 py-4 dark:border-gray-800/30 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              {navItems.find(({ path }) => path === location.pathname)?.label || 'Dashboard'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden rounded-xl p-2.5 text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 transition-all duration-200 dark:hover:bg-gray-800/50 dark:text-gray-400 dark:hover:text-gray-200 lg:flex"
              >
                <Menu size={20} />
              </button>
              <button className="relative rounded-xl p-2.5 text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 transition-all duration-200 dark:hover:bg-gray-800/50 dark:text-gray-400 dark:hover:text-gray-200">
                <Bell size={20} />
                {toasts.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500" />
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
        {toasts.map(({ id, message, type }) => (
          <div
            key={id}
            className={`animate-slide-up flex items-center gap-3 rounded-2xl px-5 py-3.5 text-white shadow-lg backdrop-blur-sm ${
              type === 'success'
                ? 'bg-success-500/90'
                : type === 'error'
                  ? 'bg-error-500/90'
                  : type === 'warning'
                    ? 'bg-warning-500/90'
                    : 'bg-primary-500/90'
            }`}
          >
            <span className="font-medium">{message}</span>
            <button
              onClick={() => removeToast(id)}
              className="ml-auto rounded-lg p-0.5 hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Cost tracker widget */}
      <CostTrackerWidget />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  )
              }
