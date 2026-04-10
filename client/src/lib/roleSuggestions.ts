/**
 * Role suggestion helper.
 *
 * Given the user's structuredProfile (from Profile page), return a list of
 * recommended tech roles for CV generation. Used by CVGenerator and Dashboard.
 *
 * The returned roles are a superset: (a) a short catalog of common tech roles,
 * each with a match score based on the profile's experience titles + skills,
 * sorted so the best matches come first.
 */

export interface RoleSuggestion {
  id: string
  name: string
  nameHe: string
  icon: string
  description: string
  /** Keywords used for scoring — not displayed. */
  keywords: string[]
  /** Match score 0..100 — only set when we've scored against a profile. */
  score?: number
}

// A broad catalog of tech roles in the Israeli hi-tech market.
// Order here is irrelevant — we re-sort by match score.
export const ROLE_CATALOG: RoleSuggestion[] = [
  {
    id: 'frontend',
    name: 'Frontend Developer',
    nameHe: 'מפתח Frontend',
    icon: '🎨',
    description: 'React, Vue, UI/UX, CSS',
    keywords: ['frontend', 'front-end', 'react', 'vue', 'angular', 'ui', 'ux', 'css', 'html', 'javascript', 'typescript', 'next', 'tailwind', 'redux'],
  },
  {
    id: 'backend',
    name: 'Backend Developer',
    nameHe: 'מפתח Backend',
    icon: '⚙️',
    description: 'Node.js, APIs, databases',
    keywords: ['backend', 'back-end', 'node', 'nestjs', 'express', 'api', 'rest', 'graphql', 'postgres', 'mongodb', 'redis', 'java', 'spring', 'golang', '.net', 'python', 'django', 'fastapi'],
  },
  {
    id: 'fullstack',
    name: 'Full Stack Developer',
    nameHe: 'מפתח Full Stack',
    icon: '🔄',
    description: 'Frontend + Backend',
    keywords: ['full stack', 'fullstack', 'full-stack', 'react', 'node', 'express', 'mongodb', 'postgres', 'api', 'frontend', 'backend'],
  },
  {
    id: 'mobile',
    name: 'Mobile Developer',
    nameHe: 'מפתח Mobile',
    icon: '📱',
    description: 'iOS, Android, React Native',
    keywords: ['mobile', 'ios', 'android', 'react native', 'swift', 'kotlin', 'flutter', 'dart'],
  },
  {
    id: 'devops',
    name: 'DevOps Engineer',
    nameHe: 'DevOps',
    icon: '☁️',
    description: 'AWS, K8s, CI/CD, IaC',
    keywords: ['devops', 'aws', 'gcp', 'azure', 'kubernetes', 'k8s', 'docker', 'terraform', 'ci/cd', 'jenkins', 'ansible', 'linux', 'sre', 'site reliability'],
  },
  {
    id: 'data',
    name: 'Data / BI Analyst',
    nameHe: 'אנליסט דאטה / BI',
    icon: '📊',
    description: 'SQL, Tableau, reporting',
    keywords: ['data', 'analyst', 'bi', 'sql', 'tableau', 'power bi', 'looker', 'excel', 'python', 'etl', 'dashboards', 'analytics'],
  },
  {
    id: 'dataeng',
    name: 'Data Engineer',
    nameHe: 'Data Engineer',
    icon: '🗄️',
    description: 'Pipelines, Spark, Airflow',
    keywords: ['data engineer', 'spark', 'airflow', 'kafka', 'snowflake', 'bigquery', 'dbt', 'pipeline', 'etl', 'python', 'scala'],
  },
  {
    id: 'ai',
    name: 'AI / ML Engineer',
    nameHe: 'AI / ML',
    icon: '🤖',
    description: 'LLMs, models, MLOps',
    keywords: ['ai', 'ml', 'machine learning', 'llm', 'gpt', 'pytorch', 'tensorflow', 'hugging face', 'transformers', 'nlp', 'computer vision', 'mlops', 'openai', 'anthropic'],
  },
  {
    id: 'qa',
    name: 'QA Engineer',
    nameHe: 'QA / בדיקות',
    icon: '✅',
    description: 'Automation, Cypress, testing',
    keywords: ['qa', 'quality assurance', 'test', 'automation', 'cypress', 'selenium', 'playwright', 'jest', 'junit', 'manual testing'],
  },
  {
    id: 'security',
    name: 'Security Engineer',
    nameHe: 'סייבר / Security',
    icon: '🛡️',
    description: 'Cybersecurity, penetration testing',
    keywords: ['security', 'cybersecurity', 'pentest', 'penetration', 'soc', 'siem', 'infosec', 'cyber', 'vulnerability'],
  },
  {
    id: 'pm',
    name: 'Product Manager',
    nameHe: 'Product Manager',
    icon: '📋',
    description: 'Product strategy, roadmap',
    keywords: ['product manager', 'product management', 'pm', 'roadmap', 'user research', 'stakeholder', 'scrum', 'agile', 'jira'],
  },
  {
    id: 'designer',
    name: 'Product Designer',
    nameHe: 'Product / UX Designer',
    icon: '✏️',
    description: 'UX, UI, Figma',
    keywords: ['designer', 'ux', 'ui', 'figma', 'sketch', 'adobe xd', 'wireframe', 'prototype', 'user experience'],
  },
  {
    id: 'general',
    name: 'General Purpose',
    nameHe: 'כללי',
    icon: '📄',
    description: 'All-purpose CV for any tech role',
    keywords: [],
  },
]

/**
 * Flatten a structuredProfile into a big lowercased searchable text blob,
 * weighted loosely by signal strength.
 */
const profileToText = (structuredProfile: any): string => {
  if (!structuredProfile) return ''
  const parts: string[] = []

  const sp = structuredProfile
  if (sp.personalInfo?.title) parts.push(sp.personalInfo.title, sp.personalInfo.title)
  if (sp.summary) parts.push(String(sp.summary))

  if (Array.isArray(sp.experience)) {
    for (const exp of sp.experience) {
      if (exp?.title) parts.push(String(exp.title), String(exp.title))
      if (exp?.description) parts.push(String(exp.description))
      if (Array.isArray(exp?.highlights)) parts.push(exp.highlights.join(' '))
    }
  }

  // Skills may be an object of category -> string[], or a flat array
  if (sp.skills) {
    if (Array.isArray(sp.skills)) {
      parts.push(sp.skills.map((s: any) => (typeof s === 'string' ? s : s?.name || '')).join(' '))
    } else if (typeof sp.skills === 'object') {
      for (const cat of Object.values(sp.skills)) {
        if (Array.isArray(cat)) parts.push((cat as any[]).join(' '))
      }
    }
  }

  if (Array.isArray(sp.projects)) {
    for (const p of sp.projects) {
      if (p?.name) parts.push(String(p.name))
      if (p?.description) parts.push(String(p.description))
      if (Array.isArray(p?.technologies)) parts.push(p.technologies.join(' '))
    }
  }

  return parts.join(' ').toLowerCase()
}

/**
 * Score a role against a profile text blob. Each matched keyword adds
 * 1 point per occurrence (capped) and the final score is normalized
 * to 0..100 relative to the maximum possible for that role.
 */
const scoreRole = (role: RoleSuggestion, text: string): number => {
  if (!role.keywords.length) return 10 // general purpose baseline
  let hits = 0
  for (const kw of role.keywords) {
    const needle = kw.toLowerCase()
    // Count occurrences (bounded at 3 per keyword to avoid skewing)
    let idx = 0
    let occurrences = 0
    while (occurrences < 3) {
      const next = text.indexOf(needle, idx)
      if (next === -1) break
      occurrences += 1
      idx = next + needle.length
    }
    hits += occurrences
  }
  // Normalize: max possible is keywords.length * 3
  const max = role.keywords.length * 3
  return Math.round((hits / max) * 100)
}

/**
 * Return all roles with scores sorted by score desc.
 */
export const suggestRoles = (structuredProfile: any): RoleSuggestion[] => {
  const text = profileToText(structuredProfile)
  if (!text) return ROLE_CATALOG.map((r) => ({ ...r, score: 0 }))

  const scored = ROLE_CATALOG.map((r) => ({ ...r, score: scoreRole(r, text) }))
  return scored.sort((a, b) => (b.score || 0) - (a.score || 0))
}

/**
 * Return the top N recommended role IDs from a profile.
 * Falls back to fullstack/frontend/backend/general if nothing is inferable.
 */
export const topRoleIds = (structuredProfile: any, n: number = 3): string[] => {
  const ranked = suggestRoles(structuredProfile)
  const withHits = ranked.filter((r) => (r.score || 0) > 0)
  if (withHits.length >= n) return withHits.slice(0, n).map((r) => r.id)

  // Not enough strong hits — top-up with sensible defaults
  const fallback = ['fullstack', 'frontend', 'backend', 'general']
  const ids = new Set(withHits.map((r) => r.id))
  for (const id of fallback) {
    if (ids.size >= n) break
    ids.add(id)
  }
  return Array.from(ids).slice(0, n)
}

/**
 * Look up a role by id. Returns undefined if not found.
 */
export const getRoleById = (id: string): RoleSuggestion | undefined =>
  ROLE_CATALOG.find((r) => r.id === id)
