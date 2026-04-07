import { useState, useEffect } from 'react'
import { discoveryApi } from '@/services/discovery.api'
import {
  Search,
  Building2,
  Rocket,
  TrendingUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Crown,
  Zap,
  Target,
  Globe,
  DollarSign,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Briefcase,
  Filter,
} from 'lucide-react'

interface Company {
  name: string
  slug: string
  category: 'unicorn' | 'top_company' | 'growing'
  description: string
  atsProvider: string
  careersUrl: string
}

interface FundedStartup {
  name: string
  description: string
  fundingAmount?: string
  fundingRound?: string
  fundingDate?: string
  source: string
}

interface ScanResult {
  company: string
  jobCount: number
  jobs?: { title: string; location: string; department?: string; sourceUrl?: string }[]
  sampleJobs?: { title: string; location: string }[]
}

const CATEGORY_CONFIG = {
  unicorn: { label: 'Unicorns', icon: Crown, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
  top_company: { label: 'Top Companies', icon: Building2, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
  growing: { label: 'Hot & Growing', icon: Rocket, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800' },
}

export default function Discovery() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [fundedStartups, setFundedStartups] = useState<FundedStartup[]>([])
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanningFunding, setScanningFunding] = useState(false)
  const [activeTab, setActiveTab] = useState<'companies' | 'funded' | 'scan'>('companies')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchKeywords, setSearchKeywords] = useState('')
  const [scanStats, setScanStats] = useState<any>(null)
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)
  const [scanningCompany, setScanningCompany] = useState<string | null>(null)
  const [companyJobs, setCompanyJobs] = useState<Record<string, any[]>>({})

  useEffect(() => {
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    setLoading(true)
    try {
      const res = await discoveryApi.getCompanies()
      if (res?.data) {
        setCompanies(res.data)
        setCategoryCounts(res.meta?.categories || {})
      }
    } catch (err) {
      console.error('Failed to load companies:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleScanCareers = async () => {
    setScanning(true)
    setScanResults([])
    setScanStats(null)
    try {
      const keywords = searchKeywords
        ? searchKeywords.split(',').map(k => k.trim()).filter(Boolean)
        : undefined
      const categories = filterCategory !== 'all' ? [filterCategory] : undefined
      const res = await discoveryApi.scanCareers(keywords, categories)
      if (res?.data) {
        setScanResults(res.data.results || [])
        setScanStats({
          companiesScanned: res.data.companiesScanned,
          companiesWithJobs: res.data.companiesWithJobs,
          totalJobsFound: res.data.totalJobsFound,
          newJobsSaved: res.data.newJobsSaved,
          duplicatesSkipped: res.data.duplicatesSkipped,
        })
      }
    } catch (err) {
      console.error('Career scan failed:', err)
    } finally {
      setScanning(false)
    }
  }

  const handleDiscoverFunding = async () => {
    setScanningFunding(true)
    setFundedStartups([])
    try {
      const res = await discoveryApi.discoverFundedStartups()
      if (res?.data) {
        setFundedStartups(res.data.startups || [])
      }
    } catch (err) {
      console.error('Funding discovery failed:', err)
    } finally {
      setScanningFunding(false)
    }
  }

  const handleScanSingleCompany = async (slug: string) => {
    setScanningCompany(slug)
    try {
      const res = await discoveryApi.scanCompany(slug)
      if (res?.data) {
        setCompanyJobs(prev => ({
          ...prev,
          [slug]: res.data.jobs || [],
        }))
        setExpandedCompany(slug)
      }
    } catch (err) {
      console.error(`Failed to scan ${slug}:`, err)
    } finally {
      setScanningCompany(null)
    }
  }

  const filteredCompanies = filterCategory === 'all'
    ? companies
    : companies.filter(c => c.category === filterCategory)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary-500" />
        <span className="ml-3 text-gray-500">Loading companies...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary-500" />
            Company Discovery
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Smart discovery — find recently funded startups and scan top company career pages
          </p>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {([
          { key: 'companies', label: 'Top Companies', icon: Building2 },
          { key: 'funded', label: 'Funded Startups', icon: DollarSign },
          { key: 'scan', label: 'Career Scan', icon: Target },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TOP COMPANIES TAB ===== */}
      {activeTab === 'companies' && (
        <div className="space-y-4">
          {/* Category filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filterCategory === 'all'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              All ({companies.length})
            </button>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setFilterCategory(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  filterCategory === key
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                }`}
              >
                <config.icon size={14} />
                {config.label} ({categoryCounts[key] || 0})
              </button>
            ))}
          </div>

          {/* Company Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCompanies.map(company => {
              const catConfig = CATEGORY_CONFIG[company.category]
              const isExpanded = expandedCompany === company.slug
              const jobs = companyJobs[company.slug] || []

              return (
                <div
                  key={company.slug}
                  className={`rounded-2xl border ${catConfig.border} bg-white dark:bg-gray-800 overflow-hidden transition-all`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <catConfig.icon size={16} className={catConfig.color} />
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                            {company.name}
                          </h3>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {company.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 capitalize">
                        {company.atsProvider}
                      </span>

                      <a
                        href={company.careersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-1 ml-auto"
                      >
                        Careers <ExternalLink size={10} />
                      </a>
                    </div>

                    {/* Scan button */}
                    {company.atsProvider !== 'custom' && (
                      <button
                        onClick={() => handleScanSingleCompany(company.slug)}
                        disabled={scanningCompany === company.slug}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors disabled:opacity-50"
                      >
                        {scanningCompany === company.slug ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Scanning...
                          </>
                        ) : (
                          <>
                            <Search size={12} />
                            Scan for Israel Jobs
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Jobs found for this company */}
                  {jobs.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-3">
                      <button
                        onClick={() => setExpandedCompany(isExpanded ? null : company.slug)}
                        className="flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400 w-full"
                      >
                        <CheckCircle size={12} />
                        {jobs.length} Israel jobs found
                        {isExpanded ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {jobs.map((job: any, i: number) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{job.title}</p>
                                <p className="text-xs text-gray-400">{job.location}{job.department ? ` · ${job.department}` : ''}</p>
                              </div>
                              {job.sourceUrl && (
                                <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary-500 flex-shrink-0 ml-2">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== FUNDED STARTUPS TAB ===== */}
      {activeTab === 'funded' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleDiscoverFunding}
              disabled={scanningFunding}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium text-sm shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/30 transition-all disabled:opacity-50"
            >
              {scanningFunding ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <DollarSign size={16} />
                  Discover Funded Startups
                </>
              )}
            </button>
            <p className="text-xs text-gray-400">
              Searches news sources for Israeli startups that recently raised funding
            </p>
          </div>

          {fundedStartups.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Found {fundedStartups.length} recently funded startups:
              </p>
              {fundedStartups.map((startup, i) => (
                <div key={i} className="rounded-2xl border border-green-200 dark:border-green-800 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Rocket size={16} className="text-green-500" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">{startup.name}</h3>
                        {startup.fundingAmount && (
                          <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                            {startup.fundingAmount}
                          </span>
                        )}
                        {startup.fundingRound && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium capitalize">
                            {startup.fundingRound}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{startup.description}</p>
                    </div>
                    {startup.source && (
                      <a href={startup.source} target="_blank" rel="noopener noreferrer" className="text-primary-500 flex-shrink-0">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : !scanningFunding ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
              <DollarSign className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Click "Discover Funded Startups" to search for Israeli startups that recently raised funding.
                <br />
                Companies that just raised money are actively hiring!
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* ===== CAREER SCAN TAB ===== */}
      {activeTab === 'scan' && (
        <div className="space-y-4">
          {/* Scan Controls */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Target size={16} />
              Mass Career Page Scan
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Scans the career pages of all curated companies (Greenhouse, Lever, Ashby APIs) for jobs in Israel matching your keywords.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Keywords (comma-separated, e.g. React, Backend, AI)"
                value={searchKeywords}
                onChange={e => setSearchKeywords(e.target.value)}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />

              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300"
              >
                <option value="all">All Categories</option>
                <option value="unicorn">Unicorns</option>
                <option value="top_company">Top Companies</option>
                <option value="growing">Hot & Growing</option>
              </select>

              <button
                onClick={handleScanCareers}
                disabled={scanning}
                className="flex items-center justify-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium text-sm shadow-lg shadow-primary-500/20 hover:shadow-xl transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {scanning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Scanning {companies.length} companies...
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Scan All Careers
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scan Stats */}
          {scanStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Companies Scanned" value={scanStats.companiesScanned} />
              <StatCard label="Companies with Jobs" value={scanStats.companiesWithJobs} />
              <StatCard label="Total Jobs Found" value={scanStats.totalJobsFound} />
              <StatCard label="New Jobs Saved" value={scanStats.newJobsSaved} color="green" />
              <StatCard label="Duplicates Skipped" value={scanStats.duplicatesSkipped} color="gray" />
            </div>
          )}

          {/* Scan Results */}
          {scanResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Companies with open Israel positions:
              </h3>
              {scanResults.map((result, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-primary-500" />
                      <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{result.company}</h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                      {result.jobCount} jobs
                    </span>
                  </div>
                  {(result.jobs || result.sampleJobs || []).map((job: any, j: number) => (
                    <div key={j} className="flex items-center justify-between py-1">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                          {job.title}
                        </p>
                        <p className="text-xs text-gray-400">
                          {job.location}{job.department ? ` · ${job.department}` : ''}
                        </p>
                      </div>
                      {job.sourceUrl && (
                        <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary-500 flex-shrink-0 ml-2">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!scanning && scanResults.length === 0 && !scanStats && (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
              <Target className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Scan all {companies.length} company career pages at once to find open positions in Israel.
                <br />
                Optionally filter by keywords and company category.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Explanation */}
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4" dir="rtl">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>איך זה עובד:</strong> המערכת מכילה רשימה של {companies.length}+ חברות טכנולוגיה מובילות בישראל
          (יוניקורנים, חברות מוכרות, סטארטאפים חמים). בלחיצה אחת, היא סורקת את כל עמודי הקריירה שלהן דרך
          ה-API של Greenhouse, Lever ו-Ashby ומוצאת משרות פתוחות בישראל. בנוסף, היא מחפשת סטארטאפים שגייסו
          כספים לאחרונה — כי חברות שגייסו כסף מגייסות עובדים!
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value, color = 'blue' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-primary-600 dark:text-primary-400',
    green: 'text-green-600 dark:text-green-400',
    gray: 'text-gray-500 dark:text-gray-400',
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-center">
      <p className={`text-xl font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}
