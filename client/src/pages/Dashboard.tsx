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
} from 'lucide-react'
import { scrapeApi, SearchConfig } from '@/services/scrape.api'
import { jobsApi } from '@/services/jobs.api'
import { profileApi } from '@/services/profile.api'
import { applicationsApi } from '@/services/applications.api'
import { costsApi } from '@/services/costs.api'
import { suggestRoles } from '@/lib/roleSuggestions'

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
const StatBox = ({ label, value, sub, icon: Icon, tint }: {
  label: string; value: string | number; sub?: string; icon: any; tint: string
}) => (
  <div
    className="flex items-center gap-3 p-4 rounded-card bg-white"
    style={{ border: '1px solid var(--border)' }}
  >
    <div
      className="flex-shrink-0 w-10 h-10 rounded-card flex items-center justify-center"
      style={{ background: tint }}
    >
      <Icon size={18} style={{ color: 'var(--brand)' }} />
    </div>
    <div className="min-w-0">
      <p className="text-[20px] font-bold leading-tight" style={{ color: 'var(--ink-primary)' }}>{value}</p>
      <p className="text-[12px] truncate" style={{ color: 'var(--ink-secondary)' }}>{label}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>{sub}</p>}
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
/** Available scraping sources */
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

const Dashboard = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null)
  const [costDetailOpen, setCostDetailOpen] = useState(false)
  const [searchConfigOpen, setSearchConfigOpen] = useState(false)

  // Search configuration state
  const [enabledSources, setEnabledSources] = useState<string[]>([]) // empty = all
  const [minScore, setMinScore] = useState<number>(0)
  const [searchLocation, setSearchLocation] = useState<string>('')
  const [customKeywords, setCustomKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')

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

  // Application stats — used to compute the "success rate" widget
  const { data: applications } = useQuery({
    queryKey: ['applications-for-dashboard'],
    queryFn: async () => {
      try {
        const res = await applicationsApi.list({ limit: 200 } as any)
        return (res as any)?.data || []
      } catch {
        return []
      }
    },
    staleTime: 2 * 60 * 1000,
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

  // Build the search config from UI state
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
    sessionId: string
    count: number
    keywords: string[]
    smartKeywords?: { primary?: string[]; adjacent?: string[]; hebrew?: string[] }
    sourceBreakdown: { source: string; scrapedCount: number }[]
    totalScraped: number
    totalFiltered: number
    duplicates: number
    avgScore: number
    location: string
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
      queryClient.invalidateQueries({ queryKey: ['costs-today'] })
      queryClient.invalidateQueries({ queryKey: ['search-history'] })
      setTimeout(() => setScrapeMessage(null), 12000)
    },
    onError: (err: any) => {
      setScrapeMessage(`שגיאה: ${err?.response?.data?.error?.message || err.message}`)
      setTimeout(() => setScrapeMessage(null), 5000)
    },
  })

  const addKeyword = () => {
    const kw = keywordInput.trim()
    if (kw && !customKeywords.includes(kw)) {
      setCustomKeywords(prev => [...prev, kw])
    }
    setKeywordInput('')
  }

  const removeKeyword = (kw: string) => {
    setCustomKeywords(prev => prev.filter(k => k !== kw))
  }

  const toggleSource = (sourceId: string) => {
    setEnabledSources(prev =>
      prev.includes(sourceId)
        ? prev.filter(s => s !== sourceId)
        : [...prev, sourceId]
    )
  }

  // ─── Derived data ────────────────────────────────────
  const totalJobs = statusData?.totalJobsInDB || 0
  const lastScraped = statusData?.lastScraped
  const activeSources = sourcesData?.filter((s: any) => s.available).length || 0
  const showOnboarding = totalJobs === 0

  // Recommended roles — top 4 inferred from the user's profile
  const recommendedRoles = useMemo(
    () => suggestRoles((profile as any)?.structuredProfile).slice(0, 4),
    [profile]
  )

  // Success rate — share of submitted applications that got a response (interview / offer)
  const successStats = useMemo(() => {
    const apps: any[] = Array.isArray(applications) ? applications : []
    const submitted = apps.filter(
      (a) => a.status && a.status !== 'PENDING' && a.status !== 'CV_GENERATED'
    )
    const responded = submitted.filter(
      (a) => a.responseAt || ['RESPONDED', 'INTERVIEW', 'OFFER', 'REJECTED_BY_COMPANY'].includes(a.status)
    )
    const positive = submitted.filter(
      (a) => ['INTERVIEW', 'OFFER'].includes(a.status)
    )
    const successRate = submitted.length > 0
      ? Math.round((positive.length / submitted.length) * 100)
      : 0
    const responseRate = submitted.length > 0
      ? Math.round((responded.length / submitted.length) * 100)
      : 0
    return {
      totalSubmitted: submitted.length,
      responded: responded.length,
      positive: positive.length,
      successRate,
      responseRate,
    }
  }, [applications])

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
        <div
          className="rounded-card p-6"
          style={{
            background: 'linear-gradient(135deg, #eaf2fb 0%, #f4f9ff 100%)',
            border: '1px solid #cfe3fa',
          }}
        >
          <h2 className="text-[20px] font-bold mb-1" style={{ color: 'var(--ink-primary)' }}>
            ברוכים הבאים ל-JobHunter AI
          </h2>
          <p className="text-[14px] mb-4" style={{ color: 'var(--ink-secondary)' }}>
            3 שלבים פשוטים להתחיל: עדכן פרופיל → חפש משרות → צור CV מותאם
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => navigate('/profile')}
              className="px-4 py-2 rounded-pill text-[13px] font-semibold bg-white transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
            >
              עדכן פרופיל
            </button>
            <button
              onClick={() => { setSearchConfigOpen(true); scrapeMutation.mutate() }}
              disabled={scrapeMutation.isPending}
              className="px-4 py-2 rounded-pill text-[13px] font-semibold text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
              style={{ background: 'var(--brand)' }}
            >
              {scrapeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              חפש משרות
            </button>
            <button
              onClick={() => navigate('/cv-generator')}
              className="px-4 py-2 rounded-pill text-[13px] font-semibold bg-white transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
            >
              צור CV
            </button>
          </div>
        </div>
      )}

      {/* Scrape message with "view results" link */}
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
              className="px-3 py-1.5 rounded-pill text-white text-[11px] font-semibold transition-colors flex items-center gap-1"
              style={{ background: '#057642' }}
            >
              <Eye size={12} />
              צפה בתוצאות
            </button>
          )}
        </div>
      )}

      {/* Search Results Summary — shows what the AI searched for and what it found */}
      {lastSearchResult && lastSearchResult.count > 0 && (
        <div
          className="rounded-card bg-white p-4 space-y-3"
          style={{ border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: 'var(--brand)' }} />
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>סיכום חיפוש אחרון</h3>
            </div>
            <button
              onClick={() => navigate(`/jobs?tab=lastSearch&sid=${lastSearchResult.sessionId}`)}
              className="text-[12px] font-semibold hover:underline flex items-center gap-1"
              style={{ color: 'var(--brand)' }}
            >
              <Eye size={12} />
              צפה במשרות
            </button>
          </div>

          {/* Stats row */}
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

          {/* What the AI searched for */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-tertiary)' }}>מה AI חיפש</h4>
            <div className="flex flex-wrap gap-1.5">
              {lastSearchResult.keywords.slice(0, 12).map((kw, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[11px]"
                  style={{ background: 'var(--subtle)', color: 'var(--ink-primary)' }}
                  dir="ltr"
                >
                  {kw}
                </span>
              ))}
              {lastSearchResult.keywords.length > 12 && (
                <span className="px-2 py-0.5 rounded text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
                  +{lastSearchResult.keywords.length - 12}
                </span>
              )}
            </div>
          </div>

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
                <span
                  key={s.source}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-pill text-[11px]"
                  style={{ background: 'var(--subtle)' }}
                >
                  <span className="font-medium" style={{ color: 'var(--ink-primary)' }}>{SOURCE_NAMES[s.source] || s.source}</span>
                  <span style={{ color: 'var(--ink-tertiary)' }}>{s.scrapedCount}</span>
                </span>
              ))}
              {lastSearchResult.location && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[11px]"
                  style={{ background: 'var(--subtle)', color: 'var(--ink-secondary)' }}
                >
                  <MapPin size={10} />
                  {lastSearchResult.location}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Recommended roles + Success rate row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recommended roles */}
        <div
          className="lg:col-span-2 rounded-card bg-white p-4"
          style={{ border: '1px solid var(--border)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                תפקידים מומלצים עבורך
              </h3>
              <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                {(profile as any)?.structuredProfile?.experience?.length
                  ? 'מבוסס על הניסיון שמילאת בפרופיל'
                  : 'מלא את הפרופיל שלך כדי לקבל המלצות מותאמות אישית'}
              </p>
            </div>
            <button
              onClick={() => navigate('/cv-generator')}
              className="text-[12px] font-semibold"
              style={{ color: 'var(--brand)' }}
            >
              ערוך רשימה ←
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {recommendedRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => {
                  setCustomKeywords([role.name])
                  scrapeMutation.mutate()
                }}
                className="flex flex-col items-start gap-1 p-3 rounded-card text-right transition-colors hover:shadow-sm"
                style={{
                  background: 'var(--subtle)',
                  border: '1px solid var(--border)',
                }}
                title={`חפש משרות ${role.nameHe}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[20px]">{role.icon}</span>
                  {(role.score || 0) > 10 && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--brand)', color: 'white' }}
                    >
                      {role.score}%
                    </span>
                  )}
                </div>
                <span className="text-[12px] font-semibold leading-tight" style={{ color: 'var(--ink-primary)' }}>
                  {role.nameHe}
                </span>
                <span className="text-[10px] truncate w-full" style={{ color: 'var(--ink-tertiary)' }}>
                  {role.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Success rate card */}
        <div
          className="rounded-card bg-white p-4 flex flex-col"
          style={{ border: '1px solid var(--border)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}
        >
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
            אחוז הצלחה במשרות
          </h3>
          <p className="text-[12px] mb-3" style={{ color: 'var(--ink-secondary)' }}>
            מתוך {successStats.totalSubmitted} הגשות
          </p>
          {successStats.totalSubmitted > 0 ? (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span
                  className="text-[36px] font-bold leading-none"
                  style={{ color: successStats.successRate >= 15 ? '#057642' : successStats.successRate >= 5 ? '#b24020' : 'var(--ink-primary)' }}
                >
                  {successStats.successRate}%
                </span>
                <span className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                  ראיון/הצעה
                </span>
              </div>
              <div className="mt-auto pt-2 space-y-1 text-[11px]" style={{ color: 'var(--ink-secondary)', borderTop: '1px solid var(--divider)' }}>
                <div className="flex items-center justify-between pt-2">
                  <span>תגובה מחברה</span>
                  <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{successStats.responseRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>קיבלו ראיון / הצעה</span>
                  <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{successStats.positive}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-3">
              <p className="text-[12px]" style={{ color: 'var(--ink-tertiary)' }}>
                עדיין אין הגשות. התחל להגיש כדי לראות איך אתה מתקדם.
              </p>
              <button
                onClick={() => navigate('/jobs')}
                className="mt-3 text-[12px] font-semibold"
                style={{ color: 'var(--brand)' }}
              >
                ראה משרות מומלצות ←
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Panel + Quick Actions */}
      <div
        className="rounded-card bg-white overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Search header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-card flex items-center justify-center"
              style={{ background: 'var(--subtle)' }}
            >
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
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-pill text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: 'var(--brand)' }}
            >
              {scrapeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              חפש עכשיו
            </button>
          </div>
        </div>

        {/* Expandable search config */}
        {searchConfigOpen && (
          <div
            className="p-4 space-y-4"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--subtle)' }}
          >
            {/* Sources selection */}
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
                      <span>{source.icon}</span>
                      {source.name}
                    </button>
                  )
                })}
                {enabledSources.length > 0 && (
                  <button
                    onClick={() => setEnabledSources([])}
                    className="px-3 py-1.5 rounded-pill text-[12px] font-medium transition-colors"
                    style={{ color: 'var(--ink-tertiary)' }}
                  >
                    בחר הכל
                  </button>
                )}
              </div>
            </div>

            {/* Min score + Location + Experience in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>ציון התאמה מינימלי</label>
                <select
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                >
                  {MIN_SCORE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>מיקום</label>
                <div className="relative">
                  <MapPin size={14} className="absolute right-3 top-2.5" style={{ color: 'var(--ink-tertiary)' }} />
                  <input
                    type="text"
                    placeholder={defaultLocation || 'Israel'}
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 rounded-card bg-white text-[13px]"
                    style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>רמת ניסיון</label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                >
                  {EXPERIENCE_LEVELS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom keywords */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>
                מילות מפתח מותאמות אישית
                <span className="font-normal normal-case mr-1" style={{ color: 'var(--ink-tertiary)' }}>(ריק = אוטומטי מהפרופיל)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="הוסף מילת מפתח..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                  className="flex-1 px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-primary)' }}
                  dir="ltr"
                />
                <button
                  onClick={addKeyword}
                  disabled={!keywordInput.trim()}
                  className="px-3 py-2 rounded-card transition-colors disabled:opacity-40"
                  style={{ background: 'var(--selected)', color: 'var(--brand)', border: '1px solid var(--brand)' }}
                >
                  <Plus size={16} />
                </button>
              </div>
              {customKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium"
                      style={{ background: 'var(--selected)', color: 'var(--brand)' }}
                    >
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="transition-colors hover:opacity-70">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => setCustomKeywords([])}
                    className="text-[12px] px-2 py-1 transition-colors"
                    style={{ color: 'var(--ink-tertiary)' }}
                  >
                    נקה הכל
                  </button>
                </div>
              )}
              {customKeywords.length === 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-tertiary)' }}>
                  מילות מפתח מהפרופיל: {defaultKeywords.slice(0, 5).join(', ')}
                  {defaultKeywords.length > 5 ? ` (+${defaultKeywords.length - 5})` : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions (3 columns — search is now above) */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/jobs')}
          className="group p-4 rounded-card bg-white transition-colors text-right"
          style={{ border: '1px solid var(--border)' }}
        >
          <div
            className="w-9 h-9 rounded-card flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
            style={{ background: 'var(--subtle)' }}
          >
            <Eye size={16} style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>צפה במשרות</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-tertiary)' }}>{totalJobs} במאגר</p>
        </button>

        <button
          onClick={() => navigate('/cv-generator')}
          className="group p-4 rounded-card bg-white transition-colors text-right"
          style={{ border: '1px solid var(--border)' }}
        >
          <div
            className="w-9 h-9 rounded-card flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
            style={{ background: 'var(--subtle)' }}
          >
            <FileText size={16} style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>צור CV</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-tertiary)' }}>CV מותאם למשרה</p>
        </button>

        <button
          onClick={() => navigate('/pipeline')}
          className="group p-4 rounded-card bg-white transition-colors text-right"
          style={{ border: '1px solid var(--border)' }}
        >
          <div
            className="w-9 h-9 rounded-card flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
            style={{ background: 'var(--subtle)' }}
          >
            <BarChart3 size={16} style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>הגשות</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-tertiary)' }}>{jobStats?.submittedCount || 0} הגשות</p>
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox
          label="משרות במאגר"
          value={statusLoading ? '...' : totalJobs}
          icon={TrendingUp}
          tint="var(--subtle)"
          sub={lastScraped ? `עדכון: ${new Date(lastScraped).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : undefined}
        />
        <StatBox
          label="הצלחה בהגשות"
          value={successStats.totalSubmitted > 0 ? `${successStats.successRate}%` : '—'}
          icon={TrendingUp}
          tint="#ecfdf5"
          sub={successStats.totalSubmitted > 0 ? `${successStats.positive} ראיונות/הצעות` : 'אין עדיין הגשות'}
        />
        <StatBox
          label="מקורות פעילים"
          value={`${activeSources}/${sourcesData?.length || 0}`}
          icon={Globe}
          tint="var(--subtle)"
        />
        <StatBox
          label="עלות היום"
          value={costs ? fmt$(costs.total) : '...'}
          icon={DollarSign}
          tint="#fff7ed"
          sub={costs ? `${costs.anthropic.calls + costs.serpapi.calls} קריאות API` : undefined}
        />
      </div>

      {/* Cost Tracking Panel */}
      <div
        className="rounded-card bg-white overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <button
          onClick={() => setCostDetailOpen(!costDetailOpen)}
          className="w-full flex items-center justify-between p-4 transition-colors"
          style={{ background: 'white' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-card flex items-center justify-center"
              style={{ background: '#fff7ed' }}
            >
              <DollarSign size={18} style={{ color: '#b45309' }} />
            </div>
            <div className="text-right">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>עלויות ושימוש API</h3>
              <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                {costs ? `${fmt$(costs.total)} היום • ${costs.anthropic.calls} קריאות AI • ${costs.serpapi.calls} חיפושים` : 'טוען...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {costs && costs.total > 0 && (
              <span className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{fmt$(costs.total)}</span>
            )}
            {costDetailOpen ? <ChevronUp size={18} style={{ color: 'var(--ink-tertiary)' }} /> : <ChevronDown size={18} style={{ color: 'var(--ink-tertiary)' }} />}
          </div>
        </button>

        {costDetailOpen && costs && (
          <div className="p-4 space-y-5" style={{ borderTop: '1px solid var(--border)' }}>
            {/* Cost breakdown */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-tertiary)' }}>פירוט עלויות</h4>
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
              <div className="rounded-card p-3 text-center" style={{ background: 'var(--subtle)' }}>
                <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{fmtTokens(costs.anthropic.inputTokens)}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>Input Tokens</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>{fmt$(costs.anthropic.inputTokens * 3 / 1_000_000)}</p>
              </div>
              <div className="rounded-card p-3 text-center" style={{ background: 'var(--subtle)' }}>
                <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{fmtTokens(costs.anthropic.outputTokens)}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>Output Tokens</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>{fmt$(costs.anthropic.outputTokens * 15 / 1_000_000)}</p>
              </div>
              <div className="rounded-card p-3 text-center" style={{ background: 'var(--subtle)' }}>
                <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{costs.serpapi.calls}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>SerpAPI Credits</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>$0.01/credit</p>
              </div>
            </div>

            {/* Call history timeline */}
            {timeline.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-tertiary)' }}>היסטוריית קריאות</h4>
                <div className="max-h-56 overflow-y-auto rounded-card p-3" style={{ background: 'var(--subtle)' }}>
                  {timeline.map((item, i) => (
                    <HistoryItem key={i} {...item} />
                  ))}
                </div>
              </div>
            )}

            {/* Pricing info */}
            <div className="rounded-card p-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <p className="text-[12px]" style={{ color: '#b45309' }}>
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
          <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>משרות אחרונות</h3>
              <button
                onClick={() => navigate('/jobs')}
                className="text-[12px] font-semibold hover:underline"
                style={{ color: 'var(--brand)' }}
              >
                הכל ←
              </button>
            </div>
            <div className="space-y-1">
              {recentJobs.map((job: any) => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/jobs`)}
                  className="group w-full flex items-center gap-3 p-2.5 rounded-card transition-colors text-right"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--subtle)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: 'var(--ink-primary)' }}>{job.title}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-secondary)' }}>{job.company}</p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'var(--subtle)', color: 'var(--ink-secondary)' }}
                  >
                    {SOURCE_NAMES[job.source] || job.source}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Source Health */}
        {sourceHealth && sourceHealth.length > 0 && (
          <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>
            <h3 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--ink-primary)' }}>מצב מקורות</h3>
            <div className="space-y-2">
              {sourceHealth.map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-2.5 rounded-card"
                  style={{ background: 'var(--subtle)' }}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: s.ok ? '#057642' : '#b24020' }}
                    />
                    {s.ok && (
                      <div
                        className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-30"
                        style={{ background: '#057642' }}
                      />
                    )}
                  </div>
                  <span className="text-[13px] flex-1" style={{ color: 'var(--ink-primary)' }}>{s.name}</span>
                  <span className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
                    {s.jobs > 0 ? `${s.jobs} jobs` : s.ok ? 'Ready' : 'Down'}
                  </span>
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
