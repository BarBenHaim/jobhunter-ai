import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  FileText,
  Eye,
  BarChart3,
  Loader2,
  Cpu,
  Globe,
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Settings2,
  Plus,
  X,
  MapPin,
  Sparkles,
  Award,
  Target,
  Briefcase,
  CheckCircle,
  Circle,
  ArrowUpRight,
  Wallet,
  Zap,
} from 'lucide-react'
import { scrapeApi, SearchConfig } from '@/services/scrape.api'
import { profileApi } from '@/services/profile.api'
import { costsApi } from '@/services/costs.api'
import { dashboardApi } from '@/services/dashboard.api'
import { autopilotApi } from '@/services/autopilot.api'

// ─── Helpers ──────────────────────────────────────────────
const fmt$ = (n: number) => {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  if (n === 0) return '$0.00'
  return `$${n.toFixed(4)}`
}

const fmtNIS = (n: number) =>
  `₪${n.toLocaleString('he-IL')}`

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

const EXP_LABELS: Record<string, string> = {
  junior: 'ג׳וניור',
  mid: 'מידל',
  senior: 'סניור',
}

const ALL_SOURCES = [
  { id: 'INDEED', name: 'Indeed', icon: '🔍' },
  { id: 'DRUSHIM', name: 'Drushim', icon: '🇮🇱' },
  { id: 'ALLJOBS', name: 'AllJobs', icon: '📋' },
  { id: 'GOOGLE_JOBS', name: 'Google Jobs', icon: '🌐' },
  { id: 'COMPANY_CAREER_PAGE', name: 'Career Pages', icon: '🏢' },
  { id: 'TOP_COMPANIES', name: 'Top Companies', icon: '⭐' },
]

const EXPERIENCE_LEVELS = [
  { value: '', label: 'הכל' },
  { value: 'ENTRY', label: 'Entry Level' },
  { value: 'JUNIOR', label: 'Junior' },
  { value: 'MID', label: 'Mid Level' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'LEAD', label: 'Lead / Staff' },
]

const MIN_SCORE_OPTIONS = [
  { value: 0, label: 'ללא מינימום' },
  { value: 40, label: '40% ומעלה' },
  { value: 50, label: '50% ומעלה' },
  { value: 60, label: '60% ומעלה' },
  { value: 70, label: '70% ומעלה' },
  { value: 80, label: '80% ומעלה' },
]

// ─── Score ring ──────────────────────────────────────────
const ScoreRing = ({ value, size = 44, stroke = 4, color }: {
  value: number; size?: number; stroke?: number; color?: string
}) => {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  const c = color || (value >= 70 ? '#057642' : value >= 50 ? '#b45309' : '#b24020')
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={c} strokeWidth={stroke} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="transform rotate-90 origin-center"
        style={{ fontSize: size * 0.28, fontWeight: 700, fill: 'var(--ink-primary)' }}
      >
        {value}
      </text>
    </svg>
  )
}

// ─── Cost bar ───────────────────────────────────────────
const CostBar = ({ label, amount, total, color, detail }: {
  label: string; amount: number; total: number; color: string; detail?: string
}) => {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
          <span style={{ color: 'var(--ink-secondary)' }}>{label}</span>
        </div>
        <div className="text-left">
          <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{fmt$(amount)}</span>
          {detail && <span className="text-xs mr-1.5" style={{ color: 'var(--ink-tertiary)' }}>{detail}</span>}
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null)
  const [costDetailOpen, setCostDetailOpen] = useState(false)
  const [searchConfigOpen, setSearchConfigOpen] = useState(false)

  // Search configuration state
  const [enabledSources, setEnabledSources] = useState<string[]>([])
  const [minScore, setMinScore] = useState<number>(0)
  const [searchLocation, setSearchLocation] = useState<string>('')
  const [customKeywords, setCustomKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')

  // ─── Queries ─────────────────────────────────────────
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['dashboard-insights'],
    queryFn: () => dashboardApi.getInsights(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['scrape-status'],
    queryFn: async () => { const res = await scrapeApi.getStatus(); return res.data },
    refetchInterval: 30000,
  })

  const { data: sourcesData } = useQuery({
    queryKey: ['scrape-sources'],
    queryFn: async () => { const res = await scrapeApi.getSources(); return res.data.sources },
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const { data: costs } = useQuery({
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

  const { data: apStatus } = useQuery({
    queryKey: ['autopilot-status'],
    queryFn: () => autopilotApi.getStatus(),
    refetchInterval: 30000,
  })

  // ─── Scrape mutation ─────────────────────────────────
  const defaultKeywords = useMemo(() => {
    const defaults = ['React', 'Full Stack', 'Node.js', 'TypeScript', 'Frontend', 'Backend', 'מפתח תוכנה', 'פיתוח']
    const prefs = (profile as any)?.preferences
    if (prefs?.targetRoles?.length > 0) {
      return [...new Set([...prefs.targetRoles, 'מפתח תוכנה', 'פיתוח'])]
    }
    return defaults
  }, [profile])

  const defaultLocation = useMemo(() => {
    const prefs = (profile as any)?.preferences
    return prefs?.preferredLocations?.[0] || 'Israel'
  }, [profile])

  const buildSearchConfig = useCallback((): SearchConfig => {
    const config: SearchConfig = {}
    if (enabledSources.length > 0) config.sources = enabledSources
    if (minScore > 0) config.minScore = minScore
    if (searchLocation.trim()) config.location = searchLocation.trim()
    else config.location = defaultLocation
    if (customKeywords.length > 0) config.keywords = customKeywords
    if (experienceLevel) config.experienceLevel = experienceLevel
    return config
  }, [enabledSources, minScore, searchLocation, customKeywords, experienceLevel, defaultLocation])

  const [lastSearchResult, setLastSearchResult] = useState<{
    sessionId: string; count: number; keywords: string[]
    smartKeywords?: { primary?: string[]; adjacent?: string[]; hebrew?: string[] }
    sourceBreakdown: { source: string; scrapedCount: number }[]
    totalScraped: number; totalFiltered: number; duplicates: number
    avgScore: number; location: string
  } | null>(null)

  const scrapeMutation = useMutation({
    mutationFn: () => {
      const config = buildSearchConfig()
      return scrapeApi.smartTriggerScrape(config).catch(() =>
        scrapeApi.triggerScrape(customKeywords.length > 0 ? customKeywords : defaultKeywords, config.location || defaultLocation)
      )
    },
    onSuccess: (res) => {
      const d = res.data
      setLastSearchResult(d.searchSessionId ? {
        sessionId: d.searchSessionId,
        count: d.totalJobsCreated,
        keywords: d.keywords || [],
        smartKeywords: d.smartKeywords,
        sourceBreakdown: d.sourceBreakdown || [],
        totalScraped: d.totalScraped || 0,
        totalFiltered: d.totalFiltered || 0,
        duplicates: d.duplicates || 0,
        avgScore: d.jobsCreated?.length > 0
          ? Math.round(d.jobsCreated.reduce((s: number, j: any) => s + (j.smartScore || 0), 0) / d.jobsCreated.length)
          : 0,
        location: d.location || '',
      } : null)
      setScrapeMessage(`נמצאו ${d.totalJobsCreated} משרות חדשות!`)
      queryClient.invalidateQueries({ queryKey: ['scrape-status'] })
      queryClient.invalidateQueries({ queryKey: ['job-stats'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-insights'] })
      queryClient.invalidateQueries({ queryKey: ['costs-today'] })
      setTimeout(() => setScrapeMessage(null), 12000)
    },
    onError: (err: any) => {
      setScrapeMessage(`שגיאה: ${err?.response?.data?.error?.message || err.message}`)
      setTimeout(() => setScrapeMessage(null), 5000)
    },
  })

  const addKeyword = () => {
    const kw = keywordInput.trim()
    if (kw && !customKeywords.includes(kw)) setCustomKeywords(prev => [...prev, kw])
    setKeywordInput('')
  }
  const removeKeyword = (kw: string) => setCustomKeywords(prev => prev.filter(k => k !== kw))
  const toggleSource = (sourceId: string) =>
    setEnabledSources(prev => prev.includes(sourceId) ? prev.filter(s => s !== sourceId) : [...prev, sourceId])

  // ─── Derived data ────────────────────────────────────
  const totalJobs = statusData?.totalJobsInDB || 0
  const lastScraped = statusData?.lastScraped
  const showOnboarding = totalJobs === 0

  // Cost timeline
  const timeline = useMemo(() => {
    if (!costHistory) return []
    const items: { type: 'ai' | 'search'; cost: number; time: string; detail?: string }[] = []
    for (const c of costHistory.anthropic) {
      items.push({ type: 'ai', cost: c.cost, time: fmtTime(c.timestamp), detail: `${fmtTokens(c.inputTokens)} in / ${fmtTokens(c.outputTokens)} out` })
    }
    for (const c of costHistory.serpapi) {
      items.push({ type: 'search', cost: c.cost, time: fmtTime(c.timestamp) })
    }
    return items.sort((a, b) => (b.time > a.time ? 1 : -1)).slice(0, 15)
  }, [costHistory])

  // Source health
  const sourceHealth = sourcesData?.map((source: any) => {
    const stats = statusData?.currentStats?.sourceStats?.[source.id]
    return { id: source.id, name: SOURCE_NAMES[source.id] || source.name, ok: source.available, jobs: stats?.count || 0 }
  })

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-5xl mx-auto" dir="rtl">

      {/* Onboarding */}
      {showOnboarding && (
        <div
          className="rounded-card p-5"
          style={{ background: 'linear-gradient(135deg, #eaf2fb 0%, #f4f9ff 100%)', border: '1px solid #cfe3fa' }}
        >
          <h2 className="text-[20px] font-bold mb-1" style={{ color: 'var(--ink-primary)' }}>
            ברוכים הבאים ל-JobHunter AI
          </h2>
          <p className="text-[14px] mb-4" style={{ color: 'var(--ink-secondary)' }}>
            3 שלבים פשוטים: עדכן פרופיל → חפש משרות → צור CV מותאם
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => navigate('/profile')} className="px-4 py-2 rounded-pill text-[13px] font-semibold bg-white" style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}>עדכן פרופיל</button>
            <button onClick={() => scrapeMutation.mutate()} disabled={scrapeMutation.isPending} className="px-4 py-2 rounded-pill text-[13px] font-semibold text-white disabled:opacity-60 flex items-center gap-1.5" style={{ background: 'var(--brand)' }}>
              {scrapeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              חפש משרות
            </button>
          </div>
        </div>
      )}

      {/* Scrape message */}
      {scrapeMessage && (
        <div
          className="rounded-card px-4 py-3 text-[13px] font-medium flex items-center justify-between"
          style={{
            background: scrapeMessage.startsWith('שגיאה') ? '#fef2f2' : '#ecfdf5',
            color: scrapeMessage.startsWith('שגיאה') ? '#b24020' : '#057642',
            border: `1px solid ${scrapeMessage.startsWith('שגיאה') ? '#fecaca' : '#a7f3d0'}`,
          }}
        >
          <span>{scrapeMessage}</span>
          {lastSearchResult && !scrapeMessage.startsWith('שגיאה') && (
            <button
              onClick={() => navigate(`/jobs?tab=lastSearch&sid=${lastSearchResult.sessionId}`)}
              className="px-3 py-1.5 rounded-pill text-white text-[11px] font-semibold flex items-center gap-1"
              style={{ background: '#057642' }}
            >
              <Eye size={12} /> צפה בתוצאות
            </button>
          )}
        </div>
      )}

      {/* ═══════ HERO: Insights Row ═══════ */}
      {!showOnboarding && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Top Recommended Roles ── */}
          <div className="lg:col-span-2 rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target size={16} style={{ color: 'var(--brand)' }} />
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  תפקידים מומלצים עבורך
                </h3>
              </div>
              <button onClick={() => navigate('/jobs')} className="text-[12px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--brand)' }}>
                צפה במשרות <ArrowUpRight size={12} />
              </button>
            </div>

            {insightsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--ink-tertiary)' }} />
              </div>
            ) : insights?.topRoles && insights.topRoles.length > 0 ? (
              <div className="space-y-2">
                {insights.topRoles.slice(0, 4).map((role) => (
                  <button
                    key={role.id}
                    onClick={() => { setCustomKeywords([role.name]); scrapeMutation.mutate() }}
                    className="w-full flex items-center gap-3 p-3 rounded-card transition-all text-right group"
                    style={{ background: 'var(--subtle)', border: '1px solid transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--selected)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'var(--subtle)' }}
                    title={`חפש משרות ${role.nameHe}`}
                  >
                    <span className="text-[22px] flex-shrink-0">{role.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-primary)' }}>{role.nameHe}</span>
                        <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>({role.name})</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {role.jobsFound > 0 && (
                          <span className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                            {role.jobsFound} משרות נמצאו
                          </span>
                        )}
                        {role.topJob && (
                          <span className="text-[11px] truncate" style={{ color: 'var(--ink-tertiary)' }}>
                            הכי טוב: {role.topJob.company}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-center">
                        <span
                          className="text-[18px] font-bold leading-none"
                          style={{ color: role.profileMatch >= 60 ? '#057642' : role.profileMatch >= 35 ? '#b45309' : 'var(--ink-secondary)' }}
                        >
                          {role.profileMatch}%
                        </span>
                        <p className="text-[9px]" style={{ color: 'var(--ink-tertiary)' }}>התאמה</p>
                      </div>
                      {role.avgJobScore > 0 && (
                        <div className="text-center">
                          <span className="text-[14px] font-semibold leading-none" style={{ color: 'var(--brand)' }}>
                            {role.avgJobScore}%
                          </span>
                          <p className="text-[9px]" style={{ color: 'var(--ink-tertiary)' }}>ממוצע CV</p>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-[13px]" style={{ color: 'var(--ink-tertiary)' }}>עדכן את הפרופיל שלך כדי לקבל המלצות מותאמות</p>
                <button onClick={() => navigate('/profile')} className="mt-2 text-[12px] font-semibold" style={{ color: 'var(--brand)' }}>
                  עדכן פרופיל ←
                </button>
              </div>
            )}
          </div>

          {/* ── Salary Estimate + Profile Strength ── */}
          <div className="space-y-4">
            {/* Salary Card */}
            <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Wallet size={16} style={{ color: '#b45309' }} />
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  שווי שוק משוער
                </h3>
              </div>

              {insightsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--ink-tertiary)' }} />
                </div>
              ) : insights?.salaryInsight ? (
                <>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-[22px] font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {fmtNIS(insights.salaryInsight.estimatedRange.min)}
                    </span>
                    <span className="text-[14px]" style={{ color: 'var(--ink-tertiary)' }}>–</span>
                    <span className="text-[22px] font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {fmtNIS(insights.salaryInsight.estimatedRange.max)}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                    ברוטו לחודש • רמת {EXP_LABELS[insights.salaryInsight.experienceLevel] || insights.salaryInsight.experienceLevel}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-tertiary)' }}>
                    מבוסס על תפקיד {insights.salaryInsight.basedOnRoleHe} בשוק הישראלי
                  </p>
                  {insights.salaryInsight.fromJobData && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-tertiary)' }}>
                      {insights.salaryInsight.fromJobData.count} משרות עם נתוני שכר
                    </p>
                  )}
                </>
              ) : null}
            </div>

            {/* Profile Strength */}
            <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Award size={16} style={{ color: 'var(--brand)' }} />
                  <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>חוזק פרופיל</h3>
                </div>
                {insights?.profileStrength && (
                  <span className="text-[18px] font-bold" style={{
                    color: insights.profileStrength.score >= 80 ? '#057642' : insights.profileStrength.score >= 50 ? '#b45309' : '#b24020'
                  }}>
                    {insights.profileStrength.score}%
                  </span>
                )}
              </div>
              {insights?.profileStrength && (
                <>
                  <div className="h-2 rounded-full overflow-hidden mb-2.5" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${insights.profileStrength.score}%`,
                        background: insights.profileStrength.score >= 80 ? '#057642' : insights.profileStrength.score >= 50 ? '#b45309' : '#b24020',
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    {insights.profileStrength.items.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-[11px]">
                        {item.done
                          ? <CheckCircle size={12} style={{ color: '#057642' }} />
                          : <Circle size={12} style={{ color: 'var(--ink-tertiary)' }} />
                        }
                        <span style={{ color: item.done ? 'var(--ink-secondary)' : 'var(--ink-tertiary)' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ AUTOPILOT STATUS ═══════ */}
      {apStatus && (
        <button
          onClick={() => navigate('/autopilot')}
          className="w-full rounded-card bg-white p-4 flex items-center gap-4 transition-all group text-right"
          style={{ border: '1px solid var(--border)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: apStatus.config?.enabled
                ? apStatus.isRunning ? '#ecfdf5' : '#eaf2fb'
                : 'var(--subtle)',
            }}
          >
            <Zap
              size={20}
              style={{
                color: apStatus.config?.enabled
                  ? apStatus.isRunning ? '#057642' : 'var(--brand)'
                  : 'var(--ink-tertiary)',
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                AutoPilot
              </span>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-pill"
                style={{
                  background: apStatus.config?.enabled
                    ? apStatus.isRunning ? '#dcfce7' : '#dbeafe'
                    : 'var(--subtle)',
                  color: apStatus.config?.enabled
                    ? apStatus.isRunning ? '#057642' : 'var(--brand)'
                    : 'var(--ink-tertiary)',
                }}
              >
                {apStatus.config?.enabled
                  ? apStatus.isRunning ? 'פעיל כרגע' : apStatus.config.mode === 'full-auto' ? 'אוטומטי מלא' : 'חצי-אוטומטי'
                  : 'כבוי'}
              </span>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--ink-secondary)' }}>
              {apStatus.todayStats
                ? `היום: ${apStatus.todayStats.discovered} נמצאו · ${apStatus.todayStats.submitted} הוגשו · ${apStatus.todayStats.cvs} CVs`
                : 'לא היו ריצות היום'}
            </p>
          </div>
          {(apStatus.pendingApprovals ?? 0) > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill flex-shrink-0"
              style={{ background: '#fef3c7', border: '1px solid #fde68a' }}
            >
              <span className="text-[12px] font-semibold" style={{ color: '#92400e' }}>
                {apStatus.pendingApprovals} ממתינים לאישור
              </span>
            </div>
          )}
          <ArrowUpRight size={16} className="flex-shrink-0" style={{ color: 'var(--ink-tertiary)' }} />
        </button>
      )}

      {/* ═══════ SEARCH RESULTS SUMMARY ═══════ */}
      {lastSearchResult && lastSearchResult.count > 0 && (
        <div className="rounded-card bg-white p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: 'var(--brand)' }} />
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>סיכום חיפוש אחרון</h3>
            </div>
            <button
              onClick={() => navigate(`/jobs?tab=lastSearch&sid=${lastSearchResult.sessionId}`)}
              className="text-[12px] font-semibold flex items-center gap-1"
              style={{ color: 'var(--brand)' }}
            >
              <Eye size={12} /> צפה במשרות
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-card p-2.5 text-center" style={{ background: 'var(--subtle)' }}>
              <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{lastSearchResult.totalScraped}</p>
              <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>נסרקו</p>
            </div>
            <div className="rounded-card p-2.5 text-center" style={{ background: '#ecfdf5' }}>
              <p className="text-[18px] font-bold" style={{ color: '#057642' }}>{lastSearchResult.count}</p>
              <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>נשמרו</p>
            </div>
            <div className="rounded-card p-2.5 text-center" style={{ background: '#fff7ed' }}>
              <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{lastSearchResult.duplicates}</p>
              <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>כפולות</p>
            </div>
            <div className="rounded-card p-2.5 text-center" style={{ background: 'var(--selected)' }}>
              <p className="text-[18px] font-bold" style={{ color: 'var(--brand)' }}>{lastSearchResult.avgScore}%</p>
              <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>ציון ממוצע</p>
            </div>
          </div>

          {/* What AI searched for */}
          {lastSearchResult.keywords.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-tertiary)' }}>מה AI חיפש</h4>
              <div className="flex flex-wrap gap-1.5">
                {lastSearchResult.keywords.slice(0, 12).map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[11px]" style={{ background: 'var(--subtle)', color: 'var(--ink-primary)' }} dir="ltr">{kw}</span>
                ))}
                {lastSearchResult.keywords.length > 12 && (
                  <span className="px-2 py-0.5 text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>+{lastSearchResult.keywords.length - 12}</span>
                )}
              </div>
            </div>
          )}

          {/* Smart keyword breakdown */}
          {lastSearchResult.smartKeywords && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {lastSearchResult.smartKeywords.primary && lastSearchResult.smartKeywords.primary.length > 0 && (
                <div className="rounded-card p-2" style={{ background: 'var(--selected)' }}>
                  <p className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--brand)' }}>תפקידים ישירים</p>
                  <div className="flex flex-wrap gap-1">
                    {lastSearchResult.smartKeywords.primary.map((kw, i) => (
                      <span key={i} className="text-[11px]" style={{ color: 'var(--brand-hover)' }} dir="ltr">{kw}{i < lastSearchResult.smartKeywords!.primary!.length - 1 ? ',' : ''}</span>
                    ))}
                  </div>
                </div>
              )}
              {lastSearchResult.smartKeywords.adjacent && lastSearchResult.smartKeywords.adjacent.length > 0 && (
                <div className="rounded-card p-2" style={{ background: '#f5f3ff' }}>
                  <p className="text-[10px] font-bold uppercase mb-1" style={{ color: '#6d28d9' }}>תפקידים סמוכים</p>
                  <div className="flex flex-wrap gap-1">
                    {lastSearchResult.smartKeywords.adjacent.map((kw, i) => (
                      <span key={i} className="text-[11px]" style={{ color: '#5b21b6' }} dir="ltr">{kw}{i < lastSearchResult.smartKeywords!.adjacent!.length - 1 ? ',' : ''}</span>
                    ))}
                  </div>
                </div>
              )}
              {lastSearchResult.smartKeywords.hebrew && lastSearchResult.smartKeywords.hebrew.length > 0 && (
                <div className="rounded-card p-2" style={{ background: '#ecfdf5' }}>
                  <p className="text-[10px] font-bold uppercase mb-1" style={{ color: '#057642' }}>חיפוש בעברית</p>
                  <div className="flex flex-wrap gap-1">
                    {lastSearchResult.smartKeywords.hebrew.map((kw, i) => (
                      <span key={i} className="text-[11px]" style={{ color: '#046c4e' }}>{kw}{i < lastSearchResult.smartKeywords!.hebrew!.length - 1 ? ',' : ''}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source breakdown */}
          {lastSearchResult.sourceBreakdown.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lastSearchResult.sourceBreakdown.filter(s => s.scrapedCount > 0).map((s) => (
                <span key={s.source} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-pill text-[11px]" style={{ background: 'var(--subtle)' }}>
                  <span className="font-medium" style={{ color: 'var(--ink-primary)' }}>{SOURCE_NAMES[s.source] || s.source}</span>
                  <span style={{ color: 'var(--ink-tertiary)' }}>{s.scrapedCount}</span>
                </span>
              ))}
              {lastSearchResult.location && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[11px]" style={{ background: 'var(--subtle)', color: 'var(--ink-secondary)' }}>
                  <MapPin size={10} /> {lastSearchResult.location}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ SMART SEARCH ═══════ */}
      <div className="rounded-card bg-white overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* Search header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card flex items-center justify-center" style={{ background: 'var(--subtle)' }}>
              <Search size={18} style={{ color: 'var(--brand)' }} />
            </div>
            <div className="text-right">
              <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>חיפוש משרות חכם</h3>
              <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                {enabledSources.length > 0 ? `${enabledSources.length} מקורות` : 'כל המקורות'}
                {minScore > 0 ? ` • מינימום ${minScore}%` : ''}
                {searchLocation ? ` • ${searchLocation}` : ''}
                {customKeywords.length > 0 ? ` • ${customKeywords.length} מילות מפתח` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchConfigOpen(!searchConfigOpen)}
              className="p-2.5 rounded-pill text-sm transition-colors"
              style={{
                border: '1px solid var(--border)',
                background: searchConfigOpen ? 'var(--selected)' : 'white',
                color: searchConfigOpen ? 'var(--brand)' : 'var(--ink-secondary)',
              }}
              title="הגדרות חיפוש"
            >
              <Settings2 size={18} />
            </button>
            <button
              onClick={() => scrapeMutation.mutate()}
              disabled={scrapeMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-pill text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--brand)' }}
            >
              {scrapeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              חפש עכשיו
            </button>
          </div>
        </div>

        {/* Expandable search config */}
        {searchConfigOpen && (
          <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--subtle)' }}>
            {/* Sources */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--ink-tertiary)' }}>מקורות חיפוש</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SOURCES.map((source) => {
                  const isActive = enabledSources.length === 0 || enabledSources.includes(source.id)
                  return (
                    <button
                      key={source.id}
                      onClick={() => toggleSource(source.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[13px] font-medium transition-colors"
                      style={{
                        background: isActive ? 'var(--selected)' : 'white',
                        color: isActive ? 'var(--brand)' : 'var(--ink-tertiary)',
                        border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border)'}`,
                        opacity: isActive ? 1 : 0.7,
                      }}
                    >
                      <span>{source.icon}</span> {source.name}
                    </button>
                  )
                })}
                {enabledSources.length > 0 && (
                  <button onClick={() => setEnabledSources([])} className="px-3 py-1.5 rounded-pill text-[12px] font-medium" style={{ color: 'var(--ink-tertiary)' }}>בחר הכל</button>
                )}
              </div>
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>ציון התאמה מינימלי</label>
                <select
                  value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                >
                  {MIN_SCORE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>מיקום</label>
                <div className="relative">
                  <MapPin size={14} className="absolute right-3 top-2.5" style={{ color: 'var(--ink-tertiary)' }} />
                  <input
                    type="text" placeholder={defaultLocation || 'Israel'} value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 rounded-card bg-white text-[13px]"
                    style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>רמת ניסיון</label>
                <select
                  value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                >
                  {EXPERIENCE_LEVELS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>
                מילות מפתח מותאמות אישית
                <span className="font-normal normal-case mr-1" style={{ color: 'var(--ink-tertiary)' }}>(ריק = אוטומטי מהפרופיל)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text" placeholder="הוסף מילת מפתח..." value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                  className="flex-1 px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                  dir="ltr"
                />
                <button onClick={addKeyword} disabled={!keywordInput.trim()} className="px-3 py-2 rounded-card disabled:opacity-40" style={{ background: 'var(--selected)', color: 'var(--brand)', border: '1px solid var(--brand)' }}>
                  <Plus size={16} />
                </button>
              </div>
              {customKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customKeywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium" style={{ background: 'var(--selected)', color: 'var(--brand)' }}>
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="hover:opacity-70"><X size={12} /></button>
                    </span>
                  ))}
                  <button onClick={() => setCustomKeywords([])} className="text-[12px] px-2 py-1" style={{ color: 'var(--ink-tertiary)' }}>נקה הכל</button>
                </div>
              )}
              {customKeywords.length === 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-tertiary)' }}>
                  מילות מפתח מהפרופיל: {defaultKeywords.slice(0, 5).join(', ')}{defaultKeywords.length > 5 ? ` (+${defaultKeywords.length - 5})` : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════ QUICK STATS ROW ═══════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onClick={() => navigate('/jobs')} className="p-3 rounded-card bg-white text-right" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={14} style={{ color: 'var(--brand)' }} />
            <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>משרות במאגר</span>
          </div>
          <p className="text-[20px] font-bold" style={{ color: 'var(--ink-primary)' }}>{statusLoading ? '...' : totalJobs}</p>
          {lastScraped && <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>עדכון: {new Date(lastScraped).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>}
        </button>

        <button onClick={() => navigate('/cv-generator')} className="p-3 rounded-card bg-white text-right" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={14} style={{ color: 'var(--brand)' }} />
            <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>צור CV</span>
          </div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>CV מותאם למשרה</p>
          <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>עמוד אחד ומדויק</p>
        </button>

        <button onClick={() => navigate('/pipeline')} className="p-3 rounded-card bg-white text-right" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={14} style={{ color: 'var(--brand)' }} />
            <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>הגשות</span>
          </div>
          <p className="text-[20px] font-bold" style={{ color: 'var(--ink-primary)' }}>{insights?.totalScoredJobs || 0}</p>
          <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>משרות שנוקדו</p>
        </button>

        {insights?.scoreDistribution && (
          <div className="p-3 rounded-card bg-white text-right" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} style={{ color: '#057642' }} />
              <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>התפלגות ציונים</span>
            </div>
            <div className="flex items-end gap-1 mt-1">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[14px] font-bold" style={{ color: '#057642' }}>{insights.scoreDistribution.high}</span>
                <div className="w-6 rounded-sm" style={{ height: Math.max(4, insights.scoreDistribution.high * 2), background: '#057642' }} />
                <span className="text-[8px]" style={{ color: 'var(--ink-tertiary)' }}>70+</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[14px] font-bold" style={{ color: '#b45309' }}>{insights.scoreDistribution.medium}</span>
                <div className="w-6 rounded-sm" style={{ height: Math.max(4, insights.scoreDistribution.medium * 2), background: '#b45309' }} />
                <span className="text-[8px]" style={{ color: 'var(--ink-tertiary)' }}>50-70</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[14px] font-bold" style={{ color: '#b24020' }}>{insights.scoreDistribution.low}</span>
                <div className="w-6 rounded-sm" style={{ height: Math.max(4, insights.scoreDistribution.low * 2), background: '#b24020' }} />
                <span className="text-[8px]" style={{ color: 'var(--ink-tertiary)' }}>{'<50'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ TOP MATCHES ═══════ */}
      {insights?.topMatches && insights.topMatches.length > 0 && (
        <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={16} style={{ color: '#b45309' }} />
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>ההתאמות הטובות ביותר שלך</h3>
            </div>
            <button onClick={() => navigate('/jobs')} className="text-[12px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--brand)' }}>
              כל המשרות <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-1">
            {insights.topMatches.map((job) => (
              <button
                key={job.jobId}
                onClick={() => navigate(`/jobs`)}
                className="w-full flex items-center gap-3 p-2.5 rounded-card transition-colors text-right"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--subtle)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <ScoreRing value={job.score} size={38} stroke={3} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--ink-primary)' }}>{job.title}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--ink-secondary)' }}>{job.company}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--selected)', color: 'var(--brand)' }}>
                  {job.skillMatch}% סקילים
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ BOTTOM ROW: Sources + Costs ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Source Health */}
        {sourceHealth && sourceHealth.length > 0 && (
          <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
            <h3 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--ink-primary)' }}>מצב מקורות</h3>
            <div className="space-y-1.5">
              {sourceHealth.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-card" style={{ background: 'var(--subtle)' }}>
                  <div className="relative flex-shrink-0">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.ok ? '#057642' : '#b24020' }} />
                    {s.ok && <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-30" style={{ background: '#057642' }} />}
                  </div>
                  <span className="text-[12px] flex-1" style={{ color: 'var(--ink-primary)' }}>{s.name}</span>
                  <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
                    {s.jobs > 0 ? `${s.jobs} jobs` : s.ok ? 'Ready' : 'Down'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Costs — compact & collapsible */}
        <div className="rounded-card bg-white overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => setCostDetailOpen(!costDetailOpen)}
            className="w-full flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-card flex items-center justify-center" style={{ background: '#fff7ed' }}>
                <DollarSign size={15} style={{ color: '#b45309' }} />
              </div>
              <div className="text-right">
                <h3 className="text-[13px] font-semibold" style={{ color: 'var(--ink-primary)' }}>עלויות API</h3>
                <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  {costs ? `${fmt$(costs.total)} היום • ${costs.anthropic.calls + costs.serpapi.calls} קריאות` : 'טוען...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {costs && costs.total > 0 && (
                <span className="text-[16px] font-bold" style={{ color: 'var(--ink-primary)' }}>{fmt$(costs.total)}</span>
              )}
              {costDetailOpen ? <ChevronUp size={16} style={{ color: 'var(--ink-tertiary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ink-tertiary)' }} />}
            </div>
          </button>

          {costDetailOpen && costs && (
            <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="space-y-2.5">
                <CostBar label="Claude AI" amount={costs.anthropic.cost} total={costs.total || 1} color="bg-purple-500" detail={`${costs.anthropic.calls} קריאות`} />
                <CostBar label="SerpAPI" amount={costs.serpapi.cost} total={costs.total || 1} color="bg-blue-500" detail={`${costs.serpapi.calls} חיפושים`} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-card p-2.5 text-center" style={{ background: 'var(--subtle)' }}>
                  <p className="text-[16px] font-bold" style={{ color: 'var(--ink-primary)' }}>{fmtTokens(costs.anthropic.inputTokens)}</p>
                  <p className="text-[9px]" style={{ color: 'var(--ink-secondary)' }}>Input</p>
                </div>
                <div className="rounded-card p-2.5 text-center" style={{ background: 'var(--subtle)' }}>
                  <p className="text-[16px] font-bold" style={{ color: 'var(--ink-primary)' }}>{fmtTokens(costs.anthropic.outputTokens)}</p>
                  <p className="text-[9px]" style={{ color: 'var(--ink-secondary)' }}>Output</p>
                </div>
                <div className="rounded-card p-2.5 text-center" style={{ background: 'var(--subtle)' }}>
                  <p className="text-[16px] font-bold" style={{ color: 'var(--ink-primary)' }}>{costs.serpapi.calls}</p>
                  <p className="text-[9px]" style={{ color: 'var(--ink-secondary)' }}>Search Credits</p>
                </div>
              </div>

              {timeline.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-tertiary)' }}>היסטוריית קריאות</h4>
                  <div className="max-h-40 overflow-y-auto rounded-card p-2" style={{ background: 'var(--subtle)' }}>
                    {timeline.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${item.type === 'ai' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                          {item.type === 'ai' ? <Cpu size={10} className="text-purple-600" /> : <Globe size={10} className="text-blue-600" />}
                        </div>
                        <span className="flex-1 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                          {item.type === 'ai' ? 'Claude AI' : 'SerpAPI'}{item.detail ? ` · ${item.detail}` : ''}
                        </span>
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-primary)' }}>{fmt$(item.cost)}</span>
                        <span className="text-[9px]" style={{ color: 'var(--ink-tertiary)' }}>{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-card p-2" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <p className="text-[11px]" style={{ color: '#b45309' }}>
                  <strong>תמחור:</strong> Claude Sonnet — $3/M input, $15/M output • SerpAPI — $0.01/search
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
