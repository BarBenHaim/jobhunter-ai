import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Upload,
  Wand2,
  Edit2,
  Check,
  AlertCircle,
  Briefcase,
  BookOpen,
  Globe,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { EmptyState } from '@/components/common/EmptyState'

interface ProfileData {
  id: string
  rawInput?: string
  skills: Array<{
    name: string
    proficiency: number // 0-100
    frequency: number
  }>
  experience: Array<{
    id: string
    title: string
    company: string
    duration: string
    description: string
  }>
  projects: Array<{
    id: string
    name: string
    description: string
    technologies: string[]
    link?: string
  }>
  education: Array<{
    id: string
    school: string
    degree: string
    field: string
    year: string
  }>
  certifications: Array<{
    id: string
    name: string
    issuer: string
    year: string
  }>
  languages: Array<{
    name: string
    proficiency: 'beginner' | 'intermediate' | 'advanced' | 'native'
  }>
  gapAnalysis: {
    missingSkills: string[]
    areasForImprovement: string[]
    recommendations: string[]
  }
}

const Profile = () => {
  const [activeView, setActiveView] = useState<'input' | 'profile'>('input')
  const [rawInput, setRawInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingSection, setEditingSection] = useState<string | null>(null)

  // Fetch profile
  const { data: profile } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: async () => ({
      id: '1',
      rawInput: '',
      skills: [
        { name: 'React', proficiency: 95, frequency: 5 },
        { name: 'TypeScript', proficiency: 90, frequency: 5 },
        { name: 'Node.js', proficiency: 85, frequency: 4 },
        { name: 'CSS/Tailwind', proficiency: 88, frequency: 5 },
        { name: 'PostgreSQL', proficiency: 75, frequency: 3 },
        { name: 'Docker', proficiency: 70, frequency: 2 },
        { name: 'AWS', proficiency: 65, frequency: 2 },
        { name: 'Python', proficiency: 60, frequency: 1 },
      ],
      experience: [
        {
          id: '1',
          title: 'Senior Frontend Engineer',
          company: 'TechCorp Inc',
          duration: '2021 - Present',
          description: 'Led development of customer-facing dashboard serving 100k+ users. Improved application performance by 40% through code optimization.',
        },
        {
          id: '2',
          title: 'Full Stack Developer',
          company: 'WebCo',
          duration: '2018 - 2021',
          description: 'Developed and maintained 5 production React applications. Implemented CI/CD pipelines reducing deployment time by 50%.',
        },
        {
          id: '3',
          title: 'Junior Developer',
          company: 'StartupXYZ',
          duration: '2017 - 2018',
          description: 'Built responsive web interfaces using React and maintained backend APIs with Node.js and Express.',
        },
      ],
      projects: [
        {
          id: '1',
          name: 'JobHunter AI',
          description: 'AI-powered job application automation platform. Built with React, Node.js, TypeScript, and PostgreSQL.',
          technologies: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Tailwind CSS'],
          link: 'https://github.com/example/jobhunter-ai',
        },
        {
          id: '2',
          name: 'E-Commerce Platform',
          description: 'Full-stack e-commerce solution with payment integration and real-time inventory management.',
          technologies: ['Next.js', 'React', 'Stripe', 'MongoDB', 'AWS'],
          link: 'https://github.com/example/ecommerce',
        },
        {
          id: '3',
          name: 'Data Visualization Dashboard',
          description: 'Interactive dashboard for business analytics with real-time data updates.',
          technologies: ['React', 'D3.js', 'WebSockets', 'Node.js'],
          link: 'https://github.com/example/dashboard',
        },
      ],
      education: [
        {
          id: '1',
          school: 'State University',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          year: '2017',
        },
        {
          id: '2',
          school: 'Online Academy',
          degree: 'Certificate',
          field: 'Advanced React Patterns',
          year: '2022',
        },
      ],
      certifications: [
        {
          id: '1',
          name: 'AWS Certified Solutions Architect',
          issuer: 'Amazon Web Services',
          year: '2022',
        },
        {
          id: '2',
          name: 'Certified Kubernetes Administrator',
          issuer: 'Linux Foundation',
          year: '2023',
        },
      ],
      languages: [
        { name: 'English', proficiency: 'native' },
        { name: 'Spanish', proficiency: 'intermediate' },
        { name: 'Mandarin', proficiency: 'beginner' },
      ],
      gapAnalysis: {
        missingSkills: ['Go', 'Rust', 'GraphQL', 'Kubernetes'],
        areasForImprovement: ['System Design', 'ML/Data Science', 'Mobile Development'],
        recommendations: [
          'Consider learning GraphQL to complement REST API skills',
          'Explore DevOps tools to strengthen infrastructure knowledge',
          'Take a course in system design for senior-level interviews',
        ],
      },
    }),
  })

  const handleProcessInput = async () => {
    setIsProcessing(true)
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false)
      setActiveView('profile')
    }, 2000)
  }

  const getProficiencyColor = (level: number): 'success' | 'warning' | 'primary' | 'error' => {
    if (level >= 80) return 'success'
    if (level >= 60) return 'primary'
    if (level >= 40) return 'warning'
    return 'error'
  }

  const getProficiencyLabel = (level: 'beginner' | 'intermediate' | 'advanced' | 'native'): string => {
    switch (level) {
      case 'beginner':
        return 'Beginner'
      case 'intermediate':
        return 'Intermediate'
      case 'advanced':
        return 'Advanced'
      case 'native':
        return 'Native'
    }
  }

  if (activeView === 'input') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Your Profile</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Share your professional background. Our AI will extract and organize your information.
          </p>
        </div>

        {/* Text Input */}
        <Card>
          <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Paste your professional background
          </label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Share your work experience, skills, education, projects, and achievements. Feel free to paste from your CV or write freely."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 dark:border-gray-700 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={12}
          />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            The more detail you provide, the better our AI can tailor your applications.
          </p>
        </Card>

        {/* File Upload */}
        <Card>
          <div className="text-center">
            <div className="rounded-lg bg-gray-100 p-8 dark:bg-gray-800">
              <Upload className="mx-auto mb-3 text-gray-400" size={32} />
              <p className="text-sm font-medium text-gray-900 dark:text-white">Or upload your CV</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">PDF, DOCX, or TXT</p>
              <button className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 font-medium">
                Choose File
              </button>
            </div>
          </div>
        </Card>

        {/* Process Button */}
        <button
          onClick={handleProcessInput}
          disabled={!rawInput.trim() || isProcessing}
          className="w-full rounded-lg bg-primary-600 px-4 py-3 text-white hover:bg-primary-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 transition-all"
        >
          <Wand2 size={20} />
          {isProcessing ? 'Processing...' : 'Process with AI'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Professional Profile</h1>
        <button
          onClick={() => setActiveView('input')}
          className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium"
        >
          Update Profile
        </button>
      </div>

      {/* Skills Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Skills</h2>
          <button
            onClick={() => setEditingSection(editingSection === 'skills' ? null : 'skills')}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile?.skills.map((skill) => (
            <div key={skill.name}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900 dark:text-white">{skill.name}</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{skill.proficiency}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                  style={{ width: `${skill.proficiency}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Experience Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Briefcase size={20} />
            Experience
          </h2>
          <button
            onClick={() => setEditingSection(editingSection === 'experience' ? null : 'experience')}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          {profile?.experience.map((exp, index) => (
            <div key={exp.id} className={`pb-4 ${index !== profile.experience.length - 1 ? 'border-b border-gray-200 dark:border-gray-800' : ''}`}>
              <h3 className="font-semibold text-gray-900 dark:text-white">{exp.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{exp.company} • {exp.duration}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{exp.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Projects Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Projects</h2>
          <button
            onClick={() => setEditingSection(editingSection === 'projects' ? null : 'projects')}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile?.projects.map((project) => (
            <div
              key={project.id}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-800 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">{project.name}</h3>
                {project.link && (
                  <a href={project.link} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700">
                    <Globe size={16} />
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{project.description}</p>
              <div className="flex flex-wrap gap-1">
                {project.technologies.map((tech) => (
                  <Badge key={tech} variant="gray" size="sm">
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Education & Certifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Education */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpen size={20} />
              Education
            </h2>
            <button
              onClick={() => setEditingSection(editingSection === 'education' ? null : 'education')}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="space-y-3">
            {profile?.education.map((edu) => (
              <div key={edu.id}>
                <p className="font-medium text-gray-900 dark:text-white">{edu.school}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{edu.degree} in {edu.field}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">{edu.year}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Certifications */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Check size={20} />
              Certifications
            </h2>
            <button
              onClick={() => setEditingSection(editingSection === 'certifications' ? null : 'certifications')}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="space-y-3">
            {profile?.certifications.map((cert) => (
              <div key={cert.id}>
                <p className="font-medium text-gray-900 dark:text-white">{cert.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{cert.issuer}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">{cert.year}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Languages */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Languages</h2>
        <div className="flex flex-wrap gap-3">
          {profile?.languages.map((lang) => (
            <Badge key={lang.name} variant="primary" size="md">
              {lang.name} - {getProficiencyLabel(lang.proficiency)}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Gap Analysis */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <AlertCircle size={20} />
          Gap Analysis & Recommendations
        </h2>

        {profile?.gapAnalysis && (
          <div className="space-y-4">
            {/* Missing Skills */}
            {profile.gapAnalysis.missingSkills.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Missing Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.gapAnalysis.missingSkills.map((skill) => (
                    <Badge key={skill} variant="error" size="sm">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Areas for Improvement */}
            {profile.gapAnalysis.areasForImprovement.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Areas for Improvement</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.gapAnalysis.areasForImprovement.map((area) => (
                    <Badge key={area} variant="warning" size="sm">
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {profile.gapAnalysis.recommendations.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Recommendations</h3>
                <ul className="space-y-2">
                  {profile.gapAnalysis.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export default Profile
