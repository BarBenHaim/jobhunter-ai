import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  MapPin,
  Mail,
  Phone,
  Linkedin,
  Github,
  Globe,
  Target,
  X,
  Plus,
} from 'lucide-react'
import { Lock, Shield, Trash2 } from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { profileApi } from '@/services/profile.api'
import { authApi } from '@/services/auth.api'
import { clearAuthToken } from '@/services/api'

const ROLE_SUGGESTIONS = [
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'React Developer',
  'Node.js Developer',
  'Software Engineer',
  'DevOps Engineer',
  'Data Engineer',
  'AI/ML Engineer',
  'Team Lead',
  'Tech Lead',
  'Product Manager',
  'QA Engineer',
  'Mobile Developer',
  'Cloud Engineer',
]

const Settings = () => {
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')

  // Security state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwChangeLoading, setPwChangeLoading] = useState(false)
  const [pwChangeMsg, setPwChangeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Job preferences
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [newRole, setNewRole] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([])
  const [newExclude, setNewExclude] = useState('')
  const [preferredLocations, setPreferredLocations] = useState<string[]>([])
  const [newLocation, setNewLocation] = useState('')
  const [preferredWorkType, setPreferredWorkType] = useState<string>('')
  const [minExperience, setMinExperience] = useState<string>('')

  // Fetch profile (shares cache with App.tsx)
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
  })

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '')
      setEmail(profile.email || '')
      setPhone(profile.phone || '')
      setLocation(profile.location || '')
      setLinkedinUrl(profile.linkedinUrl || '')
      setGithubUrl(profile.githubUrl || '')
      setPortfolioUrl(profile.portfolioUrl || '')

      const prefs = profile.preferences || {}
      setTargetRoles(prefs.targetRoles || [])
      setExcludeKeywords(prefs.excludeKeywords || [])
      setPreferredLocations(prefs.preferredLocations || [])
      setPreferredWorkType(prefs.preferredWorkType || '')
      setMinExperience(prefs.minExperience || '')
    }
  }, [profile])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await profileApi.updateProfile({
        fullName: fullName || undefined,
        phone: phone || undefined,
        location: location || undefined,
        linkedinUrl: linkedinUrl || undefined,
        githubUrl: githubUrl || undefined,
        portfolioUrl: portfolioUrl || undefined,
        preferences: {
          targetRoles,
          excludeKeywords,
          preferredLocations,
          preferredWorkType: preferredWorkType || undefined,
          minExperience: minExperience || undefined,
        },
      } as any)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSuccessMsg('ההגדרות נשמרו בהצלחה!')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'שגיאה בשמירת ההגדרות')
    } finally {
      setIsSaving(false)
    }
  }

  const addTag = (list: string[], setList: (v: string[]) => void, value: string, setValue: (v: string) => void) => {
    const trimmed = value.trim()
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed])
    }
    setValue('')
  }

  const removeTag = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index))
  }

  const extractErr = (err: any, fallback: string) =>
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwChangeMsg(null)

    if (newPassword !== confirmPassword) {
      setPwChangeMsg({ type: 'error', text: 'הסיסמאות החדשות אינן תואמות' })
      return
    }
    if (newPassword.length < 8) {
      setPwChangeMsg({ type: 'error', text: 'הסיסמה חייבת להיות לפחות 8 תווים' })
      return
    }

    setPwChangeLoading(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setPwChangeMsg({ type: 'success', text: 'הסיסמה עודכנה בהצלחה' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPwChangeMsg({ type: 'error', text: extractErr(err, 'שגיאה בעדכון הסיסמה') })
    } finally {
      setPwChangeLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError(null)
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('אנא כתוב DELETE כדי לאשר')
      return
    }
    if (!deletePassword) {
      setDeleteError('יש להזין סיסמה')
      return
    }
    setDeleteLoading(true)
    try {
      await authApi.deleteAccount(deletePassword)
      clearAuthToken()
      window.location.href = '/auth/login'
    } catch (err: any) {
      setDeleteError(extractErr(err, 'שגיאה במחיקת החשבון'))
    } finally {
      setDeleteLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin h-8 w-8 text-primary-500" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">הגדרות</h1>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 px-5 py-2.5 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save size={18} />}
          {isSaving ? 'שומר...' : 'שמור שינויים'}
        </button>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-400 text-sm font-medium">{successMsg}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Personal Info */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <User size={20} className="text-primary-500" />
          פרטים אישיים
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">שם מלא</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="השם המלא שלך"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">אימייל</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white bg-gray-50 dark:bg-gray-900 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">לא ניתן לשנות אימייל</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">טלפון</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="050-1234567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">מיקום</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="תל אביב, ישראל"
            />
          </div>
        </div>
      </Card>

      {/* Links */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Globe size={20} className="text-primary-500" />
          קישורים
        </h2>
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Linkedin size={16} /> LinkedIn
            </label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="https://linkedin.com/in/..."
              dir="ltr"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Github size={16} /> GitHub
            </label>
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="https://github.com/..."
              dir="ltr"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Globe size={16} /> פורטפוליו / אתר אישי
            </label>
            <input
              type="url"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="https://..."
              dir="ltr"
            />
          </div>
        </div>
      </Card>

      {/* Job Preferences — THE KEY SECTION */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Target size={20} className="text-primary-500" />
          העדפות חיפוש משרות
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          הגדר את סוגי התפקידים שמעניינים אותך כדי לקבל תוצאות ממוקדות יותר
        </p>

        <div className="space-y-5">
          {/* Target Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תפקידים שמעניינים אותי</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {targetRoles.map((role, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-sm font-medium">
                  {role}
                  <button onClick={() => removeTag(targetRoles, setTargetRoles, i)} className="hover:text-red-500">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(targetRoles, setTargetRoles, newRole, setNewRole))}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                placeholder="הוסף תפקיד..."
              />
              <button
                type="button"
                onClick={() => addTag(targetRoles, setTargetRoles, newRole, setNewRole)}
                className="px-3 py-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            {/* Quick suggestions */}
            {targetRoles.length === 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ROLE_SUGGESTIONS.slice(0, 8).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setTargetRoles([...targetRoles, suggestion])}
                    className="px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Exclude Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">מילות מפתח לסינון (משרות שלא מעניינות)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {excludeKeywords.map((kw, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium">
                  {kw}
                  <button onClick={() => removeTag(excludeKeywords, setExcludeKeywords, i)} className="hover:text-red-800">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newExclude}
                onChange={(e) => setNewExclude(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(excludeKeywords, setExcludeKeywords, newExclude, setNewExclude))}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                placeholder="למשל: QA, מוביל מחקר, סטודנט..."
              />
              <button
                type="button"
                onClick={() => addTag(excludeKeywords, setExcludeKeywords, newExclude, setNewExclude)}
                className="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Preferred Locations */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">מיקומים מועדפים</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {preferredLocations.map((loc, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium">
                  {loc}
                  <button onClick={() => removeTag(preferredLocations, setPreferredLocations, i)} className="hover:text-red-500">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(preferredLocations, setPreferredLocations, newLocation, setNewLocation))}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                placeholder="למשל: תל אביב, הרצליה, רמת גן..."
              />
              <button
                type="button"
                onClick={() => addTag(preferredLocations, setPreferredLocations, newLocation, setNewLocation)}
                className="px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Work Type & Experience */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">סוג עבודה מועדף</label>
              <select
                value={preferredWorkType}
                onChange={(e) => setPreferredWorkType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
              >
                <option value="">הכל</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">On-site</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">רמת ניסיון</label>
              <select
                value={minExperience}
                onChange={(e) => setMinExperience(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
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
        </div>
      </Card>

      {/* Security — Change password */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Lock size={20} className="text-primary-500" />
          אבטחה וסיסמה
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          עדכן את הסיסמה שלך. הסיסמה חייבת להיות לפחות 8 תווים ולכלול אותיות ומספרים.
        </p>

        {pwChangeMsg && (
          <div
            className={`mb-4 rounded-xl p-3 text-sm font-medium flex items-center gap-2 ${
              pwChangeMsg.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}
          >
            {pwChangeMsg.type === 'success' ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {pwChangeMsg.text}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              סיסמה נוכחית
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              סיסמה חדשה
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              אישור סיסמה חדשה
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={pwChangeLoading}
            className="flex items-center gap-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium px-5 py-2.5 transition-colors disabled:opacity-50"
          >
            {pwChangeLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <Shield size={18} />}
            {pwChangeLoading ? 'מעדכן...' : 'עדכן סיסמה'}
          </button>
        </form>
      </Card>

      {/* Danger zone — Delete account */}
      <Card>
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
          <Trash2 size={20} />
          אזור מסוכן
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          מחיקת החשבון תסיר לצמיתות את כל הנתונים שלך: פרופיל, פרסונות, הגשות, ציונים והגדרות.
          פעולה זו אינה ניתנת לשחזור.
        </p>

        {!deleteOpen ? (
          <button
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 px-5 py-2.5 font-medium hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={18} />
            מחק את החשבון שלי
          </button>
        ) : (
          <div className="space-y-3 max-w-md rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10 p-4">
            {deleteError && (
              <div className="text-red-700 dark:text-red-400 text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {deleteError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                אישור: כתוב DELETE
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                הסיסמה הנוכחית שלך
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                dir="ltr"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium px-5 py-2.5 transition-colors disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 size={18} />}
                {deleteLoading ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
              <button
                onClick={() => {
                  setDeleteOpen(false)
                  setDeletePassword('')
                  setDeleteConfirm('')
                  setDeleteError(null)
                }}
                className="rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium px-5 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Save Button (bottom) */}
      <div className="flex justify-center pb-8">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 px-8 py-3 text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 text-lg"
        >
          {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : <Save size={20} />}
          {isSaving ? 'שומר...' : 'שמור הגדרות'}
        </button>
      </div>
    </div>
  )
}

export default Settings
