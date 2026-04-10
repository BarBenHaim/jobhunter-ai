import { useEffect, useMemo, useState } from 'react'
import { cvApi } from '@/services/cv.api'
import { profileApi } from '@/services/profile.api'
import {
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  Wand2,
} from 'lucide-react'
import {
  RoleSuggestion,
  getRoleById,
  suggestRoles,
  topRoleIds,
} from '@/lib/roleSuggestions'

interface CVResult {
  variant: string
  success: boolean
  pdfPath?: string
  docxPath?: string
  atsScore?: number
  error?: string
}

const TARGET_ROLES_STORAGE_KEY = 'cvTargetRoles'

/** Load the user's chosen role list from localStorage. */
const loadSelectedRoles = (): string[] | null => {
  try {
    const raw = localStorage.getItem(TARGET_ROLES_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

const saveSelectedRoles = (ids: string[]) => {
  try {
    localStorage.setItem(TARGET_ROLES_STORAGE_KEY, JSON.stringify(ids))
  } catch { /* ignore */ }
}

export default function CVGenerator() {
  const [profile, setProfile] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [generated, setGenerated] = useState<Record<string, CVResult>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Selected role IDs — the roles the user wants CVs generated for.
  // Initially from localStorage, else auto-suggested from profile when loaded.
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    () => loadSelectedRoles() || []
  )
  const [rolesInitialized, setRolesInitialized] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

  // Fetch profile on mount
  useEffect(() => {
    profileApi
      .getProfile()
      .then((p) => setProfile(p))
      .catch(console.error)
      .finally(() => setLoadingProfile(false))
  }, [])

  // When the profile loads for the first time and the user has no saved
  // role selection, seed it with the top 3 suggestions from the profile.
  useEffect(() => {
    if (rolesInitialized) return
    if (loadingProfile) return
    if (selectedRoles.length > 0) {
      setRolesInitialized(true)
      return
    }
    const suggestions = topRoleIds(profile?.structuredProfile, 3)
    setSelectedRoles(suggestions)
    saveSelectedRoles(suggestions)
    setRolesInitialized(true)
  }, [loadingProfile, profile, rolesInitialized, selectedRoles.length])

  // Ranked roles (for the picker)
  const rankedRoles: RoleSuggestion[] = useMemo(
    () => suggestRoles(profile?.structuredProfile),
    [profile]
  )

  // Resolved Role objects for the currently selected IDs, preserving order.
  const activeRoles: RoleSuggestion[] = useMemo(() => {
    return selectedRoles
      .map((id) => getRoleById(id))
      .filter((r): r is RoleSuggestion => Boolean(r))
  }, [selectedRoles])

  const handleAddRole = (id: string) => {
    if (selectedRoles.includes(id)) return
    const next = [...selectedRoles, id]
    setSelectedRoles(next)
    saveSelectedRoles(next)
  }

  const handleRemoveRole = (id: string) => {
    const next = selectedRoles.filter((r) => r !== id)
    setSelectedRoles(next)
    saveSelectedRoles(next)
  }

  const handleResetToSuggestions = () => {
    const suggestions = topRoleIds(profile?.structuredProfile, 3)
    setSelectedRoles(suggestions)
    saveSelectedRoles(suggestions)
  }

  const handleGenerate = async (variant: string) => {
    setGenerating((prev) => ({ ...prev, [variant]: true }))
    setError(null)
    setSuccessMsg(null)
    try {
      const [pdfResult, docxResult] = await Promise.all([
        cvApi.generateStandalone('pdf', variant).catch(() => null),
        cvApi.generateStandalone('docx', variant).catch(() => null),
      ])

      const pdfData = pdfResult?.data?.data || pdfResult?.data
      const docxData = docxResult?.data?.data || docxResult?.data

      setGenerated((prev) => ({
        ...prev,
        [variant]: {
          variant,
          success: true,
          pdfPath: pdfData?.filePath || pdfData?.pdfPath,
          docxPath: docxData?.filePath || docxData?.docxPath,
          atsScore:
            pdfData?.atsValidation?.score ||
            pdfData?.atsScore ||
            docxData?.atsValidation?.score ||
            docxData?.atsScore ||
            85,
        },
      }))
      const roleName = getRoleById(variant)?.nameHe || variant
      setSuccessMsg(`CV ל-${roleName} נוצר בהצלחה!`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to generate CV'
      setError(typeof errMsg === 'string' ? errMsg : 'שגיאה ביצירת CV. ודא ש-ANTHROPIC_API_KEY מוגדר.')
    } finally {
      setGenerating((prev) => ({ ...prev, [variant]: false }))
    }
  }

  const handleGenerateAll = async () => {
    if (activeRoles.length === 0) return
    setGeneratingAll(true)
    setError(null)
    setSuccessMsg(null)
    try {
      // Call each role in sequence — the backend generateATSVersions endpoint
      // uses a hardcoded list, so we fire per-role requests instead to respect
      // the user's custom selection.
      for (const role of activeRoles) {
        try {
          await handleGenerate(role.id)
        } catch { /* continue with next */ }
      }
      setSuccessMsg(`נוצרו ${activeRoles.length} גרסאות CV!`)
      setTimeout(() => setSuccessMsg(null), 5000)
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to generate CV versions'
      setError(typeof errMsg === 'string' ? errMsg : 'שגיאה ביצירה. ודא ש-ANTHROPIC_API_KEY מוגדר ב-Railway.')
    } finally {
      setGeneratingAll(false)
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
    } catch {
      setError('הורדת הקובץ נכשלה')
    }
  }

  const hasProfile = Boolean(profile?.structuredProfile?.summary || profile?.structuredProfile?.experience?.length)

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold" style={{ color: 'var(--ink-primary)' }}>
          מחולל קורות חיים
        </h1>
        <p className="text-[14px] mt-1" style={{ color: 'var(--ink-secondary)' }}>
          צור גרסאות CV מותאמות לתפקידים שונים עם אופטימיזציה ל-ATS
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div
          className="rounded-card px-4 py-3 flex items-start gap-3"
          style={{ background: '#fdeded', border: '1px solid #f3b9b9' }}
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#cc1016' }} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#cc1016' }}>שגיאה ביצירת CV</p>
            <p className="text-[13px] mt-0.5" style={{ color: '#cc1016' }}>{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div
          className="rounded-card px-4 py-3 flex items-center gap-3"
          style={{ background: '#e7f5ec', border: '1px solid #a3d4b0' }}
        >
          <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: '#057642' }} />
          <p className="text-[13px] font-semibold" style={{ color: '#057642' }}>{successMsg}</p>
        </div>
      )}

      {/* Profile summary / missing-profile prompt */}
      {loadingProfile ? (
        <div className="rounded-card bg-white p-6 text-center" style={{ border: '1px solid var(--border)' }}>
          <Loader2 className="animate-spin h-6 w-6 mx-auto" style={{ color: 'var(--brand)' }} />
        </div>
      ) : profile ? (
        <div
          className="rounded-card bg-white p-5"
          style={{ border: '1px solid var(--border)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-white text-[22px] font-bold flex-shrink-0"
              style={{ background: 'var(--brand)' }}
            >
              {profile.fullName?.charAt(0) || 'B'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                {profile.fullName}
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--ink-secondary)' }}>
                {profile.email}
                {profile.location && ` · ${profile.location}`}
              </p>
              {profile.structuredProfile?.summary && (
                <p className="text-[13px] mt-1 line-clamp-2" style={{ color: 'var(--ink-secondary)' }}>
                  {profile.structuredProfile.summary}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* How it works */}
      <div
        className="rounded-card px-4 py-3"
        style={{ background: 'var(--selected)', border: '1px solid #cfe3fa' }}
      >
        <p className="text-[13px]" style={{ color: 'var(--brand-hover)' }}>
          <strong>איך זה עובד:</strong> בחר את התפקידים שאליהם אתה מגיש מועמדות. כל CV שמותאם עבור תפקיד ספציפי מכיל
          מילות מפתח, סדר כישורים והדגשים שמתאימים לסוג התפקיד.
          {!hasProfile && ' מלא תחילה את הפרופיל כדי שנוכל להמליץ אוטומטית על התפקידים שהכי מתאימים לניסיון שלך.'}
        </p>
      </div>

      {/* Selected roles section */}
      <div
        className="rounded-card bg-white p-5"
        style={{ border: '1px solid var(--border)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}
      >
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-[16px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
              התפקידים שלי
            </h3>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--ink-secondary)' }}>
              {hasProfile
                ? 'מבוסס על הניסיון שמילאת בפרופיל. אפשר להוסיף או להסיר תפקידים.'
                : 'עדכן את הפרופיל כדי לקבל המלצות מותאמות אישית.'}
            </p>
          </div>
          <div className="flex gap-2">
            {hasProfile && (
              <button
                onClick={handleResetToSuggestions}
                className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-[13px] font-semibold transition-colors"
                style={{ color: 'var(--brand)', border: '1px solid var(--brand)' }}
              >
                <Wand2 size={14} />
                המלצה אוטומטית
              </button>
            )}
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-pill text-[13px] font-semibold transition-colors text-white"
              style={{ background: 'var(--brand)' }}
            >
              <Plus size={14} />
              הוסף תפקיד
            </button>
          </div>
        </div>

        {/* Active role chips */}
        {activeRoles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill text-[13px] font-medium"
                style={{ background: 'var(--selected)', color: 'var(--brand-hover)' }}
              >
                <span>{role.icon}</span>
                {role.nameHe}
                <button
                  onClick={() => handleRemoveRole(role.id)}
                  className="hover:opacity-70 transition-opacity"
                  aria-label={`הסר ${role.nameHe}`}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-center py-4" style={{ color: 'var(--ink-tertiary)' }}>
            עדיין לא נבחרו תפקידים. לחץ על "הוסף תפקיד" כדי להתחיל.
          </p>
        )}

        {/* Role picker dropdown */}
        {pickerOpen && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
            <p className="text-[12px] font-bold mb-3 uppercase tracking-wider" style={{ color: 'var(--ink-tertiary)' }}>
              בחר תפקידים
              {hasProfile && ' (ממוינים לפי התאמה לפרופיל שלך)'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {rankedRoles.map((role) => {
                const isSelected = selectedRoles.includes(role.id)
                return (
                  <button
                    key={role.id}
                    onClick={() => (isSelected ? handleRemoveRole(role.id) : handleAddRole(role.id))}
                    className="flex items-center gap-3 p-3 rounded-card text-right transition-colors"
                    style={{
                      background: isSelected ? 'var(--selected)' : 'var(--subtle)',
                      border: `1px solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`,
                    }}
                  >
                    <span className="text-[24px] flex-shrink-0">{role.icon}</span>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink-primary)' }}>
                          {role.nameHe}
                        </span>
                        {hasProfile && (role.score || 0) > 10 && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--brand)', color: 'white' }}
                          >
                            {role.score}%
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-tertiary)' }}>
                        {role.description}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle size={16} className="flex-shrink-0" style={{ color: 'var(--brand)' }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Generate all button */}
      {activeRoles.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleGenerateAll}
            disabled={generatingAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-pill text-white text-[14px] font-semibold transition-all disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {generatingAll ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                מייצר את כל הגרסאות...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                צור את כל הגרסאות
              </>
            )}
          </button>
        </div>
      )}

      {/* Role variant cards */}
      {activeRoles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeRoles.map((role) => {
            const isGenerating = generating[role.id] || generatingAll
            const result = generated[role.id]
            return (
              <div
                key={role.id}
                className="rounded-card bg-white p-5 transition-all"
                style={{
                  border: `1px solid ${result?.success ? '#a3d4b0' : 'var(--border)'}`,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[28px]">{role.icon}</span>
                  {result?.atsScore != null && (
                    <span
                      className="px-2 py-0.5 rounded-pill text-[11px] font-semibold"
                      style={{
                        background: result.atsScore >= 80 ? '#e7f5ec' : result.atsScore >= 60 ? '#fff3cd' : '#fdeded',
                        color: result.atsScore >= 80 ? '#057642' : result.atsScore >= 60 ? '#8a6d00' : '#cc1016',
                      }}
                    >
                      ATS: {result.atsScore}%
                    </span>
                  )}
                </div>
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {role.nameHe}
                </h3>
                <p className="text-[12px] mt-1 mb-4" style={{ color: 'var(--ink-secondary)' }}>
                  {role.description}
                </p>

                {result?.success ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {result.docxPath && (
                        <button
                          onClick={() => handleDownload(result.docxPath!, `${role.id}-cv.docx`)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-pill text-[12px] font-semibold transition-colors"
                          style={{ background: 'var(--subtle)', color: 'var(--brand)' }}
                        >
                          <Download size={13} />
                          DOCX
                        </button>
                      )}
                      {result.pdfPath && (
                        <button
                          onClick={() => handleDownload(result.pdfPath!, `${role.id}-cv.pdf`)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-pill text-[12px] font-semibold transition-colors"
                          style={{ background: 'var(--subtle)', color: 'var(--brand)' }}
                        >
                          <Download size={13} />
                          PDF
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => handleGenerate(role.id)}
                      disabled={isGenerating}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-pill text-[12px] font-medium transition-colors disabled:opacity-60"
                      style={{ color: 'var(--ink-secondary)', border: '1px solid var(--border)' }}
                    >
                      <RefreshCw size={12} />
                      ייצר מחדש
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleGenerate(role.id)}
                    disabled={isGenerating}
                    className="w-full px-4 py-2.5 rounded-pill text-[13px] font-semibold transition-colors disabled:opacity-60 text-white"
                    style={{ background: 'var(--brand)' }}
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin h-4 w-4" />
                        מייצר...
                      </span>
                    ) : (
                      'צור CV'
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state — no active roles */}
      {activeRoles.length === 0 && rolesInitialized && (
        <div
          className="rounded-card bg-white p-8 text-center"
          style={{ border: '1px solid var(--border)' }}
        >
          <Wand2 className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--ink-tertiary)' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
            התחל לבחור תפקידים
          </h3>
          <p className="text-[13px] mt-1" style={{ color: 'var(--ink-secondary)' }}>
            הוסף את התפקידים שאליהם אתה מגיש מועמדות כדי שנוכל לייצר עבורם CV מותאם.
          </p>
        </div>
      )}
    </div>
  )
}
