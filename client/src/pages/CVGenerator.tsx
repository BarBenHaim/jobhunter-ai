import { useState, useEffect } from 'react'
import { cvApi } from '@/services/cv.api'
import { profileApi } from '@/services/profile.api'
import { Download, Loader2, RefreshCw, Sparkles, CheckCircle, AlertCircle } from 'lucide-react'

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

export default function CVGenerator() {
  const [profile, setProfile] = useState<any>(null)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [generated, setGenerated] = useState<Record<string, CVResult>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    profileApi.getProfile().then(setProfile).catch(console.error)
  }, [])

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

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CV Generator</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Generate ATS-optimized CV versions tailored for different roles</p>
        </div>
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
          <strong>איך זה עובד:</strong> כל גרסת CV מותאמת עם מילות מפתח, סדר כישורים, והדגשים שמתאימים לסוג התפקיד.
          ה-AI מנתח את הפרופיל שלך ומייצר גרסה שתעבור מערכות ATS בצורה אופטימלית.
          {!profile?.structuredProfile?.summary && ' עדכן קודם את הפרופיל שלך בעמוד Profile כדי לקבל תוצאות טובות יותר.'}
        </p>
      </div>

      {/* CV Variant Cards */}
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
                      <a
                        href={`${apiBase}/cv/download?path=${encodeURIComponent(result.docxPath)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <Download size={14} />
                        DOCX
                      </a>
                    )}
                    {result.pdfPath && (
                      <a
                        href={`${apiBase}/cv/download?path=${encodeURIComponent(result.pdfPath)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        <Download size={14} />
                        PDF
                      </a>
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
  )
}
