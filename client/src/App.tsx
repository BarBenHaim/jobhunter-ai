import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/stores/app.store'
import { useSocket } from '@/hooks/useSocket'
import { useToast } from '@/hooks/useToast'
import { profileApi } from '@/services/profile.api'
import { settingsApi } from '@/services/settings.api'
import { setAuthToken } from '@/services/api'
import { Layout } from '@/components/common/Layout'
import { CommandPalette } from '@/components/common/CommandPalette'
import { Loading } from '@/components/common/Loading'

// Page imports
import Dashboard from '@/pages/Dashboard'
import JobBrowser from '@/pages/JobBrowser'
import JobDetail from '@/pages/JobDetail'
import Pipeline from '@/pages/Pipeline'
import ReviewQueue from '@/pages/ReviewQueue'
import PersonaManager from '@/pages/PersonaManager'
import PersonaDetail from '@/pages/PersonaDetail'
import Profile from '@/pages/Profile'
import Analytics from '@/pages/Analytics'
import Settings from '@/pages/Settings'
import CVGenerator from '@/pages/CVGenerator'
import Guide from '@/pages/Guide'
import Intelligence from '@/pages/Intelligence'

// Auth Screen Component
function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleDemoLogin = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const res = await fetch(`${apiBase}/auth/demo-login`, { method: 'POST' })
      const data = await res.json()
      if (data.success && data.token) {
        setAuthToken(data.token)
        window.location.reload()
        return
      }
    } catch (e) {
      console.warn('Backend not available, falling back to demo mode', e)
    }
    // Fallback: offline demo mode
    localStorage.setItem('token', 'demo-token')
    window.location.reload()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg('')

    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const endpoint = isRegistering ? '/auth/register' : '/auth/login'
      const payload = isRegistering
        ? { email, password, fullName }
        : { email, password }

      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || data.message || 'Authentication failed')
        setIsLoading(false)
        return
      }

      if (data.token) {
        setAuthToken(data.token)
        window.location.reload()
      }
    } catch (error: any) {
      setErrorMsg('Failed to connect to server. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 via-primary-950 to-purple-950">
      {/* Animated background orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-3xl" />

      <div className="relative animate-scale-in rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur-xl shadow-2xl max-w-md w-full mx-4">
        {/* Logo */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-purple-500 shadow-lg shadow-primary-500/30">
          <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-white tracking-tight">JobHunter AI</h1>
        <p className="mt-3 text-gray-300/80 text-lg">AI-Powered Job Search & Application System</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-500/10 border border-error-500/30 text-error-300 text-sm">
              {errorMsg}
            </div>
          )}

          {isRegistering && (
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required={isRegistering}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-primary-500/50 transition-colors"
            />
          )}

          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-primary-500/50 transition-colors"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-primary-500/50 transition-colors"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl bg-gradient-to-r from-primary-500 to-purple-500 px-8 py-3.5 text-white font-semibold text-lg shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:from-primary-400 hover:to-purple-400 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : isRegistering ? 'Create Account' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering)
              setErrorMsg('')
              setEmail('')
              setPassword('')
              setFullName('')
            }}
            className="w-full text-sm text-gray-300 hover:text-white transition-colors py-2"
          >
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>
        </form>

        {/* Quick Demo Link */}
        <button
          onClick={handleDemoLogin}
          className="mt-6 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          Or continue as <span className="text-primary-400 font-medium">Quick Demo</span>
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { user, setUser, theme, setTheme } = useAppStore()
  const { success, error } = useToast()

  // Get JWT token from localStorage
  const token = localStorage.getItem('token')

  // Initialize socket connection
  useSocket(token)

  const isDemo = token === 'demo-token'

  // Fetch profile on mount (skip for demo mode)
  const { isLoading: profileLoading, data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
    enabled: !!token && !isDemo,
    retry: 1,
  })

  // Fetch settings to get theme preference (skip for demo mode)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    enabled: !!token && !isDemo,
  })

  // Update user in store when profile changes
  useEffect(() => {
    if (profile) {
      setUser(profile)
    }
  }, [profile, setUser])

  // Set theme from settings
  useEffect(() => {
    if (settings?.theme) {
      setTheme(settings.theme as 'light' | 'dark' | 'auto')
    }
  }, [settings, setTheme])

  // Setup socket event listeners
  useEffect(() => {
    if (!token) return

    const handleJobNew = (job: any) => {
      success(`New job found: ${job.title}`)
    }

    const handleApplicationSubmitted = (app: any) => {
      success(`Application submitted to ${app.company}`)
    }

    const handleScraperError = (data: any) => {
      error(`Scraper error for ${data.source}: ${data.error}`)
    }

    // These would be actual socket listeners in production
    // For now, we're just setting up the structure

    return () => {
      // Cleanup listeners
    }
  }, [token, success, error])

  // If not authenticated, show login/register screen
  if (!token) {
    return <AuthScreen />
  }

  // Show loading state while fetching profile (skip for demo mode)
  if (profileLoading && !isDemo) {
    return <Loading message="Loading your profile..." />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/jobs" element={<JobBrowser />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/review" element={<ReviewQueue />} />
        <Route path="/personas" element={<PersonaManager />} />
        <Route path="/personas/:id" element={<PersonaDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/cv-generator" element={<CVGenerator />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/intelligence" element={<Intelligence />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette />
    </Layout>
  )
}
