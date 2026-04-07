import { useState, useEffect } from 'react'
import { intelligenceApi } from '@/services/intelligence.api'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Lightbulb,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  Award,
  FileText,
} from 'lucide-react'

interface IntelligenceData {
  totalApplications: number
  responseRate: number
  interviewRate: number
  offerRate: number
  avgDaysToResponse: number
  bestPerformingCVVariant: string | null
  topRespondingCompanies: { company: string; count: number; rate: number }[]
  topRespondingRoles: { role: string; count: number; rate: number }[]
  weakSpots: string[]
  strengths: string[]
  recommendations: string[]
}

interface FunnelData {
  funnel: Record<string, number>
  weeklyTrend: { week: string; applied: number; responded: number; total: number }[]
  total: number
}

interface Pattern {
  jobId: string
  jobTitle: string
  company: string
  status: string
  appliedAt: string | null
  responseAt: string | null
  daysToResponse: number | null
  responseType: string | null
  cvVariant: string | null
  jobDescription: string
  matchedSkills: string[]
  missingSkills: string[]
  score: number | null
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  CV_GENERATED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  AWAITING_REVIEW: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  APPROVED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  APPLIED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  VIEWED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  RESPONDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  INTERVIEW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  OFFER: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  WITHDRAWN: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const FUNNEL_ORDER = ['PENDING', 'CV_GENERATED', 'AWAITING_REVIEW', 'APPROVED', 'APPLIED', 'VIEWED', 'RESPONDED', 'INTERVIEW', 'OFFER']

export default function Intelligence() {
  const [overview, setOverview] = useState<IntelligenceData | null>(null)
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'funnel'>('overview')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [overviewRes, funnelRes, patternsRes] = await Promise.all([
        intelligenceApi.getOverview().catch(() => null),
        intelligenceApi.getFunnel().catch(() => null),
        intelligenceApi.getPatterns().catch(() => null),
      ])

      if (overviewRes?.data) setOverview(overviewRes.data)
      if (funnelRes?.data) setFunnel(funnelRes.data)
      if (patternsRes?.data) setPatterns(patternsRes.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load intelligence data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary-500" />
        <span className="ml-3 text-gray-500">Loading intelligence...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary-500" />
            Application Intelligence
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            AI-powered analysis of your application outcomes and patterns
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {(['overview', 'patterns', 'funnel'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'overview' && 'Overview'}
            {tab === 'patterns' && 'Response Patterns'}
            {tab === 'funnel' && 'Application Funnel'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              label="Total Applications"
              value={overview.totalApplications}
              icon={<FileText size={20} />}
              color="blue"
            />
            <KPICard
              label="Response Rate"
              value={`${overview.responseRate}%`}
              icon={<TrendingUp size={20} />}
              color={overview.responseRate > 15 ? 'green' : overview.responseRate > 5 ? 'yellow' : 'red'}
            />
            <KPICard
              label="Interview Rate"
              value={`${overview.interviewRate}%`}
              icon={<Target size={20} />}
              color={overview.interviewRate > 10 ? 'green' : 'yellow'}
            />
            <KPICard
              label="Offer Rate"
              value={`${overview.offerRate}%`}
              icon={<Award size={20} />}
              color={overview.offerRate > 5 ? 'green' : 'gray'}
            />
            <KPICard
              label="Avg Response Time"
              value={overview.avgDaysToResponse > 0 ? `${overview.avgDaysToResponse} days` : 'N/A'}
              icon={<Clock size={20} />}
              color="purple"
            />
          </div>

          {/* Best CV Variant */}
          {overview.bestPerformingCVVariant && (
            <div className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 p-5">
              <div className="flex items-center gap-3">
                <Zap className="h-6 w-6 text-primary-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Best Performing CV Variant</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                    {overview.bestPerformingCVVariant}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Strengths & Weak Spots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.strengths.length > 0 && (
              <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-white dark:bg-gray-800 p-5">
                <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2 mb-3">
                  <CheckCircle size={16} />
                  Strengths
                </h3>
                <ul className="space-y-2">
                  {overview.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {overview.weakSpots.length > 0 && (
              <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 p-5">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2 mb-3">
                  <TrendingDown size={16} />
                  Areas to Improve
                </h3>
                <ul className="space-y-2">
                  {overview.weakSpots.map((w, i) => (
                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">!</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recommendations */}
          {overview.recommendations.length > 0 && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 p-5">
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2 mb-3">
                <Lightbulb size={16} />
                AI Recommendations
              </h3>
              <ul className="space-y-2">
                {overview.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 font-bold">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top Companies & Roles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.topRespondingCompanies.length > 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Responding Companies</h3>
                <div className="space-y-2">
                  {overview.topRespondingCompanies.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{c.company}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{c.count} responses</span>
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          {c.rate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overview.topRespondingRoles.length > 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Responding Role Types</h3>
                <div className="space-y-2">
                  {overview.topRespondingRoles.slice(0, 5).map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{r.role}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{r.count} responses</span>
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          {r.rate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state for overview */}
      {activeTab === 'overview' && !overview && !loading && (
        <EmptyState message="No intelligence data yet. Start applying to jobs and tracking responses to build your intelligence profile." />
      )}

      {/* Patterns Tab */}
      {activeTab === 'patterns' && (
        <div className="space-y-3">
          {patterns.length === 0 ? (
            <EmptyState message="No application patterns yet. Apply to jobs and mark their status as they progress to see patterns." />
          ) : (
            patterns.map((p) => (
              <div
                key={p.jobId}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedPattern(expandedPattern === p.jobId ? null : p.jobId)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || STATUS_COLORS.PENDING}`}>
                      {p.status}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{p.jobTitle}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{p.company}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {p.score != null && (
                      <span className={`text-sm font-medium ${
                        p.score >= 75 ? 'text-green-600 dark:text-green-400' :
                        p.score >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {p.score}%
                      </span>
                    )}
                    {p.daysToResponse != null && (
                      <span className="text-xs text-gray-400">{p.daysToResponse}d to respond</span>
                    )}
                    {expandedPattern === p.jobId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {expandedPattern === p.jobId && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">Applied</p>
                        <p className="text-gray-700 dark:text-gray-300">
                          {p.appliedAt ? new Date(p.appliedAt).toLocaleDateString() : 'Not yet'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Response</p>
                        <p className="text-gray-700 dark:text-gray-300">
                          {p.responseAt ? new Date(p.responseAt).toLocaleDateString() : 'Pending'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">CV Variant</p>
                        <p className="text-gray-700 dark:text-gray-300 capitalize">{p.cvVariant || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Response Type</p>
                        <p className="text-gray-700 dark:text-gray-300">{p.responseType || 'N/A'}</p>
                      </div>
                    </div>

                    {p.matchedSkills.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Matched Skills</p>
                        <div className="flex flex-wrap gap-1">
                          {p.matchedSkills.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {p.missingSkills.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Missing Skills</p>
                        <div className="flex flex-wrap gap-1">
                          {p.missingSkills.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{p.jobDescription}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Funnel Tab */}
      {activeTab === 'funnel' && funnel && (
        <div className="space-y-6">
          {/* Funnel Visualization */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-4">
              <BarChart3 size={16} />
              Application Funnel
            </h3>
            <div className="space-y-2">
              {FUNNEL_ORDER.map(status => {
                const count = funnel.funnel[status] || 0
                const maxCount = Math.max(...Object.values(funnel.funnel), 1)
                const pct = (count / maxCount) * 100

                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-32 text-right">
                      {status.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-lg flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                      >
                        {count > 0 && (
                          <span className="text-xs font-medium text-white">{count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total: <span className="font-semibold text-gray-700 dark:text-gray-300">{funnel.total}</span> applications
              </p>
            </div>
          </div>

          {/* Weekly Trend */}
          {funnel.weeklyTrend.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Weekly Activity (Last 30 Days)</h3>
              <div className="space-y-3">
                {funnel.weeklyTrend.map((week) => (
                  <div key={week.week} className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 w-24">{week.week}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="h-3 bg-primary-400 rounded" style={{ width: `${week.total * 8}px` }} />
                        <span className="text-xs text-gray-500">{week.total} created</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 bg-purple-400 rounded" style={{ width: `${week.applied * 8}px` }} />
                        <span className="text-xs text-gray-500">{week.applied} applied</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 bg-green-400 rounded" style={{ width: `${week.responded * 8}px` }} />
                        <span className="text-xs text-gray-500">{week.responded} responded</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'funnel' && !funnel && !loading && (
        <EmptyState message="No funnel data available yet. Apply to some jobs to see your application pipeline." />
      )}

      {/* How Intelligence Works */}
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4" dir="rtl">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>איך האינטליגנציה עובדת:</strong> המערכת עוקבת אחר כל שליחת קו"ח, מנתחת דפוסים בין תיאורי משרה לתגובות מעסיקים,
          ולומדת באופן אוטומטי מה עובד ומה לא. ככל שתעדכן יותר סטטוסים (תגובה, ראיון, הצעה, דחייה),
          כך ההמלצות יהיו מדויקות יותר. המערכת גם מתאימה את ציוני המשרות על בסיס מה שלמדה מהתוצאות שלך.
        </p>
      </div>
    </div>
  )
}

function KPICard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${colorClasses[color]} mb-2`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
      <Brain className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">{message}</p>
    </div>
  )
}
