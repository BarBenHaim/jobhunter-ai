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

    return () => {
      // Cleanup listeners
    }
  }, [token, success, error])

  // Demo mode login handler
  const handleDemoLogin = () => {
    localStorage.setItem('token', 'demo-token')
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
    })
    window.location.reload()
  }

  // If not authenticated, show a simple login prompt
  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800">
        <div className="rounded-lg bg-white p-8 text-center shadow-xl dark:bg-gray-900">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">JobHunter AI</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">AI-Powered Job Search & Application System</p>
          <button
            onClick={handleDemoLogin}
            className="mt-6 rounded-lg bg-primary-600 px-6 py-2 text-white hover:bg-primary-700 transition-colors"
          >
            Enter Demo Mode
          </button>
          <p className="mt-3 text-xs text-gray-400">No backend needed — explore with mock data</p>
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
