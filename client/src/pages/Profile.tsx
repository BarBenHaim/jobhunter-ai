import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Upload,
  Wand2,
  Edit2,
  AlertCircle,
  Briefcase,
  BookOpen,
  Globe,
  GraduationCap,
  Code,
  Shield,
  Languages,
  Loader2,
  CheckCircle,
  User,
  MapPin,
  Mail,
  Phone,
  Linkedin,
  Github,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { profileApi } from '@/services/profile.api'

const Profile = () => {
  const queryClient = useQueryClient()
  const [rawInput, setRawInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch profile using the SAME queryKey as App.tsx to share cache
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
  })

  const sp = profile?.structuredProfile as any
  const hasStructuredData = sp && (sp.experience?.length > 0 || sp.skills || sp.education?.length > 0)

  const handleSubmitKnowledge = async () => {
    if (!rawInput.trim()) return
    setIsProcessing(true)
    setError(null)
    try {
      await profileApi.submitKnowledge({ text: rawInput })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSuccessMsg('הפרופיל עודכן בהצלחה!')
      setRawInput('')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      setError(err?.message || 'שגיאה בעדכון הפרופיל')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin h-8 w-8 text-primary-500" />
      </div>
    )
  }

  // Extract skills as flat array from structured profile
  const getSkillsList = (): string[] => {
    if (!sp?.skills) return []
    const skills: string[] = []
    if (typeof sp.skills === 'object' && !Array.isArray(sp.skills)) {
      for (const category of Object.values(sp.skills)) {
        if (Array.isArray(category)) {
          skills.push(...category)
        }
      }
    } else if (Array.isArray(sp.skills)) {
      for (const s of sp.skills) {
        if (typeof s === 'string') skills.push(s)
        else if (s?.name) skills.push(s.name)
      }
    }
    return skills
  }

  const skillsList = getSkillsList()
  const experiences = sp?.experience || []
  const education = sp?.education || []
  const projects = sp?.projects || []
  const military = sp?.military
  const spokenLanguages = sp?.spokenLanguages || []

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary-500/20 flex-shrink-0">
            {profile?.fullName?.charAt(0) || <User size={32} />}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {profile?.fullName || 'No Name'}
            </h1>
            {sp?.personalInfo?.title && (
              <p className="text-primary-600 dark:text-primary-400 font-medium mt-0.5">{sp.personalInfo.title}</p>
            )}
            {sp?.summary && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{sp.summary}</p>
            )}

            {/* Contact Info */}
            <div className="flex flex-wrap gap-4 mt-3">
              {profile?.email && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <Mail size={14} /> {profile.email}
                </span>
              )}
              {profile?.phone && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <Phone size={14} /> {profile.phone}
                </span>
              )}
              {profile?.location && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin size={14} /> {profile.location}
                </span>
              )}
              {profile?.linkedinUrl && (
                <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                  <Linkedin size={14} /> LinkedIn
                </a>
              )}
              {profile?.githubUrl && (
                <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                  <Github size={14} /> GitHub
                </a>
              )}
            </div>
          </div>
        </div>
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

      {/* Skills Section */}
      {skillsList.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Code size={20} className="text-primary-500" />
            Technical Skills
          </h2>

          {typeof sp?.skills === 'object' && !Array.isArray(sp.skills) ? (
            // Categorized skills
            <div className="space-y-3">
              {Object.entries(sp.skills).map(([category, skills]: [string, any]) => (
                Array.isArray(skills) && skills.length > 0 && (
                  <div key={category}>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize mb-1.5">
                      {category.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((skill: string) => (
                        <Badge key={skill} variant="primary" size="sm">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          ) : (
            // Flat skills list
            <div className="flex flex-wrap gap-2">
              {skillsList.map((skill) => (
                <Badge key={skill} variant="primary" size="sm">{skill}</Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Experience Section */}
      {experiences.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Briefcase size={20} className="text-primary-500" />
            Work Experience
          </h2>

          <div className="space-y-5">
            {experiences.map((exp: any, index: number) => (
              <div key={index} className={`${index !== experiences.length - 1 ? 'pb-5 border-b border-gray-100 dark:border-gray-700/50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{exp.title}</h3>
                    <p className="text-primary-600 dark:text-primary-400 text-sm font-medium">{exp.company}</p>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{exp.period}</span>
                </div>
                {exp.highlights && Array.isArray(exp.highlights) && (
                  <ul className="mt-2 space-y-1">
                    {exp.highlights.map((h: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="text-primary-500 flex-shrink-0 mt-1">•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {exp.description && typeof exp.description === 'string' && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{exp.description}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Projects Section */}
      {projects.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText size={20} className="text-primary-500" />
            Projects
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project: any, index: number) => (
              <div key={index} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-gray-900 dark:text-white">{project.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{project.description}</p>
                {project.technologies && Array.isArray(project.technologies) && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {project.technologies.map((tech: string) => (
                      <Badge key={tech} variant="gray" size="sm">{tech}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Education Section */}
      {education.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <GraduationCap size={20} className="text-primary-500" />
            Education
          </h2>

          <div className="space-y-4">
            {education.map((edu: any, index: number) => (
              <div key={index} className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {edu.degree}{edu.field ? ` — ${edu.field}` : ''}
                  </h3>
                  <p className="text-primary-600 dark:text-primary-400 text-sm font-medium">{edu.institution || edu.school}</p>
                  {edu.status && <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{edu.status}</p>}
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{edu.period || edu.year}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Military Section */}
      {military && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Shield size={20} className="text-primary-500" />
            Military Service
          </h2>

          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{military.role}</h3>
              <p className="text-primary-600 dark:text-primary-400 text-sm font-medium">{military.unit}</p>
              {military.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{military.description}</p>
              )}
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{military.period}</span>
          </div>
        </Card>
      )}

      {/* Languages Section */}
      {spokenLanguages.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Languages size={20} className="text-primary-500" />
            Languages
          </h2>
          <div className="flex flex-wrap gap-2">
            {spokenLanguages.map((lang: string) => (
              <Badge key={lang} variant="primary" size="md">{lang}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Update Profile Section */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2" dir="rtl">
          <Wand2 size={20} className="text-primary-500" />
          עדכון פרופיל
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3" dir="rtl">
          הדבק את הרקע המקצועי שלך וה-AI ינתח ויעדכן את הפרופיל
        </p>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="הדבק כאן את קורות החיים או הרקע המקצועי שלך..."
          className="w-full rounded-xl border border-gray-300 px-4 py-3 dark:border-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          rows={6}
          dir="rtl"
        />
        <button
          onClick={handleSubmitKnowledge}
          disabled={!rawInput.trim() || isProcessing}
          className="mt-3 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 px-6 py-2.5 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" />
              מעבד...
            </>
          ) : (
            <>
              <Wand2 size={16} />
              עדכן עם AI
            </>
          )}
        </button>
      </Card>

      {/* Empty state if no structured data at all */}
      {!hasStructuredData && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400" dir="rtl">
          <p className="text-lg">אין נתונים מובנים עדיין</p>
          <p className="text-sm mt-1">הדבק את הרקע המקצועי שלך בתיבה למעלה כדי שה-AI ינתח אותו</p>
        </div>
      )}
    </div>
  )
}

export default Profile
