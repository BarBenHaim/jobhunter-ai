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
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { profileApi } from '@/services/profile.api'

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
