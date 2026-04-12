import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search,
  MapPin,
  Briefcase,
  ExternalLink,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  Building2,
  Target,
  X,
  Download,
  Sparkles,
  CheckCircle,
  AlertCircle,
  SlidersHorizontal,
  History,
  Zap,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { Job, JobFilters } from '@/types'
import { jobsApi } from '@/services/jobs.api'
import { cvApi } from '@/services/cv.api'
import { scrapeApi, SearchHistoryEntry } from '@/services/scrape.api'

const SOURCE_DISPLAY: Record<string, { label: string; color: 'primary' | 'success' | 'warning' | 'error' | 'gray' }> = {
  LINKEDIN: { label: 'LinkedIn', color: 'primary' },
  INDEED: { label: 'Indeed', color: 'success' },
  DRUSHIM: { label: 'Drushim', color: 'warning' },
  ALLJOBS: { label: 'AllJobs', color: 'error' },
  GOOGLE_JOBS: { label: 'Google Jobs', color: 'primary' },
  GLASSDOOR: { label: 'Glassdoor', color: 'gray' },
  WELLFOUND: { label: 'Wellfound', color: 'gray' },
  COMPANY_CAREER_PAGE: { label: 'Career Page', color: 'gray' },
  FACEBOOK_GROUP: { label: 'Facebook', color: 'primary' },
  OTHER: { label: 'Other', color: 'gray' },
}

/** Get the smart match score — prefers AI smart score, falls back to AI scoring, then heuristic */
const getSmartScore = (job: any): {
  score: number;
  category: string;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  greenFlags: string[];
  redFlags: string[];
  hasSmartScore: boolean;
} => {
  const rawData = job.rawData || {}

  // Priority 1: Per-persona JobScore (scoped server-side to the current
  // user's persona). This is the authoritative score because rawData.smartScore
  // lives on the shared Job row and gets overwritten by whichever user
  // last scored the job (last-writer-wins). The JobScore is per-persona so
  // it always reflects THIS user's match quality.
  if (job.scores?.length > 0) {
    const s = job.scores[0]
    return {
      score: Math.round(s.overallScore),
      category: s.recommendation || rawData.smartCategory || 'UNKNOWN',
      reasoning: s.reasoning || rawData.smartReasoning || '',
      matchedSkills: s.matchedSkills || rawData.matchedSkills || [],
      missingSkills: s.missingSkills || rawData.missingSkills || [],
      greenFlags: rawData.greenFlags || [],
      redFlags: s.redFlags || rawData.redFlags || [],
      hasSmartScore: true,
    }
  }

  // Priority 2: Fallback to rawData.smartScore (global, shared)
  if (rawData.smartScore != null) {
    return {
      score: rawData.smartScore,
      category: rawData.smartCategory || 'UNKNOWN',
      reasoning: rawData.smartReasoning || '',
      matchedSkills: rawData.matchedSkills || [],
      missingSkills: rawData.missingSkills || [],
      greenFlags: rawData.greenFlags || [],
      redFlags: rawData.redFlags || [],
      hasSmartScore: true,
    }
  }

  // Priority 3: Simple heuristic fallback
  const desc = (job.description || '').toLowerCase()
  const title = (job.title || '').toLowerCase()
  const techKeywords = ['react', 'node', 'typescript', 'javascript', 'python', 'full stack', 'frontend', 'backend', 'aws', 'docker']
  let hits = 0
  for (const kw of techKeywords) {
    if (desc.includes(kw) || title.includes(kw)) hits++
  }
  return {
    score: Math.min(95, 40 + hits * 6),
    category: 'UNSCORED',
    reasoning: '',
    matchedSkills: [],
    missingSkills: [],
    greenFlags: [],
    redFlags: [],
    hasSmartScore: false,
  }
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  PERFECT: { label: 'מושלם', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  STRONG: { label: 'חזק', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  GOOD: { label: 'טוב', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' },
  POSSIBLE: { label: 'אפשרי', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  STRETCH: { label: 'מאתגר', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  WEAK: { label: 'נמוך', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  STRONG_FIT: { label: 'חזק', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  GOOD_FIT: { label: 'טוב', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' },
  MODERATE: { label: 'בינוני', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  POOR_FIT: { label: 'נמוך', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  UNSCORED: { label: '', color: '' },
  UNKNOWN: { label: '', color: '' },
}

/** CV Tailoring Modal */
const CVModal = ({ job, onClose }: { job: any; onClose: () => void }) => {
  const [tailoredResult, setTailoredResult] = useState<any>(null)

  const tailorMutation = useMutation({
    mutationFn: async () => {
      const res = await cvApi.generateForJob(job.id)
      return res.data || res
    },
    onSuccess: (data) => {
      setTailoredResult(data)
    },
  })

  const handleDownload = async (filePath: string, format: string) => {
    // Standard CV filename: Name_Title_CV.format — no company name
    const candidateName = (tailoredResult?.candidateName || 'CV').replace(/[^a-zA-Z0-9\u0590-\u05FF ]/g, '').replace(/\s+/g, '_')
    const roleTitle = job.title.replace(/[^a-zA-Z0-9\u0590-\u05FF ]/g, '').replace(/\s+/g, '_').substring(0, 30)
    const fileName = `${candidateName}_${roleTitle}_CV.${format}`
    try {
      await cvApi.downloadCV(filePath, fileName)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">קורות חיים למשרה</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate" dir="ltr">{job.title} — {job.company}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tailor CV Button */}
          {!tailoredResult && !tailorMutation.isPending && (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center">
                <Sparkles size={28} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">התאמת קורות חיים חכמה</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  AI ינתח את המשרה וישנה את קורות החיים שלך — כותרות תפקידים, ניסוח, דגשים וכישורים — כדי למקסם את הסיכויים שלך.
                </p>
              </div>
              <button
                onClick={() => tailorMutation.mutate()}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-primary-500/25 transition-all"
              >
                <Sparkles size={18} />
                התאם קורות חיים למשרה זו
              </button>
            </div>
          )}

          {/* Loading State */}
          {tailorMutation.isPending && (
            <div className="text-center py-8 space-y-3">
              <Loader2 size={36} className="animate-spin text-primary-500 mx-auto" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">מתאים את קורות החיים...</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">AI מנתח את המשרה ומשנה כותרות, ניסוח ודגשים</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {tailorMutation.isError && (
            <div className="text-center py-6 space-y-3">
              <AlertCircle size={36} className="text-red-500 mx-auto" />
              <p className="font-semibold text-red-600 dark:text-red-400">שגיאה ביצירת קורות החיים</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {(tailorMutation.error as any)?.response?.data?.error?.message || 'נסה שוב מאוחר יותר'}
              </p>
              <button
                onClick={() => tailorMutation.mutate()}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                נסה שוב
              </button>
            </div>
          )}

          {/* Success State - Show tailoring details + download */}
          {tailoredResult && (
            <div className="space-y-4">
              {/* Success banner */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">קורות החיים הותאמו בהצלחה!</p>
                  {tailoredResult.tailoringDetails?.matchPercentage && (
                    <p className="text-xs text-green-600 dark:text-green-400">אחוז התאמה ל-ATS: {tailoredResult.tailoringDetails.matchPercentage}%</p>
                  )}
                </div>
              </div>

              {/* Tailoring details preview */}
              {tailoredResult.tailoringDetails && (
                <div className="space-y-3">
                  {/* Summary */}
                  {tailoredResult.tailoringDetails.summary && (
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">תקציר מקצועי חדש</h4>
                      <p className="text-sm text-gray-800 dark:text-gray-200" dir="ltr">{tailoredResult.tailoringDetails.summary}</p>
                    </div>
                  )}

                  {/* Reshaped experiences */}
                  {tailoredResult.tailoringDetails.experiences?.length > 0 && (
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">תפקידים (ניסוח מותאם)</h4>
                      <div className="space-y-2">
                        {tailoredResult.tailoringDetails.experiences.map((exp: any, i: number) => (
                          <div key={i} className="text-sm" dir="ltr">
                            <span className="font-semibold text-gray-900 dark:text-white">{exp.title}</span>
                            <span className="text-gray-500"> — {exp.company}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {tailoredResult.tailoringDetails.skills?.length > 0 && (
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">כישורים מודגשים</h4>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {tailoredResult.tailoringDetails.skills.slice(0, 12).map((skill: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs dark:bg-primary-900/20 dark:text-primary-400">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Highlights */}
                  {tailoredResult.tailoringDetails.tailoredHighlights?.length > 0 && (
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">נקודות מפתח</h4>
                      <ul className="space-y-1">
                        {tailoredResult.tailoringDetails.tailoredHighlights.map((h: string, i: number) => (
                          <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5" dir="ltr">
                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Download buttons */}
              <div className="flex gap-2">
                {tailoredResult.docxPath && (
                  <button
                    onClick={() => handleDownload(tailoredResult.docxPath, 'docx')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                  >
                    <Download size={16} />
                    הורד Word
                  </button>
                )}
                {tailoredResult.pdfPath && (
                  <button
                    onClick={() => handleDownload(tailoredResult.pdfPath, 'pdf')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                  >
                    <Download size={16} />
                    הורד PDF
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type TimeTab = 'lastSearch' | 'new' | 'week' | 'all'

const MIN_SCORE_OPTIONS = [
  { value: 0, label: 'הכל' },
  { value: 40, label: '40%+' },
  { value: 50, label: '50%+' },
  { value: 60, label: '60%+' },
  { value: 70, label: '70%+' },
  { value: 80, label: '80%+' },
]

const JobBrowser = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [sortByMatch, setSortByMatch] = useState(true)
  const [cvModalJob, setCvModalJob] = useState<any>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Initialize tab from URL param (e.g. ?tab=lastSearch&sid=search_xxx)
  const urlTab = searchParams.get('tab') as TimeTab | null
  const urlSessionId = searchParams.get('sid') || ''
  const [activeTab, setActiveTab] = useState<TimeTab>(urlTab || 'all')
  const [activeSearchSession, setActiveSearchSession] = useState<string>(urlSessionId)
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0)

  const [filters, setFilters] = useState<JobFilters>({
    sort: 'smartScore',
    order: 'desc',
    ...(urlSessionId ? { searchSessionId: urlSessionId } : {}),
  })

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Debounced location
  useEffect(() => {
    const timer = setTimeout(() => {
      if (locationInput !== (filters.location || '')) {
        setFilters(prev => ({ ...prev, location: locationInput || undefined }))
        setPage(1)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [locationInput])

  // Fetch search history
  const { data: searchHistory } = useQuery({
    queryKey: ['search-history'],
    queryFn: async () => {
      const res = await scrapeApi.getSearchHistory()
      return res.data || []
    },
    staleTime: 30_000,
  })

  // Determine the last search session from history (for "חיפוש אחרון" tab)
  const lastSearch = searchHistory?.[0]

  // Compute effective tab filters
  const getTabDatePosted = (tab: TimeTab) => {
    if (tab === 'new') return '24h'
    if (tab === 'week') return '7d'
    return undefined
  }

  const tabDatePosted = getTabDatePosted(activeTab)
  const effectiveDatePosted = filters.datePosted || tabDatePosted

  const queryParams: JobFilters = {
    page,
    limit: 20,
    ...filters,
    datePosted: activeTab !== 'lastSearch' ? effectiveDatePosted : undefined,
    search: debouncedSearch || undefined,
    ...(activeTab === 'lastSearch' && activeSearchSession
      ? { searchSessionId: activeSearchSession }
      : {}),
    ...(minScoreFilter > 0 ? { minSmartScore: minScoreFilter } : {}),
  }

  const { data: jobsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs', page, filters, debouncedSearch, activeTab, activeSearchSession, minScoreFilter],
    queryFn: async () => {
      const res = await jobsApi.list(queryParams)
      return res
    },
  })

  // Fetch counts for each tab so we can show badges
  const { data: countNew } = useQuery({
    queryKey: ['jobs-count-new'],
    queryFn: async () => {
      const res = await jobsApi.list({ page: 1, limit: 1, datePosted: '24h' })
      return res?.meta?.total ?? 0
    },
    staleTime: 60_000,
  })
  const { data: countWeek } = useQuery({
    queryKey: ['jobs-count-week'],
    queryFn: async () => {
      const res = await jobsApi.list({ page: 1, limit: 1, datePosted: '7d' })
      return res?.meta?.total ?? 0
    },
    staleTime: 60_000,
  })
  const { data: countAll } = useQuery({
    queryKey: ['jobs-count-all'],
    queryFn: async () => {
      const res = await jobsApi.list({ page: 1, limit: 1 })
      return res?.meta?.total ?? 0
    },
    staleTime: 60_000,
  })

  const rawJobs: Job[] = jobsResponse?.data || []
  const jobs = rawJobs
  const meta = jobsResponse?.meta || { total: 0, page: 1, limit: 20, pages: 1, hasMore: false }

  // Helper: switch to a specific search session
  const switchToSearchSession = (sessionId: string) => {
    setActiveTab('lastSearch')
    setActiveSearchSession(sessionId)
    setFilters(prev => ({ ...prev, searchSessionId: sessionId, datePosted: undefined }))
    setPage(1)
    setHistoryOpen(false)
  }

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return ''
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'היום'
    if (days === 1) return 'אתמול'
    if (days < 7) return `לפני ${days} ימים`
    if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`
    return d.toLocaleDateString('he-IL')
  }

  const formatSalary = (salary: any) => {
    if (!salary) return null
    const min = salary.min || salary.minimum
    const max = salary.max || salary.maximum
    const currency = salary.currency || '₪'
    if (!min && !max) return null
    if (min && max) return `${currency}${min.toLocaleString()}-${max.toLocaleString()}`
    if (min) return `${currency}${min.toLocaleString()}+`
    return `עד ${currency}${max.toLocaleString()}`
  }

  const getMatchColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
    if (score >= 60) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
    return 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
  }

  const truncateDescription = (desc: string, maxLen = 200) => {
    if (!desc) return 'אין תיאור זמין למשרה זו'
    if (desc.length <= maxLen) return desc
    return desc.substring(0, maxLen) + '...'
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="animate-spin text-primary-500" />
        <p className="text-gray-500 dark:text-gray-400">טוען משרות...</p>
      </div>
    )
  }

  const tabCounts: Record<string, number | undefined> = {
    new: countNew,
    week: countWeek,
    all: countAll,
  }

  // Format search time for history
  const fmtSearchTime = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'עכשיו'
    if (mins < 60) return `לפני ${mins} דקות`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `לפני ${hours} שעות`
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  // Check if any non-default filters are active
  const hasActiveFilters = !!(filters.source || filters.locationType || filters.experienceLevel || filters.location || minScoreFilter > 0 || !sortByMatch)

  return (
    <div className="space-y-4" dir="rtl">
      {/* Time Tabs + Search History */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          {/* Last Search tab */}
          {lastSearch && (
            <button
              onClick={() => {
                switchToSearchSession(lastSearch.id)
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'lastSearch'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Zap size={13} />
              חיפוש אחרון
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'lastSearch'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {lastSearch.results.totalSaved}
              </span>
            </button>
          )}

          {/* Standard tabs */}
          {[
            { key: 'new' as TimeTab, label: 'חדשות' },
            { key: 'week' as TimeTab, label: 'השבוע' },
            { key: 'all' as TimeTab, label: 'כל המשרות' },
          ].map((tab) => {
            const isActive = activeTab === tab.key
            const count = tabCounts[tab.key]
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  setActiveSearchSession('')
                  setPage(1)
                  setFilters(prev => ({
                    ...prev,
                    datePosted: undefined,
                    searchSessionId: undefined,
                    sort: sortByMatch ? 'smartScore' : 'createdAt',
                  }))
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
                {count != null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search history dropdown */}
        {searchHistory && searchHistory.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className={`p-2.5 rounded-xl border text-sm transition-all ${
                historyOpen
                  ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/30'
              }`}
              title="היסטוריית חיפושים"
            >
              <History size={18} />
            </button>

            {historyOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHistoryOpen(false)} />
                <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">היסטוריית חיפושים</h3>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2 space-y-1">
                    {searchHistory.map((entry: SearchHistoryEntry) => (
                      <button
                        key={entry.id}
                        onClick={() => switchToSearchSession(entry.id)}
                        className={`w-full p-3 rounded-xl text-right transition-all ${
                          activeSearchSession === entry.id
                            ? 'bg-primary-50 border border-primary-200 dark:bg-primary-900/20 dark:border-primary-700'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">{fmtSearchTime(entry.timestamp)}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{entry.results.totalSaved}</span>
                            <span className="text-xs text-gray-400">משרות</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.config.keywords?.slice(0, 4).map((kw, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px] text-gray-600 dark:text-gray-400" dir="ltr">
                              {kw}
                            </span>
                          ))}
                          {entry.config.location && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-[10px] text-blue-600 dark:text-blue-400">
                              {entry.config.location}
                            </span>
                          )}
                          {entry.results.avgScore > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-[10px] text-green-600 dark:text-green-400">
                              ממוצע {entry.results.avgScore}%
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Last Search info banner */}
      {activeTab === 'lastSearch' && lastSearch && activeSearchSession === lastSearch.id && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-700/30 p-3 flex items-center gap-3">
          <Zap size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>חיפוש אחרון</strong> — {lastSearch.results.totalSaved} משרות נמצאו
              {lastSearch.config.keywords?.length ? ` • ${lastSearch.config.keywords.slice(0, 3).join(', ')}` : ''}
              {lastSearch.config.location ? ` • ${lastSearch.config.location}` : ''}
              {lastSearch.results.avgScore > 0 ? ` • ציון ממוצע ${lastSearch.results.avgScore}%` : ''}
            </p>
          </div>
          <span className="text-xs text-blue-500 dark:text-blue-400 flex-shrink-0">{fmtSearchTime(lastSearch.timestamp)}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="חפש לפי כותרת, חברה או טכנולוגיה..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
          />
        </div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className={`p-2.5 rounded-xl border transition-colors ${
            advancedOpen || hasActiveFilters
              ? 'border-primary-400 bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-600'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
          }`}
          title="פילטרים מתקדמים"
        >
          <SlidersHorizontal size={18} />
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          title="רענון"
        >
          <RefreshCw size={18} className="text-gray-500" />
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {advancedOpen && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">פילטרים מתקדמים</h4>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilters({ sort: 'smartScore', order: 'desc' })
                  setLocationInput('')
                  setSortByMatch(true)
                  setMinScoreFilter(0)
                  setPage(1)
                }}
                className="text-xs text-red-500 hover:text-red-600 font-medium"
              >
                נקה הכל
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Min Score */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">ציון התאמה מינימלי</label>
              <select
                value={minScoreFilter}
                onChange={(e) => { setMinScoreFilter(Number(e.target.value)); setPage(1) }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
              >
                {MIN_SCORE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">מקור</label>
              <select
                value={filters.source || ''}
                onChange={(e) => { setFilters({ ...filters, source: e.target.value || undefined }); setPage(1) }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
              >
                <option value="">כל המקורות</option>
                {Object.entries(SOURCE_DISPLAY).map(([key, info]) => (
                  <option key={key} value={key}>{info.label}</option>
                ))}
              </select>
            </div>

            {/* Location type */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">סוג עבודה</label>
              <select
                value={filters.locationType || ''}
                onChange={(e) => { setFilters({ ...filters, locationType: e.target.value || undefined }); setPage(1) }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
              >
                <option value="">הכל</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">On-site</option>
              </select>
            </div>

            {/* Experience */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">רמת ניסיון</label>
              <select
                value={filters.experienceLevel || ''}
                onChange={(e) => { setFilters({ ...filters, experienceLevel: e.target.value || undefined }); setPage(1) }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
              >
                <option value="">הכל</option>
                <option value="ENTRY">Entry Level</option>
                <option value="JUNIOR">Junior</option>
                <option value="MID">Mid Level</option>
                <option value="SENIOR">Senior</option>
                <option value="LEAD">Lead</option>
              </select>
            </div>
          </div>

          {/* Location search + sort toggle */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">חיפוש מיקום</label>
              <div className="relative">
                <MapPin size={14} className="absolute right-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="תל אביב, ירושלים..."
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
              </div>
            </div>
            <button
              onClick={() => {
                const newSortByMatch = !sortByMatch
                setSortByMatch(newSortByMatch)
                setFilters(prev => ({
                  ...prev,
                  sort: newSortByMatch ? 'smartScore' : 'createdAt',
                }))
                setPage(1)
              }}
              className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
                sortByMatch
                  ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-600'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              <Target size={14} className="inline ml-1" />
              מיון לפי התאמה
            </button>
          </div>
        </div>
      )}

      {/* Active filters summary (chips) */}
      {hasActiveFilters && !advancedOpen && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400">פילטרים:</span>
          {minScoreFilter > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-green-50 text-green-700 text-xs dark:bg-green-900/20 dark:text-green-400">
              {minScoreFilter}%+ התאמה
              <button onClick={() => { setMinScoreFilter(0); setPage(1) }} className="hover:text-red-500"><X size={10} /></button>
            </span>
          )}
          {filters.source && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs dark:bg-blue-900/20 dark:text-blue-400">
              {SOURCE_DISPLAY[filters.source]?.label || filters.source}
              <button onClick={() => { setFilters(prev => ({ ...prev, source: undefined })); setPage(1) }} className="hover:text-red-500"><X size={10} /></button>
            </span>
          )}
          {filters.locationType && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 text-xs dark:bg-purple-900/20 dark:text-purple-400">
              {filters.locationType}
              <button onClick={() => { setFilters(prev => ({ ...prev, locationType: undefined })); setPage(1) }} className="hover:text-red-500"><X size={10} /></button>
            </span>
          )}
          {filters.experienceLevel && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-xs dark:bg-amber-900/20 dark:text-amber-400">
              {filters.experienceLevel}
              <button onClick={() => { setFilters(prev => ({ ...prev, experienceLevel: undefined })); setPage(1) }} className="hover:text-red-500"><X size={10} /></button>
            </span>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {meta.total > 0
          ? `${meta.total} משרות נמצאו`
          : 'לא נמצאו משרות'}
        {minScoreFilter > 0 && meta.total > 0 && (
          <span className="text-green-600 dark:text-green-400 mr-2">({minScoreFilter}%+ התאמה)</span>
        )}
      </div>

      {/* Jobs List */}
      {jobs.length > 0 ? (
        <>
          <div className="space-y-3">
            {jobs.map((job: any) => {
              const sourceBadge = SOURCE_DISPLAY[job.source] || { label: job.source, color: 'gray' as const }
              const salary = formatSalary(job.salary)
              const isExpanded = expandedJob === job.id
              const smartData = getSmartScore(job)
              const matchScore = smartData.score
              const categoryInfo = CATEGORY_LABELS[smartData.category] || CATEGORY_LABELS['UNKNOWN']

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 overflow-hidden transition-all duration-200 hover:shadow-md"
                >
                  {/* Main row */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Match score circle */}
                      <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold ${getMatchColor(matchScore)}`}>
                        {matchScore}%
                      </div>

                      {/* Job info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-tight" dir="ltr">
                              {job.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1" dir="ltr">
                                <Building2 size={14} className="text-gray-400" />
                                {job.company}
                              </span>
                              <Badge variant={sourceBadge.color} size="sm">{sourceBadge.label}</Badge>
                              {job.locationType && (
                                <Badge variant="gray" size="sm">{job.locationType}</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                          {job.location && (
                            <span className="flex items-center gap-1" dir="ltr">
                              <MapPin size={12} />
                              {job.location}
                            </span>
                          )}
                          {salary && (
                            <span className="flex items-center gap-1" dir="ltr">
                              <Briefcase size={12} />
                              {salary}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatDate(job.postedAt || job.scrapedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {job.sourceUrl && (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title="למשרה המקורית"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCvModalJob(job)
                          }}
                          className="p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          title="התאם CV למשרה"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Category badge next to source */}
                  {categoryInfo.label && (
                    <div className="px-4 pb-0 -mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${categoryInfo.color}`}>
                        {categoryInfo.label}
                      </span>
                    </div>
                  )}

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50 pt-3 animate-fade-in">
                      {/* Smart Match Analysis */}
                      <div className="mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Target size={14} className="text-primary-500" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {smartData.hasSmartScore ? 'ניתוח התאמה חכם' : 'ניתוח התאמה'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getMatchColor(matchScore)}`}>
                            {matchScore}%
                          </span>
                          {categoryInfo.label && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${categoryInfo.color}`}>
                              {categoryInfo.label}
                            </span>
                          )}
                        </div>

                        {/* AI Reasoning */}
                        {smartData.reasoning && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            {smartData.reasoning}
                          </p>
                        )}

                        {!smartData.reasoning && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                            {matchScore >= 80
                              ? 'התאמה גבוהה! הפרופיל שלך מתאים מאוד למשרה הזו. מומלץ להגיש מועמדות.'
                              : matchScore >= 60
                              ? 'התאמה טובה. יש חפיפה משמעותית בין הכישורים שלך לדרישות המשרה.'
                              : 'התאמה בסיסית. כדאי לשקול אם התפקיד מתאים לכיוון הקריירה שלך.'}
                          </p>
                        )}

                        {/* Score breakdown bars */}
                        {smartData.hasSmartScore && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {[
                              { label: 'כיסוי דרישות', value: job.rawData?.skillMatch },
                              { label: 'התאמת ניסיון', value: job.rawData?.experienceMatch },
                              { label: 'התאמת תפקיד', value: job.rawData?.roleRelevance },
                            ].filter(b => b.value != null).map((bar) => (
                              <div key={bar.label}>
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                                  <span>{bar.label}</span>
                                  <span>{bar.value}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      bar.value >= 75 ? 'bg-green-500' : bar.value >= 50 ? 'bg-amber-500' : 'bg-red-400'
                                    }`}
                                    style={{ width: `${bar.value}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Matched & missing skills */}
                        {smartData.matchedSkills.length > 0 && (
                          <div className="mt-2">
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">כישורים תואמים: </span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {smartData.matchedSkills.slice(0, 8).join(', ')}
                            </span>
                          </div>
                        )}
                        {smartData.missingSkills.length > 0 && (
                          <div className="mt-1">
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">כישורים חסרים: </span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {smartData.missingSkills.slice(0, 6).join(', ')}
                            </span>
                          </div>
                        )}

                        {/* Green & Red flags */}
                        {(smartData.greenFlags.length > 0 || smartData.redFlags.length > 0) && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {smartData.greenFlags.map((flag, i) => (
                              <span key={`g${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs dark:bg-green-900/20 dark:text-green-400">
                                ✓ {flag}
                              </span>
                            ))}
                            {smartData.redFlags.map((flag, i) => (
                              <span key={`r${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs dark:bg-red-900/20 dark:text-red-400">
                                ⚠ {flag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Job description */}
                      <div className="mb-3">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">תיאור המשרה</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line" dir="ltr">
                          {truncateDescription(job.description, 500)}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setCvModalJob(job)}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-purple-500 text-white text-sm font-medium hover:shadow-md transition-all"
                        >
                          <Sparkles size={14} />
                          התאם CV למשרה
                        </button>
                        {job.sourceUrl && (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <ExternalLink size={14} />
                            צפה במשרה המקורית
                          </a>
                        )}
                        <button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          פרטים מלאים
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <Pagination page={meta.page} pages={meta.pages} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState
          icon={Search}
          title="לא נמצאו משרות"
          description={isError
            ? "לא ניתן להתחבר לשרת. ודא שהשרת פועל."
            : "אין משרות במאגר עדיין. לך לדשבורד והפעל חיפוש כדי למצוא משרות!"}
        />
      )}

      {/* CV Tailoring Modal */}
      {cvModalJob && (
        <CVModal job={cvModalJob} onClose={() => setCvModalJob(null)} />
      )}
    </div>
  )
}

export default JobBrowser
