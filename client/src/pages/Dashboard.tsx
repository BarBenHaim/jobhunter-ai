import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  Zap,
  CheckCheck,
  Calendar,
  Activity,
  Clock,
  ArrowUpRight,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  Search,
  FileText,
  Eye,
  BarChart3,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { EmptyState } from '@/components/common/EmptyState'
import { scrapeApi } from '@/services/scrape.api'
import { jobsApi } from '@/services/jobs.api'
import { profileApi } from '@/services/profile.api'

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  INDEED: 'Indeed Israel',
  DRUSHIM: 'Drushim',
  ALLJOBS: 'AllJobs',
  GOOGLE_JOBS: 'Google Jobs',
  LINKEDIN: 'LinkedIn',
  GLASSDOOR: 'Glassdoor',
}

const Dashboard = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null)

  // Fetch scrape status (real data)
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['scrape-status'],
    queryFn: async () => {
      const res = await scrapeApi.getStatus()
      return res.data
    },
    refetchInterval: 30000,
  })

  // Fetch sources (real data)
  const { data: sourcesData } = useQuery({
    queryKey: ['scrape-sources'],
    queryFn: async () => {
      const res = await scrapeApi.getSources()
      return res.data.sources
    },
  })

  // Fetch job stats (real data)
  const { data: jobStats } = useQuery({
    queryKey: ['job-stats'],
    queryFn: async () => {
      const res = await jobsApi.getStats()
      return res.data
    },
  })

  // Fetch user profile for preferences (shared cache with other pages)
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Build scraping keywords from user preferences
  const scrapeKeywords = useMemo(() => {
    const defaults = ['React', 'Full Stack', 'Node.js', 'TypeScript', 'Frontend', 'Backend', 'מפתח תוכנה', 'פיתוח']
    const prefs = (profile as any)?.preferences
    if (prefs?.targetRoles && Array.isArray(prefs.targetRoles) && prefs.targetRoles.length > 0) {
      // Use user's target roles + a few essential tech defaults
      const userRoles: string[] = prefs.targetRoles
      const essentialDefaults = ['מפתח תוכנה', 'פיתוח']
      const combined = [...new Set([...userRoles, ...essentialDefaults])]
      return combined
    }
    return defaults
  }, [profile])

  const scrapeLocation = useMemo(() => {
    const prefs = (profile as any)?.preferences
    if (prefs?.preferredLocations && Array.isArray(prefs.preferredLocations) && prefs.preferredLocations.length > 0) {
      return prefs.preferredLocations[0]
    }
    return 'Israel'
  }, [profile])

  // Trigger SMART scrape mutation — AI-powered keyword expansion + local scoring
  const scrapeMutation = useMutation({
    mutationFn: () =>
      scrapeApi.smartTriggerScrape(scrapeLocation).catch(() =>
        // Fallback to basic scrape if smart trigger fails (e.g. no auth, no profile)
        scrapeApi.triggerScrape(scrapeKeywords, scrapeLocation)
      ),
    onSuccess: (res) => {
      setScrapeMessage(`${res.data.totalJobsCreated} new jobs found!`)
      queryClient.invalidateQueries({ queryKey: ['scrape-status'] })
      queryClient.invalidateQueries({ queryKey: ['job-stats'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setTimeout(() => setScrapeMessage(null), 5000)
    },
    onError: (err: any) => {
      setScrapeMessage(`Error: ${err?.response?.data?.error?.message || err.message}`)
      setTimeout(() => setScrapeMessage(null), 5000)
    },
  })

  const totalJobsInDB = statusData?.totalJobsInDB || 0
  const lastScraped = statusData?.lastScraped
  const totalScrapes = statusData?.totalScrapesRun || 0

  // Build stat cards from real data
  const statCards = [
    {
      key: 'totalJobs',
      label: 'Total Jobs in DB',
      value: totalJobsInDB,
      sub: lastScraped ? `Last scraped: ${new Date(lastScraped).toLocaleTimeString()}` : 'Not scraped yet',
      icon: TrendingUp,
      gradient: 'from-blue-500 to-cyan-400',
      shadowColor: 'shadow-blue-500/20',
    },
    {
      key: 'scrapes',
      label: 'Total Scrapes Run',
      value: totalScrapes,
      sub: `${statusData?.availableSources?.length || 0} sources available`,
      icon: Zap,
      gradient: 'from-purple-500 to-pink-400',
      shadowColor: 'shadow-purple-500/20',
    },
    {
      key: 'sources',
      label: 'Active Sources',
      value: sourcesData?.filter((s) => s.available).length || 0,
      sub: `of ${sourcesData?.length || 0} configured`,
      icon: CheckCheck,
      gradient: 'from-emerald-500 to-teal-400',
      shadowColor: 'shadow-emerald-500/20',
    },
    {
      key: 'recent',
      label: 'Last Scrape Jobs',
      value: statusData?.currentStats?.lastJobCount || 0,
      sub: 'new jobs found',
      icon: Calendar,
      gradient: 'from-orange-500 to-amber-400',
      shadowColor: 'shadow-orange-500/20',
    },
  ]

  // Build source health from real data
  const sourceHealth = sourcesData?.map((source) => {
    const stats = statusData?.currentStats?.sourceStats?.[source.id]
    return {
      name: SOURCE_DISPLAY_NAMES[source.id] || source.name,
      id: source.id,
      status: source.available
        ? stats
          ? ('healthy' as const)
          : ('degraded' as const)
        : ('down' as const),
      lastJobsFound: stats?.count || 0,
      lastCheckedAt: stats?.timestamp ? new Date(stats.timestamp) : null,
      available: source.available,
      requiresApiKey: source.requiresApiKey,
    }
  })

  // Build per-source bar chart from DB stats
  const chartData = statusData?.databaseStats
    ? Object.entries(statusData.databaseStats).map(([source, stats]: [string, any]) => ({
        source: SOURCE_DISPLAY_NAMES[source] || source,
        jobs: stats?.totalJobs || 0,
        active: stats?.activeJobs || 0,
      }))
    : []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-emerald-600 dark:text-emerald-400'
      case 'degraded': return 'text-amber-600 dark:text-amber-400'
      case 'down': return 'text-red-500 dark:text-red-400'
      default: return 'text-gray-500'
    }
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-500'
      case 'degraded': return 'bg-amber-500'
      case 'down': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle size={14} className="text-emerald-500" />
      case 'degraded': return <AlertCircle size={14} className="text-amber-500" />
      case 'down': return <XCircle size={14} className="text-red-500" />
      default: return null
    }
  }

  // Fetch recent jobs
  const { data: recentJobs } = useQuery({
    queryKey: ['recent-jobs'],
    queryFn: async () => {
      const res = await jobsApi.list({
        skip: 0,
        limit: 5,
        sortBy: 'scrapedAt',
        order: 'desc',
      })
      return res.data?.jobs || []
    },
  })

  const showOnboardingBanner = totalJobsInDB === 0

  return (
    <div className="space-y-6">
      {/* Section 1: Welcome + Onboarding Banner (RTL) */}
      {showOnboardingBanner && (
        <div className="animate-slide-up rounded-2xl bg-gradient-to-r from-primary-50 to-purple-50 border border-primary-200/50 p-6 dark:from-primary-900/20 dark:to-purple-900/20 dark:border-primary-700/30">
          <div className="text-right" dir="rtl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              ברוכים הבאים ל-JobHunter AI! 🎯
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-5">
              בואו נתחיל: 1) עדכנו את הפרופיל שלכם  2) חפשו משרות  3) צרו CV מותאם
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => navigate('/profile')}
                className="rounded-xl bg-white px-4 py-3 font-semibold text-gray-900 shadow-md hover:shadow-lg hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                עדכן פרופיל
              </button>
              <button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending}
                className="rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-3 font-semibold text-white shadow-md shadow-primary-500/20 hover:shadow-lg hover:from-primary-500 hover:to-primary-400 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {scrapeMutation.isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    משיכה...
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    חפש משרות
                  </>
                )}
              </button>
              <button
                onClick={() => navigate('/cv-generator')}
                className="rounded-xl bg-white px-4 py-3 font-semibold text-gray-900 shadow-md hover:shadow-lg hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                צור CV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrape success/error message */}
      {scrapeMessage && (
        <div className={`rounded-xl p-4 text-sm font-medium animate-slide-up ${
          scrapeMessage.startsWith('Error')
            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
        }`}>
          {scrapeMessage}
        </div>
      )}

      {/* Section 2: Quick Action Cards (2x2 grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Search Jobs Card */}
        <button
          onClick={() => scrapeMutation.mutate()}
          disabled={scrapeMutation.isPending}
          className="group animate-slide-up rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200/50 p-6 text-right hover:shadow-lg hover:border-blue-300/75 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed dark:from-blue-900/20 dark:to-cyan-900/20 dark:border-blue-700/30 dark:hover:border-blue-600/50"
          dir="rtl"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">🔍 חפש משרות חדשות</h3>
              {scrapeMutation.isPending && (
                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  משיכה בעיצומה...
                </p>
              )}
            </div>
            <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/30 group-hover:scale-110 transition-transform duration-200">
              <Search size={24} className="text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          {!scrapeMutation.isPending && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              אתחל משיכה ממקורות משרות בישראל
            </p>
          )}
        </button>

        {/* CV Generator Card */}
        <button
          onClick={() => navigate('/cv-generator')}
          className="group animate-slide-up rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200/50 p-6 text-right hover:shadow-lg hover:border-purple-300/75 transition-all duration-200 active:scale-[0.98] dark:from-purple-900/20 dark:to-pink-900/20 dark:border-purple-700/30 dark:hover:border-purple-600/50 stagger-1"
          dir="rtl"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">📄 צור CV מותאם</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ייצור CV מותאם לכל משרה
              </p>
            </div>
            <div className="rounded-xl bg-purple-100 p-3 dark:bg-purple-900/30 group-hover:scale-110 transition-transform duration-200">
              <FileText size={24} className="text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </button>

        {/* Browse Jobs Card */}
        <button
          onClick={() => navigate('/jobs')}
          className="group animate-slide-up rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/50 p-6 text-right hover:shadow-lg hover:border-emerald-300/75 transition-all duration-200 active:scale-[0.98] dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-700/30 dark:hover:border-emerald-600/50 stagger-2"
          dir="rtl"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">📋 צפה במשרות</h3>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold px-2.5 py-0.5">
                  {totalJobsInDB}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">משרות זמינות</p>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-900/30 group-hover:scale-110 transition-transform duration-200">
              <Eye size={24} className="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </button>

        {/* Applications Card */}
        <button
          onClick={() => navigate('/pipeline')}
          className="group animate-slide-up rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/50 p-6 text-right hover:shadow-lg hover:border-orange-300/75 transition-all duration-200 active:scale-[0.98] dark:from-orange-900/20 dark:to-amber-900/20 dark:border-orange-700/30 dark:hover:border-orange-600/50 stagger-3"
          dir="rtl"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">📊 הגשות שלי</h3>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-full bg-orange-600 text-white text-xs font-bold px-2.5 py-0.5">
                  {jobStats?.submittedCount || 0}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">הגשות</p>
              </div>
            </div>
            <div className="rounded-xl bg-orange-100 p-3 dark:bg-orange-900/30 group-hover:scale-110 transition-transform duration-200">
              <BarChart3 size={24} className="text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </button>
      </div>

      {/* Salary Estimates & Career Direction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-slide-up">
        {/* Salary Estimates by Role */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4" dir="rtl">💰 הערכות שכר לפי תחום</h2>
          <div className="space-y-3" dir="rtl">
            {[
              { role: 'Full Stack Developer', range: '18,000-28,000', avg: '22,000', color: 'bg-blue-500', width: '75%' },
              { role: 'Frontend Developer', range: '16,000-26,000', avg: '20,000', color: 'bg-cyan-500', width: '68%' },
              { role: 'Backend Developer', range: '18,000-30,000', avg: '23,000', color: 'bg-indigo-500', width: '78%' },
              { role: 'DevOps Engineer', range: '22,000-35,000', avg: '28,000', color: 'bg-purple-500', width: '90%' },
              { role: 'Team Lead', range: '28,000-42,000', avg: '34,000', color: 'bg-emerald-500', width: '95%' },
              { role: 'AI/ML Engineer', range: '25,000-40,000', avg: '32,000', color: 'bg-pink-500', width: '92%' },
            ].map((item) => (
              <div key={item.role}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.role}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">₪{item.range}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className={`h-full rounded-full ${item.color} transition-all duration-500`} style={{ width: item.width }} />
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">* הערכה לשוק ההייטק בישראל, שכר ברוטו חודשי</p>
          </div>
        </Card>

        {/* Career Direction */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4" dir="rtl">🧭 המלצת כיוון קריירה</h2>
          <div className="space-y-4" dir="rtl">
            <div className="p-4 rounded-xl bg-gradient-to-l from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border border-primary-200/50 dark:border-primary-700/30">
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Full Stack Developer</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                הכיוון הכי מבוקש בשוק. שילוב של React + Node.js פותח את הדלתות לרוב המשרות בהייטק הישראלי.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium dark:bg-green-900/30 dark:text-green-400">ביקוש גבוה</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium dark:bg-blue-900/30 dark:text-blue-400">צמיחה 15%</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">כיוונים נוספים מומלצים:</h4>
              {[
                { dir: 'DevOps / Cloud Engineer', reason: 'שכר גבוה, ביקוש קבוע, מעבר קל מפיתוח', trend: '↑' },
                { dir: 'Tech Lead', reason: 'צמיחה טבעית לאחר 4-5 שנות ניסיון', trend: '↑' },
                { dir: 'AI/ML Engineer', reason: 'תחום צומח עם שכר פרימיום', trend: '🚀' },
              ].map((item) => (
                <div key={item.dir} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-lg">{item.trend}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.dir}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate('/profile')}
              className="w-full text-sm text-primary-600 dark:text-primary-400 font-medium hover:text-primary-700 dark:hover:text-primary-300 transition-colors py-2"
            >
              עדכן את הפרופיל לקבלת המלצות מותאמות אישית →
            </button>
          </div>
        </Card>
      </div>

      {/* Section 3: Stats Summary (compact row) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((card, index) => {
          const Icon = card.icon
          return (
            <Card key={card.key} hover className={`animate-slide-up`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {statusLoading ? '...' : card.value}
                  </p>
                </div>
                <div className={`rounded-lg bg-gradient-to-br ${card.gradient} p-2 shadow-md ${card.shadowColor} flex-shrink-0`}>
                  <Icon className="text-white" size={16} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Section 4: Recent Jobs Preview */}
      {recentJobs && recentJobs.length > 0 && (
        <div className="animate-slide-up">
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white" dir="rtl">
              🔥 המשרות האחרונות
            </h2>
            <div className="space-y-3">
              {recentJobs.map((job: any) => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="group w-full rounded-xl border border-gray-200/50 bg-white/50 p-4 text-right hover:bg-primary-50/50 hover:border-primary-200/75 transition-all duration-200 dark:border-gray-700/50 dark:bg-gray-800/30 dark:hover:bg-primary-900/20 dark:hover:border-primary-700/50"
                  dir="rtl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                        {job.title}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span>{job.company}</span>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {job.source}
                        </span>
                      </div>
                    </div>
                    <ArrowUpRight size={18} className="text-gray-400 group-hover:text-primary-600 transition-colors flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate('/jobs')}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 transition-colors dark:text-primary-400 dark:hover:bg-primary-900/20"
              dir="rtl"
            >
              צפה בכל המשרות
            </button>
          </Card>
        </div>
      )}

      {/* Section 5: Source Health (compact) */}
      {sourceHealth && sourceHealth.length > 0 && (
        <div className="animate-slide-up">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">מצב המקורות</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {sourceHealth.map((source) => (
                <div key={source.id} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 flex items-start gap-2.5">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <div className={`w-2 h-2 rounded-full ${getStatusDot(source.status)}`} />
                    {source.status === 'healthy' && (
                      <div className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusDot(source.status)} animate-ping opacity-30`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{source.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {source.lastJobsFound > 0 ? `${source.lastJobsFound} jobs` : 'Ready'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default Dashboard
