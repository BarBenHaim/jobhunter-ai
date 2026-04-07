import { useState, useEffect } from 'react'
import { cvApi } from '@/services/cv.api'
import { profileApi } from '@/services/profile.api'
import { Download, Loader2 } from 'lucide-react'

const CV_VARIANTS = [
  { id: 'general', name: 'General Purpose', icon: '📄', description: 'All-purpose CV for any tech role' },
  { id: 'frontend', name: 'Frontend Developer', icon: '🎨', description: 'Optimized for React, UI/UX roles' },
  { id: 'backend', name: 'Backend Developer', icon: '⚙️', description: 'Optimized for Node.js, API roles' },
  { id: 'fullstack', name: 'Full Stack Developer', icon: '🔄', description: 'Balanced frontend + backend' },
  { id: 'data', name: 'Data / BI Analyst', icon: '📊', description: 'Optimized for data & analytics roles' },
  { id: 'ai', name: 'AI / ML Engineer', icon: '🤖', description: 'Optimized for AI & machine learning roles' },
]

export default function CVGenerator() {
  const [profile, setProfile] = useState<any>(null)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [generated, setGenerated] = useState<Record<string, any>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    profileApi.getProfile().then(setProfile).catch(console.error)
  }, [])

  const handleGenerate = async (variant: string) => {
    setGenerating(prev => ({ ...prev, [variant]: true }))
    setError(null)
    try {
      const result = await cvApi.generateStandalone('docx', variant)
      setGenerated(prev => ({ ...prev, [variant]: result.data }))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate CV')
    } finally {
      setGenerating(prev => ({ ...prev, [variant]: false }))
    }
  }

  const handleGenerateAll = async () => {
    setGeneratingAll(true)
    setError(null)
    try {
      const result = await cvApi.generateATSVersions()
      if (result.data?.versions) {
        const newGenerated: Record<string, any> = {}
        for (const v of result.data.versions) {
          newGenerated[v.variant] = v
        }
        setGenerated(newGenerated)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate CV versions')
    } finally {
      setGeneratingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CV Generator</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Generate ATS-optimized CV versions tailored for different roles</p>
        </div>
        <button
          onClick={handleGenerateAll}
          disabled={generatingAll}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generatingAll ? (
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin h-4 w-4" />
              Generating All...
            </span>
          ) : 'Generate All Versions'}
        </button>
      </div>

      {/* Profile Summary Card */}
      {profile && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
              {profile.fullName?.charAt(0) || 'B'}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{profile.fullName}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email} {profile.location && `· ${profile.location}`}</p>
              {profile.structuredProfile?.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{profile.structuredProfile.summary}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-xl bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 p-4 text-error-700 dark:text-error-400">
          {error}
        </div>
      )}

      {/* CV Variant Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CV_VARIANTS.map(variant => {
          const isGenerating = generating[variant.id] || generatingAll
          const result = generated[variant.id]

          return (
            <div key={variant.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{variant.icon}</span>
                {result?.atsScore && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    result.atsScore >= 80 ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' :
                    result.atsScore >= 60 ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' :
                    'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400'
                  }`}>
                    ATS: {result.atsScore}%
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{variant.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">{variant.description}</p>

              {result ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {result.docxPath && (
                      <a
                        href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/cv/download/${encodeURIComponent(result.docxPath)}`}
                        download
                        className="flex-1 flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-sm font-medium hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                      >
                        <Download size={14} />
                        DOCX
                      </a>
                    )}
                    {result.pdfPath && (
                      <a
                        href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/cv/download/${encodeURIComponent(result.pdfPath)}`}
                        download
                        className="flex-1 flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        <Download size={14} />
                        PDF
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => handleGenerate(variant.id)}
                    disabled={isGenerating}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
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
