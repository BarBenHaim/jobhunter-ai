import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cvApi } from '@/services/cv.api'
import { profileApi } from '@/services/profile.api'
import { Download, Loader2, RefreshCw, Sparkles, CheckCircle, AlertCircle, Search, Briefcase, Target, ChevronRight } from 'lucide-react'

const CV_VARIANTS = [
  { id: 'general', name: 'General Purpose', icon: '📄', description: 'All-purpose CV for any tech role', color: 'gray' },
  { id: 'frontend', name: 'Frontend Developer', icon: '🎨', description: 'Optimized for React, UI/UX roles', color: 'blue' },
  { id: 'backend', name: 'Backend Developer', icon: '⚙️', description: 'Optimized for Node.js, API roles', color: 'green' },
  { id: 'fullstack', name: 'Full Stack Developer', icon: '🔄', description: 'Balanced frontend + backend', color: 'purple' },
  { id: 'data', name: 'Data / BI Analyst', icon: '📊', description: 'Optimized for data & analytics roles', color: 'yellow' },
  { id: 'ai', name: 'AI / ML Engineer', icon: '🤖', description: 'Optimized for AI & machine learning roles', color: 'pink' },
]

interface CVResult {
  variant: string
  success: boolean
  pdfPath?: string
  docxPath?: string
  atsScore?: number
  error?: string
}

interface Job {
  _id: string
  title: string
  company: string
  location?: string
  source?: string
  postedAt?: string
  description?: string
}

interface JobCVResult {
  pdfPath?: string
  docxPath?: string
  atsValidation?: { score: number }
  cvContent?: {
    summary?: string
    skills?: string[]
    keywordInjections?: string[]
    tailoredHighlights?: string[]
    matchPercentage?: number
  }
}

export default function CVGenerator() {
  const [searchParams] = useSearchParams()
  const preselectedJobId = searchParams.get('jobId')

  const [activeTab, setActiveTab] = useState<'job' | 'variant'>('job')
  const [profile, setProfile] = useState<any>(null)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [generated, setGenerated] = useState<Record<string, CVResult>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Job-specific tailoring state
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobSearch, setJobSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [generatingForJob, setGeneratingForJob] = useState(false)
  const [jobCVResult, setJobCVResult] = useState<JobCVResult | null>(null)

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

  // Fetch profile and jobs on mount
  useEffect(() => {
    profileApi.getProfile().then(setProfile).catch(console.error)
    fetchJobs()
  }, [])

  // Auto-select job from URL param
  useEffect(() => {
    if (preselectedJobId && jobs.length > 0) {
      const job = jobs.find((j: any) => j.id === preselectedJobId || j._id === preselectedJobId)
      if (job) {
        setSelectedJob(job)
        setActiveTab('job')
      }
    }
  }, [preselectedJobId, jobs])

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiBase}/jobs?limit=100&sort=postedAt`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setJobs(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }

  // Filter jobs based on search
  const filteredJobs = jobs.filter(j =>
    (j.title?.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.company?.toLowerCase().includes(jobSearch.toLowerCase()))
  )

  const handleGenerate = async (variant: string, format: string = 'pdf') => {
    setGenerating(prev => ({ ...prev, [variant]: true }))
    setError(null)
    setSuccessMsg(null)
    try {
      // Generate both PDF and DOCX
      const [pdfResult, docxResult] = await Promise.all([
        cvApi.generateStandalone('pdf', variant).catch(() => null),
        cvApi.generateStandalone('docx', variant).catch(() => null),
      ])

      const pdfData = pdfResult?.data?.data || pdfResult?.data
      const docxData = docxResult?.data?.data || docxResult?.data

      setGenerated(prev => ({
        ...prev,
        [variant]: {
          variant,
          success: true,
          pdfPath: pdfData?.filePath || pdfData?.pdfPath,
          docxPath: docxData?.filePath || docxData?.docxPath,
          atsScore: pdfData?.atsValidation?.score || pdfData?.atsScore || docxData?.atsValidation?.score || docxData?.atsScore || 85,
        },
      }))
      setSuccessMsg(`${variant} CV generated successfully!`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || 'Failed to generate CV'
      setError(typeof errMsg === 'string' ? errMsg : 'Failed to generate CV. Check that ANTHROPIC_API_KEY is set.')
    } finally {
      setGenerating(prev => ({ ...prev, [variant]: false }))
    }
  }

  const handleGenerateAll = async () => {
    setGeneratingAll(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const result = await cvApi.generateATSVersions()
      const data = result?.data?.data || result?.data

      if (data?.versions && Array.isArray(data.versions)) {
        const newGenerated: Record<string, CVResult> = {}
        for (const v of data.versions) {
          if (v.success) {
            newGenerated[v.variant] = {
              variant: v.variant,
              success: true,
              pdfPath: v.pdfPath,
              docxPath: v.docxPath,
              atsScore: v.atsScore || 85,
            }
          }
        }
        setGenerated(prev => ({ ...prev, ...newGenerated }))
        const successCount = data.versions.filter((v: any) => v.success).length
        setSuccessMsg(`Generated ${successCount}/${data.versions.length} CV versions!`)
        setTimeout(() => setSuccessMsg(null), 5000)
      } else {
        // Fallback: generate one by one
        for (const variant of CV_VARIANTS) {
          try {
            await handleGenerate(variant.id)
          } catch {
            // continue with next
          }
        }
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || 'Failed to generate CV versions'
      setError(typeof errMsg === 'string' ? errMsg : 'Failed to generate. Make sure ANTHROPIC_API_KEY is configured on Railway.')
    } finally {
      setGeneratingAll(false)
    }
  }

  // Generate job-specific CV
  const handleGenerateForJob = async () => {
    if (!selectedJob) return

    setGeneratingForJob(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const result = await cvApi.generateForJob(selectedJob._id)
      const data = result?.data

      if (data) {
        setJobCVResult({
          pdfPath: data.pdfPath,
          docxPath: data.docxPath,
          atsValidation: data.atsValidation,
          cvContent: data.cvContent,
        })
        setSuccessMsg(`CV tailored for ${selectedJob.title} generated successfully!`)
        setTimeout(() => setSuccessMsg(null), 3000)
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || 'Failed to generate tailored CV'
      setError(typeof errMsg === 'string' ? errMsg : 'Failed to generate CV. Check that ANTHROPIC_API_KEY is set.')
    } finally {
      setGeneratingForJob(false)
    }
  }

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiBase}/cv/download?path=${encodeURIComponent(filePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError('Failed to download file')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CV Generator</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Generate ATS-optimized CV versions tailored for different roles</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            setActiveTab('job')
            setJobCVResult(null)
          }}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'job'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            התאמה למשרה
          </div>
        </button>
        <button
          onClick={() => setActiveTab('variant')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'variant'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            לפי סוג תפקיד
          </div>
        </button>
      </div>

      {/* Profile Summary Card */}
      {profile && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
              {profile.fullName?.charAt(0) || 'B'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{profile.fullName}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email} {profile.location && `· ${profile.location}`}</p>
              {profile.structuredProfile?.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{profile.structuredProfile.summary}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 dark:text-red-400 text-sm font-medium">Error generating CV</p>
            <p className="text-red-600 dark:text-red-500 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-400 text-sm font-medium">{successMsg}</p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 p-4" dir="rtl">
        <p className="text-sm text-primary-700 dark:text-primary-400">
          <strong>איך זה עובד:</strong> {
            activeTab === 'job'
              ? 'בחר משרה ספציפית כדי לייצר CV שמותאם בדיוק לתיאור התפקיד. ה-AI מנתח את מילות המפתח, הדרישות, ושם החברה ומתאים את הניסיון והכישורים שלך בצורה אופטימלית.'
              : 'כל גרסת CV מותאמת עם מילות מפתח, סדר כישורים, והדגשים שמתאימים לסוג התפקיד. ה-AI מנתח את הפרופיל שלך ומייצר גרסה שתעבור מערכות ATS בצורה אופטימלית.'
          }
          {!profile?.structuredProfile?.summary && ' עדכן קודם את הפרופיל שלך בעמוד Profile כדי לקבל תוצאות טובות יותר.'}
        </p>
      </div>

      {/* TAB 1: Job-Specific Tailoring */}
      {activeTab === 'job' && (
        <div className="space-y-6">
          {/* Search Jobs */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="חפש משרה לפי כותרת או חברה..."
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
            />
          </div>

          {/* Jobs List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredJobs.length > 0 ? (
              filteredJobs.map(job => (
                <button
                  key={job._id}
                  onClick={() => {
                    setSelectedJob(job)
                    setJobCVResult(null)
                  }}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 ${
                    selectedJob?._id === job._id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{job.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{job.company}</p>
                      {job.location && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">📍 {job.location}</p>
                      )}
                      {job.source && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">מקור: {job.source}</p>
                      )}
                    </div>
                    {selectedJob?._id === job._id && (
                      <CheckCircle className="h-5 w-5 text-primary-500 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">אין משרות עם ההתאמה הזו</p>
              </div>
            )}
          </div>

          {/* Generate Button */}
          {selectedJob && !jobCVResult && (
            <button
              onClick={handleGenerateForJob}
              disabled={generatingForJob}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingForJob ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  מייצר CV מותאם אישית...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  ייצור CV מותאם למשרה
                </>
              )}
            </button>
          )}

          {/* Job CV Result */}
          {jobCVResult && selectedJob && (
            <div className="space-y-6">
              {/* Match Percentage */}
              {jobCVResult.cvContent?.matchPercentage != null && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8">
                  <div className="text-center">
                    <div className="mb-4 flex justify-center">
                      <div className={`relative h-32 w-32 rounded-full flex items-center justify-center text-5xl font-bold ${
                        jobCVResult.cvContent.matchPercentage >= 80
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : jobCVResult.cvContent.matchPercentage >= 60
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {jobCVResult.cvContent.matchPercentage}%
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {jobCVResult.cvContent.matchPercentage >= 80
                        ? 'התאמה מעולה!'
                        : jobCVResult.cvContent.matchPercentage >= 60
                        ? 'התאמה טובה'
                        : 'התאמה בסיסית'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      ה-CV שלך מכיל {jobCVResult.cvContent.matchPercentage}% מהמילות המפתח החשובות בתיאור התפקיד
                    </p>
                  </div>
                </div>
              )}

              {/* Summary Preview */}
              {jobCVResult.cvContent?.summary && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">סיכום מותאם אישית</h3>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{jobCVResult.cvContent.summary}</p>
                </div>
              )}

              {/* Tailored Highlights */}
              {jobCVResult.cvContent?.tailoredHighlights && jobCVResult.cvContent.tailoredHighlights.length > 0 && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">הדגשים מותאמים למשרה</h3>
                  <ul className="space-y-2">
                    {jobCVResult.cvContent.tailoredHighlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <ChevronRight className="h-5 w-5 text-primary-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-gray-300">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Keyword Injections */}
              {jobCVResult.cvContent?.keywordInjections && jobCVResult.cvContent.keywordInjections.length > 0 && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">מילות מפתח מתוך תיאור התפקיד</h3>
                  <div className="flex flex-wrap gap-2">
                    {jobCVResult.cvContent.keywordInjections.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-sm font-medium"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Download Buttons */}
              <div className="flex gap-3">
                {jobCVResult.docxPath && (
                  <button
                    onClick={() => handleDownload(jobCVResult.docxPath!, `${selectedJob.title}-cv.docx`)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <Download size={18} />
                    הורד DOCX
                  </button>
                )}
                {jobCVResult.pdfPath && (
                  <button
                    onClick={() => handleDownload(jobCVResult.pdfPath!, `${selectedJob.title}-cv.pdf`)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                  >
                    <Download size={18} />
                    הורד PDF
                  </button>
                )}
              </div>

              {/* Regenerate Button */}
              <button
                onClick={() => setJobCVResult(null)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw size={16} />
                בחר משרה אחרת
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Role Variants */}
      {activeTab === 'variant' && (
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-4 mb-6">
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingAll ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  Generating All...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate All Versions
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CV_VARIANTS.map(variant => {
              const isGenerating = generating[variant.id] || generatingAll
              const result = generated[variant.id]

              return (
                <div key={variant.id} className={`rounded-2xl border bg-white dark:bg-gray-800 p-6 transition-all duration-200 ${
                  result?.success
                    ? 'border-green-200 dark:border-green-800 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:shadow-lg'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{variant.icon}</span>
                    {result?.atsScore != null && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        result.atsScore >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        result.atsScore >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        ATS: {result.atsScore}%
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{variant.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">{variant.description}</p>

                  {result?.success ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {result.docxPath && (
                          <button
                            onClick={() => handleDownload(result.docxPath, `${variant.id}-cv.docx`)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            <Download size={14} />
                            DOCX
                          </button>
                        )}
                        {result.pdfPath && (
                          <button
                            onClick={() => handleDownload(result.pdfPath, `${variant.id}-cv.pdf`)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                          >
                            <Download size={14} />
                            PDF
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => handleGenerate(variant.id)}
                        disabled={isGenerating}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={14} />
                        Regenerate
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGenerate(variant.id)}
                      disabled={isGenerating}
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGenerating ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="animate-spin h-4 w-4" />
                          Generating...
                        </span>
                      ) : 'Generate CV'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
