import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Grid3x3,
  List,
  MapPin,
  Briefcase,
  ExternalLink,
  CheckSquare,
  Square,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { Job, JobSource, LocationType, JobFilters } from '@/types'
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

const JobBrowser = () => {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')
  const [page, setPage] = useState(1)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState<JobFilters>({
    sort: 'createdAt',
    order: 'desc',
  })

  // Build query params
  const queryParams: JobFilters = {
    page,
    limit: 20,
    ...filters,
    search: searchInput || undefined,
  }

  // Fetch jobs from real API
  const { data: jobsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs', page, filters, searchInput],
    queryFn: async () => {
      const res = await jobsApi.list(queryParams)
      return res
    },
  })

  const jobs: Job[] = jobsResponse?.data || []
  const meta = jobsResponse?.meta || { total: 0, page: 1, limit: 20, pages: 1, hasMore: false }

  const getSourceBadge = (source: string) => {
    const info = SOURCE_DISPLAY[source] || { label: source, color: 'gray' as const }
    return info
  }

  const handleToggleJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs)
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId)
    } else {
      newSelected.add(jobId)
    }
    setSelectedJobs(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set())
    } else {
      setSelectedJobs(new Set(jobs.map((j) => j.id)))
    }
  }

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return 'Unknown'
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  const formatSalary = (salary: any) => {
    if (!salary) return null
    const min = salary.min || salary.minimum
    const max = salary.max || salary.maximum
    const currency = salary.currency || 'ILS'
    if (!min && !max) return null
    if (min && max) return `${currency} ${min.toLocaleString()}-${max.toLocaleString()}`
    if (min) return `${currency} ${min.toLocaleString()}+`
    return `Up to ${currency} ${max.toLocaleString()}`
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    refetch()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="animate-spin text-primary-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading jobs...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter & View Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search & Filters */}
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search jobs... (React, Node.js, Full Stack...)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <select
            value={filters.source || ''}
            onChange={(e) => {
              setFilters({ ...filters, source: e.target.value || undefined })
              setPage(1)
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">All Sources</option>
            {Object.entries(SOURCE_DISPLAY).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label}
              </option>
            ))}
          </select>

          <select
            value={filters.locationType || ''}
            onChange={(e) => {
              setFilters({ ...filters, locationType: e.target.value || undefined })
              setPage(1)
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">All Locations</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">On-site</option>
          </select>

          <select
            value={filters.sort || 'createdAt'}
            onChange={(e) => {
              setFilters({ ...filters, sort: e.target.value })
              setPage(1)
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="createdAt">Sort by Newest</option>
            <option value="title">Sort by Title</option>
            <option value="company">Sort by Company</option>
          </select>

          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className="text-gray-500" />
          </button>
        </form>

        {/* View Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg border transition-colors ${
              viewMode === 'list'
                ? 'bg-primary-100 border-primary-300 dark:bg-primary-900 dark:border-primary-700'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-2 rounded-lg border transition-colors ${
              viewMode === 'card'
                ? 'bg-primary-100 border-primary-300 dark:bg-primary-900 dark:border-primary-700'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <Grid3x3 size={18} />
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {meta.total > 0
          ? `Showing ${(meta.page - 1) * meta.limit + 1}-${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} jobs`
          : 'No jobs found'}
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedJobs.size > 0 && (
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {selectedJobs.size} selected
            </span>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded-lg bg-gray-600 text-white text-sm hover:bg-gray-700">
              Archive Selected
            </button>
          </div>
        </Card>
      )}

      {/* Jobs List/Grid */}
      {jobs.length > 0 ? (
        <>
          {viewMode === 'list' ? (
            <div className="space-y-2">
              {/* Select All Header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <button
                  onClick={handleSelectAll}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {selectedJobs.size === jobs.length ? (
                    <CheckSquare size={18} className="text-primary-600" />
                  ) : (
                    <Square size={18} className="text-gray-400" />
                  )}
                </button>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex-1">
                  {selectedJobs.size === jobs.length ? 'All selected' : 'Select all'}
                </span>
                <div className="flex gap-4">
                  <span className="text-xs text-gray-500">Source</span>
                  <span className="text-xs text-gray-500 w-24">Posted</span>
                </div>
              </div>

              {jobs.map((job) => {
                const sourceBadge = getSourceBadge(job.source)
                const salary = formatSalary(job.salary)
                return (
                  <Card key={job.id} hover className="flex items-start gap-4 cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleJob(job.id)
                      }}
                      className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 mt-1"
                    >
                      {selectedJobs.has(job.id) ? (
                        <CheckSquare size={18} className="text-primary-600" />
                      ) : (
                        <Square size={18} className="text-gray-400" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 truncate">
                            {job.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-sm text-gray-600 dark:text-gray-400">{job.company}</p>
                            <Badge variant={sourceBadge.color} size="sm">
                              {sourceBadge.label}
                            </Badge>
                            {job.locationType && (
                              <Badge variant="gray" size="sm">
                                {job.locationType}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <MapPin size={14} />
                              {job.location || 'Israel'}
                            </div>
                            {salary && (
                              <div className="flex items-center gap-1">
                                <Briefcase size={14} />
                                {salary}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(job.postedAt || job.scrapedAt)}</p>
                    </div>

                    {job.sourceUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(job.sourceUrl, '_blank')
                        }}
                        className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Open original listing"
                      >
                        <ExternalLink size={18} />
                      </button>
                    )}
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => {
                const sourceBadge = getSourceBadge(job.source)
                const salary = formatSalary(job.salary)
                return (
                  <Card
                    key={job.id}
                    hover
                    className="flex flex-col cursor-pointer"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{job.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{job.company}</p>
                        </div>
                      </div>

                      <div className="flex gap-1.5 flex-wrap mb-3">
                        <Badge variant={sourceBadge.color} size="sm">
                          {sourceBadge.label}
                        </Badge>
                        {job.locationType && (
                          <Badge variant="gray" size="sm">
                            {job.locationType}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <MapPin size={16} />
                          {job.location || 'Israel'}
                        </div>
                        {salary && (
                          <div className="flex items-center gap-2">
                            <Briefcase size={16} />
                            {salary}
                          </div>
                        )}
                        <div className="text-xs pt-2 border-t border-gray-200 dark:border-gray-700">
                          Posted: {formatDate(job.postedAt || job.scrapedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      {job.sourceUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(job.sourceUrl, '_blank')
                          }}
                          className="flex-1 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 font-medium flex items-center justify-center gap-1"
                        >
                          <ExternalLink size={14} />
                          View Listing
                        </button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          <Pagination
            page={meta.page}
            pages={meta.pages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <EmptyState
          icon={Search}
          title="No jobs found"
          description={isError
            ? "Could not connect to the server. Make sure the backend is running."
            : "No jobs in the database yet. Go to Dashboard and trigger a scrape to start finding jobs!"}
        />
      )}
    </div>
  )
}

export default JobBrowser
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Filter,
  Grid3x3,
  List,
  ChevronDown,
  MapPin,
  Briefcase,
  ExternalLink,
  CheckSquare,
  Square,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { Job, JobSource, LocationType } from '@/types'

interface JobWithScore extends Job {
  score?: number
  recommendation?: 'strong_pass' | 'pass' | 'maybe' | 'review' | 'weak_reject' | 'strong_reject'
}

interface JobBrowserFilters {
  source?: JobSource
  startDate?: string
  endDate?: string
  minScore?: number
  maxScore?: number
  locationType?: LocationType
  experience?: string
  search?: string
  sortBy?: 'score' | 'date' | 'company'
}

const JobBrowser = () => {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')
  const [page, setPage] = useState(1)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<JobBrowserFilters>({
    sortBy: 'score',
  })

  // Fetch jobs
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', page, filters],
    queryFn: async () => ({
      data: [
        {
          id: '1',
          title: 'Senior React Developer',
          company: 'TechCorp Inc',
          description: 'We are looking for a senior React developer...',
          source: JobSource.LINKEDIN,
          sourceUrl: 'https://linkedin.com',
          location: 'San Francisco, CA',
          locationType: LocationType.HYBRID,
          salary: { min: 150000, max: 180000, currency: 'USD' },
          requirements: ['React', 'TypeScript', 'Node.js'],
          tags: ['frontend', 'senior'],
          postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          views: 245,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          score: 92,
          recommendation: 'strong_pass' as const,
        },
        {
          id: '2',
          title: 'Full Stack Engineer',
          company: 'StartupXYZ',
          description: 'Join our growing team as a full stack engineer...',
          source: JobSource.INDEED,
          sourceUrl: 'https://indeed.com',
          location: 'New York, NY',
          locationType: LocationType.REMOTE,
          salary: { min: 120000, max: 150000, currency: 'USD' },
          requirements: ['JavaScript', 'React', 'Python', 'PostgreSQL'],
          tags: ['fullstack', 'startup'],
          postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          views: 512,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          score: 78,
          recommendation: 'pass' as const,
        },
        {
          id: '3',
          title: 'Frontend Engineer',
          company: 'Creative Studios',
          description: 'Build amazing user experiences with us...',
          source: JobSource.BUILTIN,
          sourceUrl: 'https://builtin.com',
          location: 'Austin, TX',
          locationType: LocationType.ONSITE,
          salary: { min: 110000, max: 140000, currency: 'USD' },
          requirements: ['React', 'CSS', 'Web Design'],
          tags: ['frontend', 'design'],
          postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          views: 89,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          score: 85,
          recommendation: 'pass' as const,
        },
        {
          id: '4',
          title: 'DevOps Engineer',
          company: 'CloudSys',
          description: 'Lead our infrastructure team...',
          source: JobSource.ANGELLIST,
          sourceUrl: 'https://angellist.com',
          location: 'Remote',
          locationType: LocationType.REMOTE,
          salary: { min: 130000, max: 170000, currency: 'USD' },
          requirements: ['Kubernetes', 'AWS', 'Docker'],
          tags: ['devops', 'infrastructure'],
          postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          views: 178,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          score: 65,
          recommendation: 'maybe' as const,
        },
        {
          id: '5',
          title: 'Backend Developer',
          company: 'DataFlow Inc',
          description: 'Build scalable backend systems...',
          source: JobSource.GLASSDOOR,
          sourceUrl: 'https://glassdoor.com',
          location: 'Seattle, WA',
          locationType: LocationType.HYBRID,
          salary: { min: 125000, max: 160000, currency: 'USD' },
          requirements: ['Python', 'PostgreSQL', 'REST APIs'],
          tags: ['backend', 'data'],
          postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          views: 334,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          score: 72,
          recommendation: 'pass' as const,
        },
        {
          id: '6',
          title: 'Product Manager',
          company: 'Innovation Labs',
          description: 'Lead product strategy and development...',
          source: JobSource.LINKEDIN,
          sourceUrl: 'https://linkedin.com',
          location: 'Boston, MA',
          locationType: LocationType.HYBRID,
          salary: { min: 140000, max: 180000, currency: 'USD' },
          requirements: ['Product Management', 'Analytics', 'Leadership'],
          tags: ['product', 'management'],
          postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          views: 567,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          score: 45,
          recommendation: 'weak_reject' as const,
        },
      ],
      total: 6,
      page: 1,
      limit: 10,
      pages: 1,
    }),
  })

  const getScoreBadgeColor = (score?: number): 'success' | 'warning' | 'error' => {
    if (!score) return 'gray'
    if (score >= 80) return 'success'
    if (score >= 60) return 'warning'
    return 'error'
  }

  const getSourceBadgeColor = (source: JobSource): 'primary' | 'success' | 'warning' | 'error' | 'gray' => {
    switch (source) {
      case JobSource.LINKEDIN:
        return 'primary'
      case JobSource.INDEED:
        return 'success'
      case JobSource.GLASSDOOR:
        return 'warning'
      default:
        return 'gray'
    }
  }

  const handleToggleJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs)
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId)
    } else {
      newSelected.add(jobId)
    }
    setSelectedJobs(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedJobs.size === jobsData?.data.length) {
      setSelectedJobs(new Set())
    } else {
      setSelectedJobs(new Set(jobsData?.data.map((j) => j.id) || []))
    }
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const sortedJobs = useMemo(() => {
    if (!jobsData?.data) return []
    const jobs = [...jobsData.data]

    if (filters.sortBy === 'score') {
      jobs.sort((a, b) => (b.score || 0) - (a.score || 0))
    } else if (filters.sortBy === 'date') {
      jobs.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    } else if (filters.sortBy === 'company') {
      jobs.sort((a, b) => a.company.localeCompare(b.company))
    }

    return jobs
  }, [jobsData?.data, filters.sortBy])

  if (isLoading) {
    return <div className="text-center py-12">Loading jobs...</div>
  }

  return (
    <div className="space-y-4">
      {/* Filter & View Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search & Filters */}
        <div className="flex-1 flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search jobs..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <select
            value={filters.source || ''}
            onChange={(e) => setFilters({ ...filters, source: (e.target.value as JobSource) || undefined })}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">All Sources</option>
            {Object.values(JobSource).map((source) => (
              <option key={source} value={source}>
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={filters.locationType || ''}
            onChange={(e) => setFilters({ ...filters, locationType: (e.target.value as LocationType) || undefined })}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">All Locations</option>
            <option value={LocationType.REMOTE}>Remote</option>
            <option value={LocationType.HYBRID}>Hybrid</option>
            <option value={LocationType.ONSITE}>On-site</option>
          </select>

          <select
            value={filters.sortBy || 'score'}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="score">Sort by Score</option>
            <option value="date">Sort by Date</option>
            <option value="company">Sort by Company</option>
          </select>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg border transition-colors ${
              viewMode === 'list'
                ? 'bg-primary-100 border-primary-300 dark:bg-primary-900 dark:border-primary-700'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-2 rounded-lg border transition-colors ${
              viewMode === 'card'
                ? 'bg-primary-100 border-primary-300 dark:bg-primary-900 dark:border-primary-700'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <Grid3x3 size={18} />
          </button>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedJobs.size > 0 && (
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {selectedJobs.size} selected
            </span>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              Score Selected
            </button>
            <button className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700">
              Apply Selected
            </button>
            <button className="px-3 py-1 rounded-lg bg-gray-600 text-white text-sm hover:bg-gray-700">
              Archive Selected
            </button>
          </div>
        </Card>
      )}

      {/* Jobs List/Grid */}
      {sortedJobs.length > 0 ? (
        <>
          {viewMode === 'list' ? (
            <div className="space-y-2">
              {/* Select All Header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <button
                  onClick={handleSelectAll}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {selectedJobs.size === sortedJobs.length ? (
                    <CheckSquare size={18} className="text-primary-600" />
                  ) : (
                    <Square size={18} className="text-gray-400" />
                  )}
                </button>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex-1">
                  {selectedJobs.size === sortedJobs.length ? 'All selected' : 'Select all'}
                </span>
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500">Score</span>
                  <span className="text-xs text-gray-500 w-24">Posted</span>
                </div>
              </div>

              {sortedJobs.map((job) => (
                <Card key={job.id} hover className="flex items-start gap-4 cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleJob(job.id)
                    }}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 mt-1"
                  >
                    {selectedJobs.has(job.id) ? (
                      <CheckSquare size={18} className="text-primary-600" />
                    ) : (
                      <Square size={18} className="text-gray-400" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                          {job.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{job.company}</p>
                          <Badge variant={getSourceBadgeColor(job.source)} size="sm">
                            {job.source}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <MapPin size={14} />
                            {job.location}
                          </div>
                          {job.salary && (
                            <div className="flex items-center gap-1">
                              <Briefcase size={14} />
                              ${job.salary.min?.toLocaleString()}-${job.salary.max?.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    {job.score && (
                      <Badge variant={getScoreBadgeColor(job.score)} size="md">
                        {job.score}%
                      </Badge>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{formatDate(job.postedAt)}</p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(job.sourceUrl, '_blank')
                    }}
                    className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <ExternalLink size={18} />
                  </button>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedJobs.map((job) => (
                <Card
                  key={job.id}
                  hover
                  className="flex flex-col cursor-pointer"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{job.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{job.company}</p>
                      </div>
                      {job.score && (
                        <Badge variant={getScoreBadgeColor(job.score)} size="md">
                          {job.score}%
                        </Badge>
                      )}
                    </div>

                    <Badge variant={getSourceBadgeColor(job.source)} size="sm">
                      {job.source}
                    </Badge>

                    <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} />
                        {job.location}
                      </div>
                      {job.salary && (
                        <div className="flex items-center gap-2">
                          <Briefcase size={16} />
                          ${job.salary.min?.toLocaleString()}-${job.salary.max?.toLocaleString()}
                        </div>
                      )}
                      <div className="text-xs pt-2 border-t border-gray-200 dark:border-gray-700">
                        Posted: {formatDate(job.postedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 font-medium">
                      Apply
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(job.sourceUrl, '_blank')
                      }}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <ExternalLink size={18} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          <Pagination
            page={page}
            pages={jobsData?.pages || 1}
            onPageChange={setPage}
          />
        </>
      ) : (
        <EmptyState
          icon={Search}
          title="No jobs found"
          description="Try adjusting your filters or search query"
        />
      )}
    </div>
  )
}

export default JobBrowser
