import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/stores/app.store'
import { useSocket } from '@/hooks/useSocket'
import { useToast } from '@/hooks/useToast'
import { profileApi } from '@/services/profile.api'
import { settingsApi } from '@/services/settings.api'
import { isAuthenticated, getAccessToken } from '@/services/api'
import { Layout } from '@/components/common/Layout'
import { CommandPalette } from '@/components/common/CommandPalette'
import { Loading } from '@/components/common/Loading'

// Auth pages
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'

// App pages
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
import Discovery from '@/pages/Discovery'
import AutoPilot from '@/pages/AutoPilot'

/**
 * Wraps routes that require an authenticated user. If the user is not
 * authenticated we redirect to /auth/login and remember where they wanted
 * to go so we can send them back after login.
 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation()
  if (!isAuthenticated()) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  }
  return children
}

/**
 * Wraps the auth routes. If the user is already logged in, skip to the app.
 */
function RedirectIfAuthenticated({ children }: { children: JSX.Element }) {
  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }
  return children
}

function AuthenticatedApp() {
  const { setUser, setTheme } = useAppStore()
  const { success, error } = useToast()
  const token = getAccessToken()

  useSocket(token)

  // Fetch profile on mount
  const { isLoading: profileLoading, data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
    enabled: !!token,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    enabled: !!token,
  })

  useEffect(() => {
    if (profile) setUser(profile)
  }, [profile, setUser])

  useEffect(() => {
    if (settings?.theme) {
      setTheme(settings.theme as 'light' | 'dark' | 'auto')
    }
  }, [settings, setTheme])

  useEffect(() => {
    if (!token) return
    return () => {
      // cleanup placeholder — socket listeners attached elsewhere
    }
  }, [token, success, error])

  if (profileLoading) {
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
        <Route path="/discovery" element={<Discovery />} />
        <Route path="/autopilot" element={<AutoPilot />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette />
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route
        path="/auth/login"
        element={
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/auth/register"
        element={
          <RedirectIfAuthenticated>
            <Register />
          </RedirectIfAuthenticated>
        }
      />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />

      {/* Protected app routes */}
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AuthenticatedApp />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
