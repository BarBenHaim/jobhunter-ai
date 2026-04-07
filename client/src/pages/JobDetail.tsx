import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  MapPin,
  Briefcase,
  Calendar,
  ExternalLink,
  FileText,
  CheckCircle,
  AlertCircle,
  Share2,
  Archive,
  X,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { ScoreRadar } from '@/components/common/ScoreRadar'
import { Job, JobScore, Application, CV, Recommendation } from '@/types'

interface JobDetailData extends Job {
  score?: JobScore
  application?: Application
  generatedCV?: CV
  similarJobs?: Job[]
}

const JobDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showCVPreview, setShowCVPreview] = useState(false)

  // Fetch job details
  const { data: job } = useQuery<JobDetailData>({
    queryKey: ['job-detail', id],
    queryFn: async () => null,
  })

  if (!job) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg">לא נמצאה משרה</p>
        <p className="text-sm mt-2">לא ניתן לטעון את הנתונים של משרה זו</p>
      </div>
    )
  }

  const scoreRadarData = job.score
    ? [
        { name: 'Role Match', value: job.score.roleMatch },
        { name: 'Skills Match', value: job.score.skillMatch },
        { name: 'Company Match', value: job.score.companyMatch },
        { name: 'Compensation', value: job.score.compensationMatch },
        { name: 'Location', value: job.score.locationMatch },
      ]
    : []

  const getRecommendationColor = (rec: Recommendation): 'success' | 'warning' | 'error' | 'primary' | 'gray' => {
    switch (rec) {
      case 'strong_pass':
        return 'success'
      case 'pass':
        return 'primary'
      case 'maybe':
        return 'warning'
      case 'review':
        return 'warning'
      case 'weak_reject':
        return 'error'
      case 'strong_reject':
        return 'error'
    }
  }

  const getRecommendationLabel = (rec: Recommendation) => {
    switch (rec) {
      case 'strong_pass':
        return 'Highly Recommended'
      case 'pass':
        return 'Recommended'
      case 'maybe':
        return 'Maybe'
      case 'review':
        return 'Review'
      case 'weak_reject':
        return 'Not Recommended'
      case 'strong_reject':
        return 'Reject'
    }
  }

  const parseDescription = (desc: string) => {
    const sections: { [key: string]: string[] } = {}
    let currentSection = 'overview'
    const lines = desc.split('\n')

    lines.forEach((line) => {
      if (line.startsWith('## ')) {
        currentSection = line.replace('## ', '').toLowerCase().replace(/\s+/g, '_')
        sections[currentSection] = []
      } else if (line.trim()) {
        if (!sections[currentSection]) sections[currentSection] = []
        sections[currentSection].push(line)
      }
    })

    return sections
  }

  const sections = parseDescription(job.description)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <button className="flex items-center gap-2 text-primary-600 hover:text-primary-700 dark:text-primary-400">
          <ChevronLeft size={20} />
          Back
        </button>
        <div className="flex gap-2">
          <button className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <Share2 size={18} />
          </button>
          <button className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <Archive size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Job Description */}
        <div className="lg:col-span-2 space-y-4">
          {/* Job Header */}
          <Card>
            <div className="space-y-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{job.title}</h1>
                <p className="text-xl text-gray-600 dark:text-gray-400 mt-1">{job.company}</p>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <MapPin size={18} />
                  {job.location}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={18} />
                  Posted {new Date(job.postedAt).toLocaleDateString()}
                </div>
                {job.salary && (
                  <div className="flex items-center gap-2">
                    <Briefcase size={18} />
                    ${job.salary.min?.toLocaleString()}-${job.salary.max?.toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                {job.tags?.map((tag) => (
                  <Badge key={tag} variant="gray" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>

              <button className="w-full rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 font-medium">
                View on {job.source}
              </button>
            </div>
          </Card>

          {/* Application Status */}
          {job.application && (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Application Status</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {job.application.status.charAt(0).toUpperCase() + job.application.status.slice(1)}
                  </p>
                </div>
                <CheckCircle className="text-green-600" size={24} />
              </div>
            </Card>
          )}

          {/* Job Description Sections */}
          <Card className="space-y-6">
            {sections.overview && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">About the Role</h2>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  {sections.overview.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            )}

            {sections.responsibilities && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Responsibilities</h2>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  {sections.responsibilities.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-primary-600 dark:text-primary-400 flex-shrink-0 mt-1">•</span>
                      <span>{line.replace(/^-\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.requirements && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Requirements</h2>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  {sections.requirements.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-primary-600 dark:text-primary-400 flex-shrink-0 mt-1">•</span>
                      <span>{line.replace(/^-\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.nice_to_have && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Nice to Have</h2>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  {sections.nice_to_have.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-gray-400 dark:text-gray-600 flex-shrink-0 mt-1">•</span>
                      <span>{line.replace(/^-\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.benefits && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Benefits</h2>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  {sections.benefits.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-green-600 dark:text-green-400 flex-shrink-0 mt-1">•</span>
                      <span>{line.replace(/^-\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Similar Jobs */}
          {job.similarJobs && job.similarJobs.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Similar Jobs</h2>
              <div className="space-y-3">
                {job.similarJobs.map((similarJob) => (
                  <div key={similarJob.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                    <h3 className="font-medium text-gray-900 dark:text-white">{similarJob.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{similarJob.company} • {similarJob.location}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel - Score & Actions */}
        <div className="space-y-4">
          {/* Score Card */}
          {job.score && (
            <Card>
              <div className="text-center mb-4">
                <div className="flex justify-center mb-4">
                  <ScoreRadar data={scoreRadarData} />
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Overall Score</p>
                  <div className="flex items-baseline justify-center gap-1 mt-2">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">{job.score.overallScore}</span>
                    <span className="text-gray-500 dark:text-gray-400">/100</span>
                  </div>
                </div>

                <Badge
                  variant={getRecommendationColor(job.score.recommendation)}
                  className="mt-4 w-full justify-center"
                >
                  {getRecommendationLabel(job.score.recommendation)}
                </Badge>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">AI Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{job.score.reasoning}</p>
              </div>
            </Card>
          )}

          {/* Strengths & Gaps */}
          {job.score && (
            <>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Matched Skills</h3>
                <div className="space-y-2">
                  {job.score.strengths.slice(0, 3).map((strength, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle size={16} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{strength}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Gaps & Red Flags</h3>
                <div className="space-y-2">
                  {job.score.gaps.length > 0 ? (
                    job.score.gaps.map((gap, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{gap}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">No major gaps identified</p>
                  )}
                </div>
              </Card>
            </>
          )}

          {/* Action Buttons */}
          <Card>
            <div className="space-y-2">
              <button
                onClick={() => navigate(`/cv-generator?jobId=${id}`)}
                className="w-full rounded-lg bg-gradient-to-r from-primary-600 to-purple-600 px-4 py-3 text-white hover:shadow-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                <FileText size={18} />
                Generate Tailored CV
              </button>

              {!job.application ? (
                <>
                  <button className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                    Generate CV & Apply
                  </button>
                  <button className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                    Generate CV Only
                  </button>
                </>
              ) : (
                <>
                  <button className="w-full rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 font-medium transition-colors">
                    Already Applied
                  </button>
                  <button className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                    View Application
                  </button>
                </>
              )}

              <button className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                Skip This Job
              </button>
            </div>
          </Card>

          {/* Generated CV Preview */}
          {job.generatedCV && (
            <Card>
              <button
                onClick={() => setShowCVPreview(!showCVPreview)}
                className="w-full flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-primary-600 dark:text-primary-400" />
                  <span className="font-medium text-gray-900 dark:text-white">Generated CV</span>
                </div>
                <span className="text-xs text-gray-500">ATS Score: {job.generatedCV.atsScore}%</span>
              </button>

              {showCVPreview && (
                <div className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
                    {job.generatedCV.content}
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default JobDetail
