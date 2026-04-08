import { useState, useMemo, useCallback } from 'react'
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
  Settings2,
  Plus,
  X,
  MapPin,
  Filter,
  Sparkles,
} from 'lucide-react'
import { scrapeApi, SearchConfig } from '@/services/scrape.api'
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

  const [lastSearchResult, setLastSearchResult] = useState<{ sessionId: string; count: number } | null>(null)

  const scrapeMutation = useMutation({
    mutationFn: () => {
      const config = buildSearchConfig()
      return scrapeApi.smartTriggerScrape(config).catch(() =>
        scrapeApi.triggerScrape(customKeywords.length > 0 ? customKeywords : defaultKeywords, config.location || defaultLocation)
      )
    },
    onSuccess: (res) => {
      const sessionId = res.data.searchSessionId
      const count = res.data.totalJobsCreated
      setLastSearchResult(sessionId ? { sessionId, count } : null)
      setScrapeMessage(`נמצאו ${count} משרות חדשות!`)
      queryClient.invalidateQueries({ queryKey: ['scrape-status'] })
      queryClient.invalidateQueries({ queryKey: ['job-stats'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['costs-today'] })
      queryClient.invalidateQueries({ queryKey: ['search-history'] })
      setTimeout(() => setScrapeMessage(null), 8000)
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
            <button onClick={() => { setSearchConfigOpen(true); scrapeMutation.mutate() }} disabled={scrapeMutation.isPending} className="px-4 py-2 rounded-xl bg-primary-600 text-sm font-medium text-white shadow-sm hover:bg-primary-500 transition-all disabled:opacity-60 flex items-center gap-1.5">
              {scrapeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              חפש משרות
            </button>
            <button onClick={() => navigate('/cv-generator')} className="px-4 py-2 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white shadow-sm hover:shadow transition-all">צור CV</button>
          </div>
        </div>
      )}

      {/* Scrape message with "view results" link */}
      {scrapeMessage && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between ${
          scrapeMessage.startsWith('שגיאה')
            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
        }`}>
          <span>{scrapeMessage}</span>
          {lastSearchResult && !scrapeMessage.startsWith('שגיאה') && (
            <button
              onClick={() => navigate(`/jobs?tab=lastSearch&sid=${lastSearchResult.sessionId}`)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors flex items-center gap-1"
            >
              <Eye size={12} />
              צפה בתוצאות
            </button>
          )}
        </div>
      )}

      {/* Search Panel + Quick Actions */}
      <div className="rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        {/* Search header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-primary-600 flex items-center justify-center">
              <Search size={18} className="text-white" />
            </div>
            <div className="text-right">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">חיפוש משרות חכם</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
              className={`p-2.5 rounded-xl border text-sm transition-all ${
                searchConfigOpen
                  ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/30'
              }`}
              title="הגדרות חיפוש"
            >
              <Settings2 size={18} />
            </button>
            <button
              onClick={() => scrapeMutation.mutate()}
              disabled={scrapeMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-primary-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-60"
            >
              {scrapeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              חפש עכשיו
            </button>
          </div>
        </div>

        {/* Expandable search config */}
        {searchConfigOpen && (
          <div className="border-t border-gray-100 dark:border-gray-700/50 p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/30">
            {/* Sources selection */}
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">מקורות חיפוש</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SOURCES.map((source) => {
                  const isActive = enabledSources.length === 0 || enabledSources.includes(source.id)
                  return (
                    <button
                      key={source.id}
                      onClick={() => toggleSource(source.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700'
                          : 'bg-white text-gray-400 border border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700 opacity-60'
                      }`}
                    >
                      <span>{source.icon}</span>
                      {source.name}
                    </button>
                  )
                })}
                {enabledSources.length > 0 && (
                  <button
                    onClick={() => setEnabledSources([])}
                    className="px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-500 font-medium transition-colors"
                  >
                    בחר הכל
                  </button>
                )}
              </div>
            </div>

            {/* Min score + Location + Experience in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">ציון התאמה מינימלי</label>
                <select
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                >
                  {MIN_SCORE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">מיקום</label>
                <div className="relative">
                  <MapPin size={14} className="absolute right-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder={defaultLocation || 'Israel'}
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">רמת ניסיון</label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                >
                  {EXPERIENCE_LEVELS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom keywords */}
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                מילות מפתח מותאמות אישית
                <span className="font-normal normal-case text-gray-400 mr-1">(ריק = אוטומטי מהפרופיל)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="הוסף מילת מפתח..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  dir="ltr"
                />
                <button
                  onClick={addKeyword}
                  disabled={!keywordInput.trim()}
                  className="px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
                >
                  <Plus size={16} />
                </button>
              </div>
              {customKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customKeywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium dark:bg-primary-900/20 dark:text-primary-400">
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="hover:text-red-500 transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => setCustomKeywords([])}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 transition-colors"
                  >
                    נקה הכל
                  </button>
                </div>
              )}
              {customKeywords.length === 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
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
