import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/stores/app.store'
import { useSocket } from '@/hooks/useSocket'
import { useToast } from '@/hooks/useToast'
import { profileApi } from '@/services/profile.api'
import { settingsApi } from '@/services/settings.api'
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

  // Demo mode login handler
  const handleDemoLogin = () => {
    // Set a demo token so the app proceeds past login
    localStorage.setItem('token', 'demo-token')
    // Set demo user in store
    setUser({
      id: 'demo-user',
      fullName: 'Demo User',
      email: 'demo@jobhunter.ai',
      phone: '',
      location: 'Tel Aviv, Israel',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      summary: 'Full-stack developer with 5+ years of experience',
      skills: ['React', 'TypeScript', 'Node.js', 'Python', 'PostgreSQL'],
      experience: [],
      education: [],
      languages: ['English', 'Hebrew'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)
    // Force re-render
    window.location.reload()
  }

  // If not authenticated, show a premium login prompt
  if (!token) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 via-primary-950 to-purple-950">
        {/* Animated background orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-3xl" />

        <div className="relative animate-scale-in rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur-xl shadow-2xl max-w-md w-full mx-4">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-purple-500 shadow-lg shadow-primary-500/30">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">JobHunter AI</h1>
          <p className="mt-3 text-gray-300/80 text-lg">AI-Powered Job Search & Application System</p>

          <button
            onClick={handleDemoLogin}
            className="mt-8 w-full rounded-2xl bg-gradient-to-r from-primary-500 to-purple-500 px-8 py-3.5 text-white font-semibold text-lg shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:from-primary-400 hover:to-purple-400 transition-all duration-300 active:scale-[0.98]"
          >
            Enter Demo Mode
          </button>
          <p className="mt-4 text-sm text-gray-500">No backend needed â explore with mock data</p>
        </div>
      </div>
    )
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette />
    </Layout>
  )
}
