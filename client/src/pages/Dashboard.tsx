import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  Zap,
  CheckCheck,
  Calendar,
  Activity,
  MessageSquare,
  Clock,
  ArrowUpRight,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { EmptyState } from '@/components/common/EmptyState'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { scrapeApi } from '@/services/scrape.api'
import { jobsApi } from '@/services/jobs.api'

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

  // Trigger scrape mutation
  const scrapeMutation = useMutation({
    mutationFn: () =>
      scrapeApi.triggerScrape(
        ['React', 'Full Stack', 'Node.js', 'TypeScript', 'Frontend', 'Backend', '×¤××ª××'],
        'Israel'
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

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="animate-slide-up">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
          <Sparkles size={14} className="text-primary-500" />
          <span>AI-powered job hunting - Israel Hi-Tech</span>
        </div>
      </div>

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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon
          return (
            <Card key={card.key} hover className={`animate-slide-up stagger-${index + 1}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {statusLoading ? '...' : card.value}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <ArrowUpRight size={12} className="text-emerald-500" />
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{card.sub}</p>
                  </div>
                </div>
                <div className={`rounded-2xl bg-gradient-to-br ${card.gradient} p-3 shadow-lg ${card.shadowColor}`}>
                  <Icon className="text-white" size={22} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart & Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Jobs per Source Chart */}
          <Card className="animate-slide-up stagger-5">
            <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-white">Jobs by Source</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 163, 175, 0.15)" vertical={false} />
                  <XAxis dataKey="source" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.95)',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      backdropFilter: 'blur(8px)',
                      padding: '12px 16px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} />
                  <Bar dataKey="jobs" fill="url(#blueGradient)" name="Total Jobs" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="active" fill="url(#greenGradient)" name="Active Jobs" radius={[6, 6, 0, 0]} />
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                    <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={Activity}
                title="No data yet"
                description="Trigger a scrape to start collecting jobs from Israeli job platforms"
              />
            )}
          </Card>

          {/* Database Stats Detail */}
          {statusData?.databaseStats && Object.keys(statusData.databaseStats).length > 0 && (
            <Card className="animate-slide-up stagger-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Database Breakdown</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(statusData.databaseStats).map(([source, stats]: [string, any]) => (
                  <div key={source} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {SOURCE_DISPLAY_NAMES[source] || source}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                      {stats?.totalJobs || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {stats?.activeJobs || 0} active
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="animate-slide-up stagger-3">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
            <div className="space-y-2.5">
              <button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending}
                className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-3 text-white font-semibold shadow-md shadow-primary-500/20 hover:shadow-lg hover:shadow-primary-500/30 hover:from-primary-500 hover:to-primary-400 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {scrapeMutation.isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    Trigger Scrape
                  </>
                )}
              </button>
              <button
                onClick={() => navigate('/jobs')}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow transition-all duration-200 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:border-gray-600"
              >
                Browse Jobs
              </button>
              <button
                onClick={() => navigate('/jobs?sort=scrapedAt&order=desc')}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow transition-all duration-200 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:border-gray-600"
              >
                View Latest
              </button>
            </div>
          </Card>

          {/* Source Health */}
          <Card className="animate-slide-up stagger-5">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Source Health</h2>
            {sourceHealth && sourceHealth.length > 0 ? (
              <div className="space-y-2">
                {sourceHealth.map((source) => (
                  <div key={source.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors duration-200 group">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(source.status)}`} />
                        {source.status === 'healthy' && (
                          <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${getStatusDot(source.status)} animate-ping opacity-30`} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{source.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {source.lastJobsFound > 0
                            ? `${source.lastJobsFound} jobs scraped`
                            : source.requiresApiKey
                            ? `Needs ${source.requiresApiKey}`
                            : 'Not scraped yet'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${getStatusColor(source.status)}`}>
                      {source.status === 'healthy' && 'OK'}
                      {source.status === 'degraded' && 'Ready'}
                      {source.status === 'down' && 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading sources...</p>
            )}
          </Card>

          {/* Scrape History */}
          {statusData?.currentStats?.sourceStats && Object.keys(statusData.currentStats.sourceStats).length > 0 && (
            <Card className="animate-slide-up stagger-4">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Last Scrape Results</h2>
              <div className="space-y-3">
                {Object.entries(statusData.currentStats.sourceStats).map(([source, stats]: [string, any]) => (
                  <div key={source} className="group rounded-xl border border-blue-200/60 bg-gradient-to-r from-blue-50 to-indigo-50 p-3.5 transition-all duration-200 hover:shadow-sm hover:border-blue-300/60 dark:border-blue-800/30 dark:from-blue-900/10 dark:to-indigo-900/10 dark:hover:border-blue-700/40">
                    <div className="flex items-start gap-2.5">
                      <div className="rounded-lg bg-blue-100 p-1.5 dark:bg-blue-900/30">
                        <Clock size={14} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">
                          {SOURCE_DISPLAY_NAMES[source] || source}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {stats.count} jobs found
                        </p>
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-300 mt-1">
                          {new Date(stats.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
