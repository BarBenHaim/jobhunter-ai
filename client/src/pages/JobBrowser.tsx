import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { Job, JobFilters } from '@/types'
import { jobsApi } from '@/services/jobs.api'

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
  // Priority 1: Smart local score from rawData (set by smart-trigger)
  const rawData = job.rawData || {}
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

  // Priority 2: AI scoring (from JobScore model)
  if (job.scores?.length > 0) {
    const s = job.scores[0]
    return {
      score: Math.round(s.overallScore),
      category: s.recommendation || 'UNKNOWN',
      reasoning: s.reasoning || '',
      matchedSkills: s.matchedSkills || [],
      missingSkills: s.missingSkills || [],
      greenFlags: [],
      redFlags: s.redFlags || [],
      hasSmartScore: false,
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

const JobBrowser = () => {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [sortByMatch, setSortByMatch] = useState(false)
  const [filters, setFilters] = useState<JobFilters>({
    sort: 'createdAt',
    order: 'desc',
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

  const queryParams: JobFilters = {
    page,
    limit: 20,
    ...filters,
    search: debouncedSearch || undefined,
  }

  const { data: jobsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs', page, filters, debouncedSearch],
    queryFn: async () => {
      const res = await jobsApi.list(queryParams)
      return res
    },
  })

  const rawJobs: Job[] = jobsResponse?.data || []
  // Client-side sort by smart score if enabled
  const jobs = sortByMatch
    ? [...rawJobs].sort((a: any, b: any) => {
        const aScore = a.rawData?.smartScore ?? (a.scores?.[0]?.overallScore ?? 0)
        const bScore = b.rawData?.smartScore ?? (b.scores?.[0]?.overallScore ?? 0)
        return bScore - aScore
      })
    : rawJobs
  const meta = jobsResponse?.meta || { total: 0, page: 1, limit: 20, pages: 1, hasMore: false }

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

  return (
    <div className="space-y-4" dir="rtl">
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
          onClick={() => refetch()}
          className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          title="רענון"
        >
          <RefreshCw size={18} className="text-gray-500" />
        </button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filters.source || ''}
          onChange={(e) => { setFilters({ ...filters, source: e.target.value || undefined }); setPage(1) }}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
        >
          <option value="">כל המקורות</option>
          {Object.entries(SOURCE_DISPLAY).map(([key, info]) => (
            <option key={key} value={key}>{info.label}</option>
          ))}
        </select>

        <select
          value={filters.locationType || ''}
          onChange={(e) => { setFilters({ ...filters, locationType: e.target.value || undefined }); setPage(1) }}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
        >
          <option value="">סוג עבודה</option>
          <option value="REMOTE">Remote</option>
          <option value="HYBRID">Hybrid</option>
          <option value="ONSITE">On-site</option>
        </select>

        <select
          value={filters.experienceLevel || ''}
          onChange={(e) => { setFilters({ ...filters, experienceLevel: e.target.value || undefined }); setPage(1) }}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
        >
          <option value="">רמת ניסיון</option>
          <option value="ENTRY">Entry Level</option>
          <option value="JUNIOR">Junior</option>
          <option value="MID">Mid Level</option>
          <option value="SENIOR">Senior</option>
          <option value="LEAD">Lead</option>
        </select>

        <select
          value={filters.datePosted || ''}
          onChange={(e) => { setFilters({ ...filters, datePosted: e.target.value || undefined }); setPage(1) }}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
        >
          <option value="">זמן פרסום</option>
          <option value="24h">24 שעות אחרונות</option>
          <option value="7d">שבוע אחרון</option>
          <option value="30d">חודש אחרון</option>
        </select>

        {/* Sort by match toggle */}
        <button
          onClick={() => setSortByMatch(!sortByMatch)}
          className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
            sortByMatch
              ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-600'
              : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <Target size={14} className="inline ml-1" />
          מיון לפי התאמה
        </button>

        {(filters.source || filters.locationType || filters.experienceLevel || filters.datePosted || filters.location) && (
          <button
            onClick={() => {
              setFilters({ sort: 'createdAt', order: 'desc' })
              setLocationInput('')
              setSearchInput('')
              setSortByMatch(false)
              setPage(1)
            }}
            className="px-3 py-2 text-sm text-red-500 hover:text-red-600 font-medium"
          >
            נקה הכל
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {meta.total > 0
          ? `${meta.total} משרות נמצאו`
          : 'לא נמצאו משרות'}
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
                            navigate(`/cv-generator?jobId=${job.id}`)
                          }}
                          className="p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          title="צור CV מותאם"
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
                          onClick={() => navigate(`/cv-generator?jobId=${job.id}`)}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-purple-500 text-white text-sm font-medium hover:shadow-md transition-all"
                        >
                          <FileText size={14} />
                          צור CV מותאם
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
    </div>
  )
}

export default JobBrowser
