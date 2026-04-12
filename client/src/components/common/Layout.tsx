import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Menu,
  X,
  LayoutDashboard,
  Briefcase,
  User,
  Settings,
  FileText,
  TrendingUp,
  LogOut,
  Search,
  Bell,
  Zap,
} from 'lucide-react'
import { useAppStore } from '@/stores/app.store'
import { authApi } from '@/services/auth.api'
import { clearAuthToken } from '@/services/api'

const navItems = [
  { label: 'דשבורד', path: '/', icon: LayoutDashboard },
  { label: 'משרות', path: '/jobs', icon: Briefcase },
  { label: 'קורות חיים', path: '/cv-generator', icon: FileText },
  { label: 'הגשות', path: '/pipeline', icon: TrendingUp },
  { label: 'AutoPilot', path: '/autopilot', icon: Zap },
  { label: 'פרופיל', path: '/profile', icon: User },
  { label: 'הגדרות', path: '/settings', icon: Settings },
]

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, toasts, removeToast } = useAppStore()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

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
      /* ignore */
    }
    clearAuthToken()
    window.location.href = '/auth/login'
  }

  const currentPageLabel = navItems.find(({ path }) => path === location.pathname)?.label || 'דשבורד'
  const fullName = (user as any)?.fullName || 'משתמש'
  const email = (user as any)?.email || ''
  const initial = fullName?.charAt(0)?.toUpperCase() || '?'

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--canvas)', color: 'var(--ink-primary)' }}
      dir="rtl"
    >
      {/* ===== Global top bar (LinkedIn style) ===== */}
      <header
        className="sticky top-0 z-40 bg-white"
        style={{
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        <div className="max-w-[1128px] mx-auto h-[52px] px-4 flex items-center gap-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div
              className="flex h-8 w-8 items-center justify-center rounded font-bold text-white text-[18px]"
              style={{ background: 'var(--brand)' }}
            >
              J
            </div>
            <span
              className="hidden sm:inline text-[18px] font-bold"
              style={{ color: 'var(--brand)' }}
            >
              JobHunter
            </span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-[280px] relative hidden md:block">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--ink-tertiary)' }}
            />
            <input
              type="text"
              placeholder="חיפוש משרות, חברות..."
              className="w-full pr-9 pl-3 py-[6px] text-[14px] rounded"
              style={{
                background: 'var(--subtle)',
                border: '1px solid transparent',
                color: 'var(--ink-primary)',
                height: '34px',
              }}
            />
          </div>

          {/* Top nav — horizontal on desktop */}
          <nav className="hidden lg:flex items-center gap-1 mr-auto">
            {navItems.map(({ label, path, icon: Icon }) => {
              const isActive = location.pathname === path
              return (
                <Link
                  key={path}
                  to={path}
                  className="flex flex-col items-center justify-center gap-0.5 px-4 h-[52px] text-[12px] font-normal transition-colors relative"
                  style={{
                    color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                  }}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className="whitespace-nowrap">{label}</span>
                  {isActive && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-[2px]"
                      style={{ background: 'var(--ink-primary)' }}
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Right cluster — notifications + me */}
          <div className="flex items-center gap-1 mr-auto lg:mr-0">
            <button
              className="flex flex-col items-center justify-center px-3 h-[52px] text-[12px] transition-colors"
              style={{ color: 'var(--ink-secondary)' }}
              aria-label="התראות"
            >
              <Bell size={20} strokeWidth={1.8} />
              <span className="hidden sm:block">התראות</span>
            </button>
            <div className="hidden sm:flex flex-col items-center justify-center px-3 h-[52px] text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
              <div
                className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                style={{ background: 'var(--brand)' }}
              >
                {initial}
              </div>
              <span className="mt-0.5">אני</span>
            </div>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded transition-colors mr-auto"
            style={{ color: 'var(--ink-secondary)' }}
            aria-label="תפריט"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* ===== Body: sidebar + main ===== */}
      <div className="flex-1 max-w-[1128px] w-full mx-auto px-0 lg:px-4 py-0 lg:py-6 flex gap-6">
        {/* Desktop sidebar — profile card */}
        <aside className="hidden lg:block w-[225px] flex-shrink-0 space-y-2">
          {/* Profile card */}
          <div
            className="bg-white rounded-card overflow-hidden"
            style={{
              border: '1px solid var(--border)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
            }}
          >
            {/* Cover */}
            <div
              className="h-[56px]"
              style={{
                background:
                  'linear-gradient(135deg, #0a66c2 0%, #0958a6 50%, #053a70 100%)',
              }}
            />
            {/* Avatar + name */}
            <div className="px-4 pb-4 -mt-8 text-center">
              <div
                className="h-[72px] w-[72px] rounded-full flex items-center justify-center text-white text-[28px] font-bold mx-auto"
                style={{
                  background: 'var(--brand)',
                  border: '3px solid white',
                }}
              >
                {initial}
              </div>
              <h3
                className="mt-2 text-[16px] font-semibold leading-tight"
                style={{ color: 'var(--ink-primary)' }}
              >
                {fullName}
              </h3>
              <p
                className="mt-0.5 text-[12px] truncate"
                style={{ color: 'var(--ink-secondary)' }}
              >
                {email}
              </p>
            </div>
            <div className="divider" />
            <div className="px-4 py-2">
              <div className="flex items-center justify-between text-[12px]">
                <span style={{ color: 'var(--ink-secondary)' }}>משרות נצפו השבוע</span>
                <span className="font-semibold" style={{ color: 'var(--brand)' }}>
                  —
                </span>
              </div>
              <div className="flex items-center justify-between text-[12px] mt-1">
                <span style={{ color: 'var(--ink-secondary)' }}>הגשות פעילות</span>
                <span className="font-semibold" style={{ color: 'var(--brand)' }}>
                  —
                </span>
              </div>
            </div>
          </div>

          {/* Premium upsell mini card */}
          <div
            className="bg-white rounded-card px-4 py-3"
            style={{
              border: '1px solid var(--border)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
            }}
          >
            <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
              שדרוג ל-Premium
            </p>
            <p
              className="text-[13px] font-semibold mt-1 leading-tight"
              style={{ color: 'var(--ink-primary)' }}
            >
              נהל את כל החיפוש במקום אחד ✨
            </p>
          </div>
        </aside>

        {/* Main content column */}
        <main className="flex-1 min-w-0">
          {/* Mobile page title */}
          <div className="lg:hidden px-4 py-3">
            <h1 className="text-[20px] font-bold" style={{ color: 'var(--ink-primary)' }}>
              {currentPageLabel}
            </h1>
          </div>

          <div className="px-4 lg:px-0 pb-8 animate-fade-in">{children}</div>
        </main>

        {/* Desktop right rail — compact logout & quick links */}
        <aside className="hidden xl:block w-[200px] flex-shrink-0 space-y-2">
          <div
            className="bg-white rounded-card p-4"
            style={{
              border: '1px solid var(--border)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
            }}
          >
            <h4
              className="text-[14px] font-semibold mb-2"
              style={{ color: 'var(--ink-primary)' }}
            >
              חשבון
            </h4>
            <Link
              to="/settings"
              className="block text-[13px] py-1 transition-colors"
              style={{ color: 'var(--ink-secondary)' }}
            >
              הגדרות חשבון
            </Link>
            <button
              onClick={handleLogout}
              className="block text-right text-[13px] py-1 transition-colors"
              style={{ color: 'var(--ink-secondary)' }}
            >
              התנתקות
            </button>
          </div>
        </aside>
      </div>

      {/* ===== Mobile drawer ===== */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed top-0 right-0 bottom-0 z-50 w-[280px] bg-white flex flex-col lg:hidden animate-slide-up"
            style={{ borderLeft: '1px solid var(--border)' }}
          >
            {/* Profile header */}
            <div className="p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-white text-[20px] font-bold"
                  style={{ background: 'var(--brand)' }}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[15px] font-semibold truncate"
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    {fullName}
                  </p>
                  <p
                    className="text-[12px] truncate"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    {email}
                  </p>
                </div>
              </div>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-2">
              {navItems.map(({ label, path, icon: Icon }) => {
                const isActive = location.pathname === path
                return (
                  <Link
                    key={path}
                    to={path}
                    className="flex items-center gap-3 px-5 py-3 text-[14px] font-medium transition-colors"
                    style={{
                      color: isActive ? 'var(--brand)' : 'var(--ink-primary)',
                      background: isActive ? 'var(--selected)' : 'transparent',
                      borderRight: isActive ? '3px solid var(--brand)' : '3px solid transparent',
                    }}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                    {label}
                  </Link>
                )
              })}
            </nav>

            {/* Logout */}
            <div className="p-4" style={{ borderTop: '1px solid var(--divider)' }}>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 text-[14px] font-medium rounded transition-colors"
                style={{ color: 'var(--ink-secondary)' }}
              >
                <LogOut size={18} />
                התנתקות
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ===== Toasts ===== */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2" dir="ltr">
          {toasts.map(({ id, message, type }) => {
            const bg =
              type === 'success'
                ? '#057642'
                : type === 'error'
                ? '#cc1016'
                : type === 'warning'
                ? '#b24020'
                : '#0a66c2'
            return (
              <div
                key={id}
                className="animate-slide-up flex items-center gap-3 rounded px-4 py-3 text-white text-[14px] font-medium shadow-modal"
                style={{ background: bg }}
              >
                <span>{message}</span>
                <button
                  onClick={() => removeToast(id)}
                  className="mr-1 rounded p-0.5 hover:bg-white/20"
                  aria-label="סגור"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
