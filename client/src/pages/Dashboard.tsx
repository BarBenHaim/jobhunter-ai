import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  FileText,
  Eye,
  BarChart3,
  Loader2,
  ArrowUpRight,
  Cpu,
  Globe,
  DollarSign,
  Clock,
  Zap,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react'
import { scrapeApi } from '@/services/scrape.api'
import { jobsApi } from '@/services/jobs.api'
import { profileApi } from '@/services/profile.api'
import { costsApi, CostData, CostHistory } from '@/services/costs.api'

// ─── Helpers ──────────────────────────────────────────────
const fmt$ = (n: number) => {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  if (n === 0) return '$0.00'
  return `$${n.toFixed(4)}`
}

const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const fmtTime = (ts: string) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

const SOURCE_NAMES: Record<string, string> = {
  INDEED: 'Indeed',
  DRUSHIM: 'Drushim',
  ALLJOBS: 'AllJobs',
  GOOGLE_JOBS: 'Google Jobs',
  LINKEDIN: 'LinkedIn',
  GLASSDOOR: 'Glassdoor',
}

// ─── Sub-components ──────────────────────────────────────

/** Small stat box */
const StatBox = ({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string
}) => (
  <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50">
    <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
      <Icon size={18} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  </div>
)

/** Cost breakdown bar */
const CostBar = ({ label, amount, total, color, detail }: {
  label: string; amount: number; total: number; color: string; detail?: string
}) => {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
          <span className="text-gray-700 dark:text-gray-300 font-medium">{label}</span>
        </div>
        <div className="text-left">
          <span className="font-semibold text-gray-900 dark:text-white">{fmt$(amount)}</span>
          {detail && <span className="text-xs text-gray-400 mr-1.5">{detail}</span>}
        </div>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/50 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Call history timeline item */
const HistoryItem = ({ type, cost, time, detail }: {
  type: 'ai' | 'search'; cost: number; time: string; detail?: string
}) => (
  <div className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-700/30 last:border-0">
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
      type === 'ai' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
    }`}>
      {type === 'ai'
        ? <Cpu size={14} className="text-purple-600 dark:text-purple-400" />
        : <Globe size={14} className="text-blue-600 dark:text-blue-400" />
      }
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-gray-700 dark:text-gray-300">{type === 'ai' ? 'Claude AI' : 'SerpAPI Search'}</p>
      {detail && <p className="text-xs text-gray-400 dark:text-gray-500">{detail}</p>}
    </div>
    <div className="text-left flex-shrink-0">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt$(cost)}</p>
      <p className="text-[10px] text-gray-400">{time}</p>
    </div>
  </div>
)

// ─── Main Dashboard ──────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null)
  const [costDetailOpen, setCostDetailOpen] = useState(false)

  // ─── Queries ─────────────────────────────────────────
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['scrape-status'],
    queryFn: async () => { const res = await scrapeApi.getStatus(); return res.data },
    refetchInterval: 30000,
  })

  const { data: sourcesData } = useQuery({
    queryKey: ['scrape-sources'],
    queryFn: async () => { const res = await scrapeApi.getSources(); return res.data.sources },
  })

  const { data: jobStats } = useQuery({
    queryKey: ['job-stats'],
    queryFn: async () => { const res = await jobsApi.getStats(); return res.data },
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const { data: recentJobs } = useQuery({
    queryKey: ['recent-jobs'],
    queryFn: async () => {
      const res = await jobsApi.list({ skip: 0, limit: 5, sortBy: 'scrapedAt', order: 'desc' })
      return res.data?.jobs || []
    },
  })

  const { data: costs, refetch: refetchCosts } = useQuery({
    queryKey: ['costs-today'],
    queryFn: () => costsApi.getToday(),
    refetchInterval: 30000,
  })

  const { data: costHistory } = useQuery({
    queryKey: ['costs-history'],
    queryFn: () => costsApi.getHistory(),
    refetchInterval: 60000,
    enabled: costDetailOpen,
  })

  // ─── Scrape mutation ─────────────────────────────────
  const scrapeKeywords = useMemo(() => {
    const defaults = ['React', 'Full Stack', 'Node.js', 'TypeScript', 'Frontend', 'Backend', 'מפתח תוכנה', 'פיתוח']
    const prefs = (profile as any)?.preferences
    if (prefs?.targetRoles?.length > 0) {
      return [...new Set([...prefs.targetRoles, 'מפתח תוכנה', 'פיתוח'])]
    }
    return defaults
  }, [profile])

  const scrapeLocation = useMemo(() => {
    const prefs = (profile as any)?.preferences
    return prefs?.preferredLocations?.[0] || 'Israel'
  }, [profile])

  const scrapeMutation = useMutation({
    mutationFn: () =>
      scrapeApi.smartTriggerScrape(scrapeLocation).catch(() =>
        scrapeApi.triggerScrape(scrapeKeywords, scrapeLocation)
      ),
    onSuccess: (res) => {
      setScrapeMessage(`נמצאו ${res.data.totalJobsCreated} משרות חדשות!`)
      queryClient.invalidateQueries({ queryKey: ['scrape-status'] })
      queryClient.invalidateQueries({ queryKey: ['job-stats'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['costs-today'] })
      setTimeout(() => setScrapeMessage(null), 5000)
    },
    onError: (err: any) => {
      setScrapeMessage(`שגיאה: ${err?.response?.data?.error?.message || err.message}`)
      setTimeout(() => setScrapeMessage(null), 5000)
    },
  })

  // ─── Derived data ────────────────────────────────────
  const totalJobs = statusData?.totalJobsInDB || 0
  const lastScraped = statusData?.lastScraped
  const totalScrapes = statusData?.totalScrapesRun || 0
  const activeSources = sourcesData?.filter((s: any) => s.available).length || 0
  const showOnboarding = totalJobs === 0

  // Build merged + sorted history timeline
  const timeline = useMemo(() => {
    if (!costHistory) return []
    const items: { type: 'ai' | 'search'; cost: number; time: string; detail?: string }[] = []
    for (const c of costHistory.anthropic) {
      items.push({
        type: 'ai',
        cost: c.cost,
        time: fmtTime(c.timestamp),
        detail: `${fmtTokens(c.inputTokens)} in / ${fmtTokens(c.outputTokens)} out`,
      })
    }
    for (const c of costHistory.serpapi) {
      items.push({ type: 'search', cost: c.cost, time: fmtTime(c.timestamp) })
    }
    return items.sort((a, b) => (b.time > a.time ? 1 : -1)).slice(0, 20)
  }, [costHistory])

  // Source health
  const sourceHealth = sourcesData?.map((source: any) => {
    const stats = statusData?.currentStats?.sourceStats?.[source.id]
    return {
      id: source.id,
      name: SOURCE_NAMES[source.id] || source.name,
      ok: source.available,
      jobs: stats?.count || 0,
    }
  })

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-5xl mx-auto" dir="rtl">

      {/* Onboarding */}
      {showOnboarding && (
        <div className="rounded-2xl bg-gradient-to-l from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border border-primary-200/50 dark:border-primary-700/30 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">ברוכים הבאים ל-JobHunter AI</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">עדכנו פרופיל → חפשו משרות → צרו CV מותאם</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => navigate('/profile')} className="px-4 py-2 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white shadow-sm hover:shadow transition-all">עדכן פרופיל</button>
            <button onClick={() => scrapeMutation.mutate()} disabled={scrapeMutation.isPending} className="px-4 py-2 rounded-xl bg-primary-600 text-sm font-medium text-white shadow-sm hover:bg-primary-500 transition-all disabled:opacity-60 flex items-center gap-1.5">
              {scrapeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              חפש משרות
            </button>
            <button onClick={() => navigate('/cv-generator')} className="px-4 py-2 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white shadow-sm hover:shadow transition-all">צור CV</button>
          </div>
        </div>
      )}

      {/* Scrape message */}
      {scrapeMessage && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          scrapeMessage.startsWith('שגיאה')
            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
        }`}>{scrapeMessage}</div>
      )}

      {/* Quick Actions (2x2) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => scrapeMutation.mutate()}
          disabled={scrapeMutation.isPending}
          className="group p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all text-right disabled:opacity-60"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            {scrapeMutation.isPending ? <Loader2 size={16} className="text-white animate-spin" /> : <Search size={16} className="text-white" />}
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">חפש משרות</p>
          <p className="text-xs text-gray-400 mt-0.5">חיפוש חכם מכל המקורות</p>
        </button>

        <button
          onClick={() => navigate('/jobs')}
          className="group p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-md transition-all text-right"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Eye size={16} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">צפה במשרות</p>
          <p className="text-xs text-gray-400 mt-0.5">{totalJobs} במאגר</p>
        </button>

        <button
          onClick={() => navigate('/cv-generator')}
          className="group p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md transition-all text-right"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <FileText size={16} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">צור CV</p>
          <p className="text-xs text-gray-400 mt-0.5">CV מותאם למשרה</p>
        </button>

        <button
          onClick={() => navigate('/pipeline')}
          className="group p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 hover:border-orange-300 dark:hover:border-orange-600 hover:shadow-md transition-all text-right"
        >
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BarChart3 size={16} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">הגשות</p>
          <p className="text-xs text-gray-400 mt-0.5">{jobStats?.submittedCount || 0} הגשות</p>
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="משרות במאגר" value={statusLoading ? '...' : totalJobs} icon={TrendingUp} color="bg-blue-500"
          sub={lastScraped ? `עדכון: ${new Date(lastScraped).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : undefined} />
        <StatBox label="חיפושים שבוצעו" value={totalScrapes} icon={Zap} color="bg-purple-500" />
        <StatBox label="מקורות פעילים" value={`${activeSources}/${sourcesData?.length || 0}`} icon={Globe} color="bg-emerald-500" />
        <StatBox label="עלות היום" value={costs ? fmt$(costs.total) : '...'} icon={DollarSign} color="bg-amber-500"
          sub={costs ? `${costs.anthropic.calls + costs.serpapi.calls} קריאות API` : undefined} />
      </div>

      {/* Cost Tracking Panel */}
      <div className="rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <button
          onClick={() => setCostDetailOpen(!costDetailOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <DollarSign size={18} className="text-white" />
            </div>
            <div className="text-right">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">עלויות ושימוש API</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {costs ? `${fmt$(costs.total)} היום • ${costs.anthropic.calls} קריאות AI • ${costs.serpapi.calls} חיפושים` : 'טוען...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {costs && costs.total > 0 && (
              <span className="text-lg font-bold text-gray-900 dark:text-white">{fmt$(costs.total)}</span>
            )}
            {costDetailOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </div>
        </button>

        {costDetailOpen && costs && (
          <div className="border-t border-gray-100 dark:border-gray-700/50 p-4 space-y-5">
            {/* Cost breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">פירוט עלויות</h4>
              <CostBar
                label="Claude AI (Anthropic)"
                amount={costs.anthropic.cost}
                total={costs.total || 1}
                color="bg-purple-500"
                detail={`${costs.anthropic.calls} קריאות`}
              />
              <CostBar
                label="SerpAPI (חיפוש Google)"
                amount={costs.serpapi.cost}
                total={costs.total || 1}
                color="bg-blue-500"
                detail={`${costs.serpapi.calls} חיפושים`}
              />
            </div>

            {/* Token usage */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtTokens(costs.anthropic.inputTokens)}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Input Tokens</p>
                <p className="text-[10px] text-gray-400">{fmt$(costs.anthropic.inputTokens * 3 / 1_000_000)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtTokens(costs.anthropic.outputTokens)}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Output Tokens</p>
                <p className="text-[10px] text-gray-400">{fmt$(costs.anthropic.outputTokens * 15 / 1_000_000)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{costs.serpapi.calls}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">SerpAPI Credits</p>
                <p className="text-[10px] text-gray-400">$0.01/credit</p>
              </div>
            </div>

            {/* Call history timeline */}
            {timeline.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">היסטוריית קריאות</h4>
                <div className="max-h-56 overflow-y-auto rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3">
                  {timeline.map((item, i) => (
                    <HistoryItem key={i} {...item} />
                  ))}
                </div>
              </div>
            )}

            {/* Pricing info */}
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>תמחור:</strong> Claude Sonnet — $3/M input, $15/M output tokens • SerpAPI — $0.01 לחיפוש (2 credits)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Two columns: Recent Jobs + Source Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Jobs */}
        {recentJobs && recentJobs.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">משרות אחרונות</h3>
              <button onClick={() => navigate('/jobs')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">הכל</button>
            </div>
            <div className="space-y-1">
              {recentJobs.map((job: any) => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/jobs`)}
                  className="group w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors text-right"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{job.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{job.company}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {SOURCE_NAMES[job.source] || job.source}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Source Health */}
        {sourceHealth && sourceHealth.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">מצב מקורות</h3>
            <div className="space-y-2">
              {sourceHealth.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/40">
                  <div className="relative flex-shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {s.ok && <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-30" />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{s.name}</span>
                  <span className="text-xs text-gray-400">{s.jobs > 0 ? `${s.jobs} jobs` : s.ok ? 'Ready' : 'Down'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
