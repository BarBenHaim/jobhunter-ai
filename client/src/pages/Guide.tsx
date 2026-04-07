import { useState } from 'react'

const SECTIONS = [
  { id: 'overview', label: 'סקירה כללית' },
  { id: 'setup', label: 'הגדרות מומלצות' },
  { id: 'costs', label: 'עלויות שימוש' },
  { id: 'features', label: 'איך להשתמש' },
  { id: 'env', label: 'Environment Variables' },
  { id: 'tips', label: 'טיפים' },
]

export default function Guide() {
  const [activeSection, setActiveSection] = useState('overview')

  return (
    <div className="flex gap-6 max-w-6xl mx-auto">
      {/* Sidebar Navigation */}
      <nav className="hidden lg:block w-56 flex-shrink-0 sticky top-6 self-start">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">תוכן העניינים</h3>
          <ul className="space-y-1">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setActiveSection(s.id)
                    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === s.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 space-y-8 min-w-0">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">מדריך שימוש ועלויות</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">הכל על איך להגדיר את JobHunter AI וכמה זה עולה</p>
        </div>

        {/* ===== OVERVIEW ===== */}
        <section id="overview" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">🎯</span> סקירה כללית
          </h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4" dir="rtl">
            JobHunter AI היא מערכת חכמה לחיפוש עבודה שמשלבת סריקת משרות אוטומטית מאתרי דרושים,
            ניקוד AI חכם שמתאים משרות לפרופיל שלך, יצירת קורות חיים מותאמים ATS,
            ומעקב אחרי כל תהליך ההגשה.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" dir="rtl">
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">סריקת משרות</h3>
              <p className="text-sm text-blue-700 dark:text-blue-400">סריקה אוטומטית מ-5 מקורות: Drushim, AllJobs, Indeed, Career Pages, Google Jobs</p>
            </div>
            <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 p-4">
              <div className="text-2xl mb-2">🤖</div>
              <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-1">ניקוד AI</h3>
              <p className="text-sm text-purple-700 dark:text-purple-400">Claude AI מנתח כל משרה ונותן ציון התאמה לפרופיל שלך</p>
            </div>
            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4">
              <div className="text-2xl mb-2">📄</div>
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-1">קורות חיים ATS</h3>
              <p className="text-sm text-green-700 dark:text-green-400">יצירת 6 גרסאות CV מותאמות לסוגי תפקידים שונים</p>
            </div>
          </div>
        </section>

        {/* ===== ARCHITECTURE ===== */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">🏗️</span> ארכיטקטורה
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">רכיב</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">טכנולוגיה</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">איפה מאוחסן</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">עלות חודשית</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <tr>
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">Frontend</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300">React + Vite + TypeScript</td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full text-xs bg-black text-white">Vercel</span></td>
                  <td className="py-3 px-4 text-green-600 dark:text-green-400 font-medium">$0 (חינם)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">Backend</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300">Express + Node.js</td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full text-xs bg-purple-600 text-white">Railway</span></td>
                  <td className="py-3 px-4 text-yellow-600 dark:text-yellow-400 font-medium">$5-10</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">Database</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300">PostgreSQL + Prisma ORM</td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full text-xs bg-purple-600 text-white">Railway</span></td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">(כלול ב-Railway)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">AI Engine</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300">Anthropic Claude API</td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full text-xs bg-orange-500 text-white">Anthropic</span></td>
                  <td className="py-3 px-4 text-yellow-600 dark:text-yellow-400 font-medium">$3-15</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== RECOMMENDED SETTINGS ===== */}
        <section id="setup" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">⚙️</span> הגדרות מומלצות
          </h2>

          <div className="space-y-6" dir="rtl">
            {/* Personas */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/30 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">👤 פרסונות (Personas) - מומלץ ליצור 2-3</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                כל פרסונה מייצגת סוג תפקיד שאתה מחפש. המערכת מנקדת כל משרה לפי כל פרסונה.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                  <p className="font-medium text-sm text-gray-800 dark:text-gray-200">Full Stack Developer</p>
                  <p className="text-xs text-gray-500 mt-1">Keywords: React, Node.js, TypeScript, Full Stack, MongoDB, PostgreSQL</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                  <p className="font-medium text-sm text-gray-800 dark:text-gray-200">Frontend Developer</p>
                  <p className="text-xs text-gray-500 mt-1">Keywords: React, Next.js, CSS, Tailwind, JavaScript, UI/UX</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                  <p className="font-medium text-sm text-gray-800 dark:text-gray-200">AI/ML Engineer</p>
                  <p className="text-xs text-gray-500 mt-1">Keywords: AI, Machine Learning, Python, LLMs, Claude, API Integration</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                  <p className="font-medium text-sm text-gray-800 dark:text-gray-200">Data Engineer / BI</p>
                  <p className="text-xs text-gray-500 mt-1">Keywords: SQL, Qlik, Data Analysis, BI, Python, Dashboard</p>
                </div>
              </div>
            </div>

            {/* Scraping settings */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/30 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🔍 הגדרות סריקה</h3>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">מילות חיפוש בעברית ובאנגלית</span> -
                    כדאי לכלול גם "מפתח תוכנה", "פיתוח" וגם "React", "Full Stack" כי חלק מהאתרים בעברית
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">תדירות סריקה</span> -
                    מומלץ פעם ביום. יותר מדי סריקות לא יביא תוצאות חדשות ויבזבז משאבים
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">מקורות מומלצים</span> -
                    Drushim ו-AllJobs הם הכי אמינים. Indeed עובד דרך RSS. Career Pages דורש גישה ל-Google
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">⚠</span>
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">Google Jobs (SerpAPI)</span> -
                    דורש מפתח API בתשלום. אופציונלי אבל מביא תוצאות מעולות
                  </div>
                </div>
              </div>
            </div>

            {/* Scoring settings */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/30 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🎯 ניקוד AI - מה הציונים אומרים</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-600">85-100</div>
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1">התאמה מצוינת<br/>הגש מיד!</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="text-2xl font-bold text-blue-600">70-84</div>
                  <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">התאמה טובה<br/>שווה להגיש</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="text-2xl font-bold text-yellow-600">50-69</div>
                  <div className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">התאמה חלקית<br/>בדוק ידנית</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <div className="text-2xl font-bold text-red-600">0-49</div>
                  <div className="text-xs text-red-700 dark:text-red-400 mt-1">לא מתאים<br/>דלג</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== COSTS ===== */}
        <section id="costs" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">💰</span> עלויות שימוש מפורטות
          </h2>

          <div className="space-y-6">
            {/* Free tier */}
            <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-green-800 dark:text-green-300 text-lg">חינם - בלי API Keys</h3>
                <span className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-bold">$0/חודש</span>
              </div>
              <p className="text-sm text-green-700 dark:text-green-400 mb-3" dir="rtl">מה עובד בלי לשלם כלום:</p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300" dir="rtl">
                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> סריקת משרות מ-Drushim, AllJobs, Indeed (RSS)</li>
                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> שמירת משרות ב-Database</li>
                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> חיפוש וסינון משרות</li>
                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> ניהול פרסונות</li>
                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> מעקב הגשות (Pipeline)</li>
                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> יצירת CV בסיסי (Template-based)</li>
                <li className="flex items-center gap-2"><span className="text-red-400">✗</span> ניקוד AI (דורש Anthropic API)</li>
                <li className="flex items-center gap-2"><span className="text-red-400">✗</span> Google Jobs (דורש SerpAPI)</li>
              </ul>
            </div>

            {/* Anthropic API */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <span className="text-xl">🧠</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Anthropic Claude API</h3>
                    <p className="text-xs text-gray-500">ANTHROPIC_API_KEY</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm font-bold">$3-15/חודש</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm mt-3">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-medium">פעולה</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-medium">טוקנים לקריאה</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-medium">עלות לקריאה</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 font-medium">שימוש חודשי טיפוסי</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">ניקוד משרה (Score Job)</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~2,000 tokens</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~$0.006</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">200 משרות = ~$1.20</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">יצירת CV מותאם</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~4,000 tokens</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~$0.012</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">30 CVs = ~$0.36</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">הכנה לראיון</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~3,000 tokens</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~$0.009</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">10 הכנות = ~$0.09</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">ניתוח פרופיל</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~3,000 tokens</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">~$0.009</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-300">5 ניתוחים = ~$0.045</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 dark:border-gray-700">
                      <td className="py-3 px-3 font-bold text-gray-900 dark:text-white" colSpan={3}>סה"כ חודשי משוער (שימוש רגיל)</td>
                      <td className="py-3 px-3 font-bold text-orange-600 dark:text-orange-400">$3-8</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-gray-900 dark:text-white" colSpan={3}>סה"כ חודשי (שימוש אינטנסיבי)</td>
                      <td className="py-2 px-3 font-bold text-orange-600 dark:text-orange-400">$10-15</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 rounded-lg bg-orange-50 dark:bg-orange-900/10 p-3 text-sm" dir="rtl">
                <p className="font-medium text-orange-800 dark:text-orange-300 mb-1">💡 תמחור Claude Sonnet 4 (המודל שבשימוש):</p>
                <p className="text-orange-700 dark:text-orange-400">Input: $3 / 1M tokens &nbsp;|&nbsp; Output: $15 / 1M tokens</p>
                <p className="text-orange-600 dark:text-orange-500 mt-1">הרשמה: <a href="https://console.anthropic.com" target="_blank" rel="noopener" className="underline">console.anthropic.com</a> → צור API Key → שים ב-Railway</p>
              </div>
            </div>

            {/* Railway */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <span className="text-xl">🚂</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Railway (Backend + DB)</h3>
                    <p className="text-xs text-gray-500">Server, PostgreSQL, Redis</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-sm font-bold">$5-10/חודש</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300" dir="rtl">
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> Trial Plan: $5 credit חינם (מספיק לשבועיים)</li>
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> Hobby Plan: $5/חודש + usage (מספיק לאפליקציה כזו)</li>
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> PostgreSQL: ~$0.50-2/חודש (תלוי בכמות data)</li>
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> Server: ~$2-5/חודש (תלוי בשימוש CPU)</li>
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> Redis (אופציונלי, לתורים): ~$1/חודש</li>
              </ul>
            </div>

            {/* Vercel */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-xl">▲</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Vercel (Frontend)</h3>
                    <p className="text-xs text-gray-500">Static hosting + CDN</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-bold">$0 (חינם)</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300" dir="rtl">
                Hobby Plan של Vercel הוא חינמי לחלוטין ומספיק בשביל האפליקציה הזו. כולל HTTPS, CDN גלובלי, ו-auto-deploy מ-GitHub.
              </p>
            </div>

            {/* SerpAPI - Optional */}
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <span className="text-xl">🔎</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">SerpAPI (אופציונלי)</h3>
                    <p className="text-xs text-gray-500">SERPAPI_KEY - Google Jobs scraping</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-sm font-bold">$0-50/חודש</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300" dir="rtl">
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> Free Plan: 100 חיפושים/חודש (מספיק לשימוש קל)</li>
                <li className="flex items-center gap-2"><span className="text-gray-400">•</span> Paid Plan: $50/חודש עם 5,000 חיפושים</li>
                <li className="flex items-center gap-2"><span className="text-yellow-500">⚠</span> לא חובה! Drushim, AllJobs, Indeed עובדים בלי זה</li>
              </ul>
              <p className="text-sm text-gray-500 mt-2" dir="rtl">
                הרשמה: <a href="https://serpapi.com" target="_blank" rel="noopener" className="underline text-blue-500">serpapi.com</a>
              </p>
            </div>

            {/* Total Summary */}
            <div className="rounded-xl bg-gradient-to-r from-primary-500/10 to-purple-500/10 border border-primary-200 dark:border-primary-800 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">סיכום עלויות חודשיות</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl bg-white/50 dark:bg-gray-800/50">
                  <div className="text-sm text-gray-500 mb-1">שימוש בסיסי</div>
                  <div className="text-3xl font-bold text-green-600">$5</div>
                  <div className="text-xs text-gray-400 mt-1">Railway בלבד<br/>בלי AI</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 ring-2 ring-primary-500/30">
                  <div className="text-sm text-primary-600 dark:text-primary-400 font-medium mb-1">מומלץ</div>
                  <div className="text-3xl font-bold text-primary-600">$10-18</div>
                  <div className="text-xs text-gray-400 mt-1">Railway + Claude API<br/>הכל עובד</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-white/50 dark:bg-gray-800/50">
                  <div className="text-sm text-gray-500 mb-1">שימוש מקסימלי</div>
                  <div className="text-3xl font-bold text-purple-600">$25-70</div>
                  <div className="text-xs text-gray-400 mt-1">+ SerpAPI<br/>+ שימוש אינטנסיבי</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== HOW TO USE ===== */}
        <section id="features" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">📖</span> איך להשתמש - שלב אחרי שלב
          </h2>

          <div className="space-y-4" dir="rtl">
            {[
              { step: 1, title: 'התחבר', desc: 'היכנס עם barbenbh@gmail.com / 123456 או צור משתמש חדש', icon: '🔑' },
              { step: 2, title: 'בדוק את הפרופיל', desc: 'עבור לעמוד Profile ווודא שכל המידע שלך נכון. אפשר לערוך ולהוסיף מידע', icon: '👤' },
              { step: 3, title: 'צור פרסונות', desc: 'עבור ל-Personas וצור 2-3 פרסונות לפי סוגי תפקידים שאתה מחפש. הוסף keywords רלוונטיים', icon: '🎭' },
              { step: 4, title: 'סרוק משרות', desc: 'עבור ל-Dashboard ולחץ Trigger Scrape. המערכת תסרוק את כל המקורות ותשמור משרות חדשות', icon: '🔍' },
              { step: 5, title: 'עיין במשרות', desc: 'עבור ל-Jobs כדי לראות את כל המשרות. השתמש בפילטרים לפי מקור, מיקום, רמת ניסיון', icon: '📋' },
              { step: 6, title: 'ניקוד AI', desc: 'משרות ינוקדו אוטומטית ע"י Claude AI לפי הפרסונות שלך (דורש ANTHROPIC_API_KEY)', icon: '🤖' },
              { step: 7, title: 'צור קורות חיים', desc: 'עבור ל-CV Generator ויצר גרסאות ATS מותאמות לסוגי תפקידים שונים', icon: '📄' },
              { step: 8, title: 'הגש ועקוב', desc: 'דרך Pipeline - עקוב אחרי כל ההגשות, סטטוסים, וראיונות', icon: '🚀' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm">
                  {item.step}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>{item.icon}</span> {item.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== ENV VARIABLES ===== */}
        <section id="env" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">🔧</span> Environment Variables
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4" dir="rtl">
            משתני סביבה שצריך להגדיר ב-Railway (Backend) וב-Vercel (Frontend):
          </p>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Railway (Server) - חובה:</h3>
              <div className="rounded-lg bg-gray-900 p-4 font-mono text-sm text-green-400 overflow-x-auto space-y-1">
                <div><span className="text-gray-500"># Database (Railway auto-generates)</span></div>
                <div>DATABASE_URL=<span className="text-yellow-300">postgresql://user:pass@host:5432/railway</span></div>
                <div className="mt-2"><span className="text-gray-500"># Auth</span></div>
                <div>JWT_SECRET=<span className="text-yellow-300">your-super-secret-key-here</span></div>
                <div className="mt-2"><span className="text-gray-500"># AI (for scoring, CV generation, interview prep)</span></div>
                <div>ANTHROPIC_API_KEY=<span className="text-yellow-300">sk-ant-api03-...</span></div>
                <div className="mt-2"><span className="text-gray-500"># CORS</span></div>
                <div>CORS_ORIGIN=<span className="text-yellow-300">https://jobhunter-ai-blush.vercel.app</span></div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Railway (Server) - אופציונלי:</h3>
              <div className="rounded-lg bg-gray-900 p-4 font-mono text-sm text-green-400 overflow-x-auto space-y-1">
                <div><span className="text-gray-500"># Google Jobs (optional, $0-50/mo)</span></div>
                <div>SERPAPI_KEY=<span className="text-yellow-300">your-serpapi-key</span></div>
                <div className="mt-2"><span className="text-gray-500"># Redis (optional, for job queues)</span></div>
                <div>REDIS_URL=<span className="text-yellow-300">redis://default:pass@host:6379</span></div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Vercel (Frontend):</h3>
              <div className="rounded-lg bg-gray-900 p-4 font-mono text-sm text-green-400 overflow-x-auto">
                <div>VITE_API_URL=<span className="text-yellow-300">https://jobhunter-ai-production.up.railway.app/api</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== TIPS ===== */}
        <section id="tips" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">💡</span> טיפים
          </h2>
          <div className="space-y-3" dir="rtl">
            {[
              { tip: 'שמור על הפרופיל מעודכן - ככל שהמידע מדויק יותר, ה-AI ינקד טוב יותר', type: 'success' },
              { tip: 'צור לפחות 2 פרסונות שונות כדי לראות איך משרות מדורגות לפי סוגי תפקידים', type: 'info' },
              { tip: 'השתמש במילות חיפוש גם בעברית וגם באנגלית - Drushim ו-AllJobs עובדים יותר טוב בעברית', type: 'info' },
              { tip: 'אל תסרוק יותר מ-2-3 פעמים ביום - אתרי הדרושים עלולים לחסום בקשות מרובות', type: 'warning' },
              { tip: 'CV Generator יוצר גרסאות מותאמות - אל תשלח את אותו CV לכל משרה!', type: 'success' },
              { tip: 'ניקוד AI מתעלם מגרסת הניסיון הגולמית ומתמקד בהתאמה למשרה הספציפית', type: 'info' },
              { tip: 'החלף את ה-GitHub PAT Token שלך (ghp_...) אם שיתפת אותו - זה סיכון אבטחה!', type: 'warning' },
            ].map((item, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                item.type === 'success' ? 'bg-green-50 dark:bg-green-900/10' :
                item.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/10' :
                'bg-blue-50 dark:bg-blue-900/10'
              }`}>
                <span className="flex-shrink-0 mt-0.5">
                  {item.type === 'success' ? '✅' : item.type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <p className={`text-sm ${
                  item.type === 'success' ? 'text-green-700 dark:text-green-400' :
                  item.type === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                  'text-blue-700 dark:text-blue-400'
                }`}>{item.tip}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Security Reminder */}
        <section className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-6">
          <h2 className="text-xl font-bold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
            <span className="text-2xl">🔒</span> תזכורת אבטחה
          </h2>
          <div className="space-y-2 text-sm text-red-700 dark:text-red-400" dir="rtl">
            <p className="font-medium">חשוב! החלף את ה-GitHub Personal Access Token שלך (ghp_...)!</p>
            <p>אם שיתפת את הטוקן עם מישהו או שהוא נחשף, עבור ל-GitHub Settings → Developer Settings → Personal Access Tokens → מחק וצור חדש.</p>
            <p>כמו כן, אל תשתף את ה-ANTHROPIC_API_KEY שלך - כל שימוש בו יחויב לחשבון שלך.</p>
          </div>
        </section>

      </div>
    </div>
  )
}
