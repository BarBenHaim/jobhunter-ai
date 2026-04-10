import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Menu,
  X,
  Home,
  Briefcase,
  User,
  Settings,
  FileText,
  TrendingUp,
  LogOut,
  ChevronLeft,
} from 'lucide-react'
import { useAppStore } from '@/stores/app.store'
import { authApi } from '@/services/auth.api'
import { clearAuthToken } from '@/services/api'

const navItems = [
  { label: 'דשבורד', path: '/', icon: Home },
  { label: 'משרות', path: '/jobs', icon: Briefcase },
  { label: 'קורות חיים', path: '/cv-generator', icon: FileText },
  { label: 'הגשות', path: '/pipeline', icon: TrendingUp },
  { label: 'פרופיל', path: '/profile', icon: User },
  { label: 'הגדרות', path: '/settings', icon: Settings },
]

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, toasts, removeToast } = useAppStore()

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    clearAuthToken()
    window.location.href = '/'
  }

  const currentPageLabel = navItems.find(({ path }) => path === location.pathname)?.label || 'דשבורד'

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950" dir="rtl">
      {/* Mobile header */}
      <div className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 px-4 py-3 lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-xl p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{currentPageLabel}</h1>
        <div className="w-10" /> {/* spacer for centering */}
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[260px] flex-col
          bg-white dark:bg-gray-900 border-l border-gray-200/60 dark:border-gray-800/60
          transition-transform duration-300 ease-out
          lg:relative lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100 dark:border-gray-800/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 shadow-md shadow-primary-500/20">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">JobHunter AI</h1>
            <p className="text-xs text-gray-500 dark:text-gray-500">חיפוש עבודה חכם</p>
          </div>
        </div>

        {/* User card */}
        {user && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {(user as any).fullName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {(user as any).fullName || 'משתמש'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
                  {(user as any).email || ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'
                }`}
              >
                <Icon
                  size={18}
                  className={isActive ? 'text-primary-600 dark:text-primary-400' : ''}
                />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Logout button */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800/60">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all"
          >
            <LogOut size={18} />
            התנתקות
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-between border-b border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {currentPageLabel}
          </h2>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                שלום, <span className="font-medium text-gray-700 dark:text-gray-300">{(user as any).fullName || 'משתמש'}</span>
              </span>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 pt-16 lg:pt-4">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2" dir="ltr">
          {toasts.map(({ id, message, type }) => (
            <div
              key={id}
              className={`animate-slide-up flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg text-sm font-medium ${
                type === 'success' ? 'bg-green-500'
                  : type === 'error' ? 'bg-red-500'
                  : type === 'warning' ? 'bg-amber-500'
                  : 'bg-primary-500'
              }`}
            >
              <span>{message}</span>
              <button onClick={() => removeToast(id)} className="mr-1 rounded p-0.5 hover:bg-white/20">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  )
}
