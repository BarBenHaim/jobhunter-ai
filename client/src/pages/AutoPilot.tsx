import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Play, Settings2, Clock, CheckCircle, XCircle,
  AlertTriangle, Loader2, Shield,
  Briefcase, FileText, TrendingUp, RefreshCw, CheckCheck,
  Activity, ToggleLeft, ToggleRight, MapPin, Plus, X,
} from 'lucide-react'
import { autopilotApi, AutoPilotConfig } from '@/services/autopilot.api'

// ─── Helpers ────────────────────────────────────────────
const fmtDate = (d: string) => new Date(d).toLocaleString('he-IL', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const fmtDuration = (s: number) => s >= 60 ? `${Math.floor(s / 60)}דק ${s % 60}שנ` : `${s}שנ`

const SEVERITY_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  SUCCESS: { bg: '#ecfdf5', text: '#057642', icon: CheckCircle },
  INFO: { bg: '#eaf2fb', text: '#1B65A7', icon: Activity },
  WARNING: { bg: '#fff7ed', text: '#b45309', icon: AlertTriangle },
  ERROR: { bg: '#fef2f2', text: '#b24020', icon: XCircle },
}

const SCHEDULE_OPTIONS = [
  { value: '0 * * * *', label: 'כל שעה' },
  { value: '0 */3 * * *', label: 'כל 3 שעות' },
  { value: '0 */6 * * *', label: 'כל 6 שעות' },
  { value: '0 */12 * * *', label: 'כל 12 שעות' },
  { value: '0 2 * * *', label: 'פעם ביום (02:00)' },
]

const SOURCES = [
  { id: 'INDEED', name: 'Indeed' }, { id: 'DRUSHIM', name: 'Drushim' },
  { id: 'ALLJOBS', name: 'AllJobs' }, { id: 'GOOGLE_JOBS', name: 'Google Jobs' },
  { id: 'COMPANY_CAREER_PAGE', name: 'Career Pages' }, { id: 'TOP_COMPANIES', name: 'Top Companies' },
]

// ─── Tab type ───────────────────────────────────────────
type Tab = 'status' | 'queue' | 'log' | 'settings'

const AutoPilot = () => {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('status')
  const [blacklistInput, setBlacklistInput] = useState('')

  // ─── Queries ───────────────────────────────────────
  const { data: status, isLoading } = useQuery({
    queryKey: ['autopilot-status'],
    queryFn: () => autopilotApi.getStatus(),
    refetchInterval: 10000,
  })

  const { data: queue } = useQuery({
    queryKey: ['autopilot-queue'],
    queryFn: () => autopilotApi.getQueue(),
    enabled: tab === 'queue' || (status?.pendingApprovals || 0) > 0,
    refetchInterval: 15000,
  })

  const { data: logData } = useQuery({
    queryKey: ['autopilot-log'],
    queryFn: () => autopilotApi.getLog(50),
    enabled: tab === 'log',
  })

  // ─── Mutations ─────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['autopilot-status'] })
    queryClient.invalidateQueries({ queryKey: ['autopilot-queue'] })
    queryClient.invalidateQueries({ queryKey: ['autopilot-log'] })
  }

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => autopilotApi.updateConfig({ enabled }),
    onSuccess: invalidateAll,
  })

  const startMutation = useMutation({
    mutationFn: () => autopilotApi.start(),
    onSuccess: invalidateAll,
  })

  const configMutation = useMutation({
    mutationFn: (updates: Partial<AutoPilotConfig>) => autopilotApi.updateConfig(updates),
    onSuccess: invalidateAll,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => autopilotApi.approveItem(id),
    onSuccess: invalidateAll,
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => autopilotApi.rejectItem(id),
    onSuccess: invalidateAll,
  })

  const approveAllMutation = useMutation({
    mutationFn: () => autopilotApi.approveAll(),
    onSuccess: invalidateAll,
  })

  const cfg = status?.config

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin h-8 w-8" style={{ color: 'var(--brand)' }} />
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-5xl mx-auto" dir="rtl">

      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-card flex items-center justify-center" style={{ background: cfg?.enabled ? '#ecfdf5' : 'var(--subtle)' }}>
            <Zap size={20} style={{ color: cfg?.enabled ? '#057642' : 'var(--ink-tertiary)' }} />
          </div>
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: 'var(--ink-primary)' }}>AutoPilot</h1>
            <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
              {cfg?.enabled
                ? status?.isRunning ? 'רץ כעת...' : `פעיל • ${cfg.mode === 'full-auto' ? 'אוטומטי מלא' : 'חצי-אוטומטי'}`
                : 'כבוי'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle */}
          <button
            onClick={() => toggleMutation.mutate(!cfg?.enabled)}
            disabled={toggleMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-pill text-[13px] font-semibold transition-colors"
            style={{
              background: cfg?.enabled ? '#ecfdf5' : 'var(--subtle)',
              color: cfg?.enabled ? '#057642' : 'var(--ink-secondary)',
              border: `1px solid ${cfg?.enabled ? '#a7f3d0' : 'var(--border)'}`,
            }}
          >
            {cfg?.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {cfg?.enabled ? 'פעיל' : 'כבוי'}
          </button>

          {/* Manual run */}
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || status?.isRunning}
            className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {startMutation.isPending || status?.isRunning
              ? <Loader2 size={14} className="animate-spin" />
              : <Play size={14} />}
            הרץ עכשיו
          </button>
        </div>
      </div>

      {/* ═══ Quick Stats ═══ */}
      {status?.todayStats && (status.todayStats.runs > 0 || (status.pendingApprovals || 0) > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'ריצות היום', value: status.todayStats.runs, icon: RefreshCw, color: 'var(--brand)' },
            { label: 'נמצאו', value: status.todayStats.discovered, icon: Briefcase, color: 'var(--brand)' },
            { label: 'CVs', value: status.todayStats.cvs, icon: FileText, color: '#6d28d9' },
            { label: 'הוגשו', value: status.todayStats.submitted, icon: TrendingUp, color: '#057642' },
            { label: 'ממתינים', value: status.pendingApprovals, icon: Clock, color: '#b45309' },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-card bg-white text-center" style={{ border: '1px solid var(--border)' }}>
              <s.icon size={14} style={{ color: s.color }} className="mx-auto mb-1" />
              <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{s.value}</p>
              <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Tabs ═══ */}
      <div className="flex gap-1 p-1 rounded-card" style={{ background: 'var(--subtle)' }}>
        {([
          { id: 'status' as Tab, label: 'סטטוס', icon: Activity },
          { id: 'queue' as Tab, label: `תור אישור${(status?.pendingApprovals || 0) > 0 ? ` (${status?.pendingApprovals})` : ''}`, icon: CheckCheck },
          { id: 'log' as Tab, label: 'יומן פעילות', icon: Clock },
          { id: 'settings' as Tab, label: 'הגדרות', icon: Settings2 },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-card text-[13px] font-medium transition-colors"
            style={{
              background: tab === t.id ? 'white' : 'transparent',
              color: tab === t.id ? 'var(--brand)' : 'var(--ink-secondary)',
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Tab Content ═══ */}
      <div className="rounded-card bg-white p-4" style={{ border: '1px solid var(--border)' }}>

        {/* ── STATUS TAB ── */}
        {tab === 'status' && (
          <div className="space-y-4">
            {/* Current state */}
            <div className="flex items-center gap-3 p-4 rounded-card" style={{ background: cfg?.enabled ? '#ecfdf5' : 'var(--subtle)' }}>
              <div className="relative">
                <div className="w-3 h-3 rounded-full" style={{ background: cfg?.enabled ? '#057642' : 'var(--ink-tertiary)' }} />
                {cfg?.enabled && <div className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-30" style={{ background: '#057642' }} />}
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {cfg?.enabled
                    ? status?.isRunning ? 'AutoPilot רץ כעת...' : 'AutoPilot פעיל'
                    : 'AutoPilot כבוי'}
                </p>
                <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                  {cfg?.enabled
                    ? `מצב: ${cfg.mode === 'full-auto' ? 'אוטומטי מלא' : 'חצי-אוטומטי'} • ציון מינימום: ${cfg.minScore}% • מגבלה: ${cfg.maxPerDay}/יום`
                    : 'הפעל את AutoPilot כדי למצוא משרות ולייצר CVs אוטומטית'}
                </p>
              </div>
              {status?.isRunning && <Loader2 size={20} className="animate-spin" style={{ color: '#057642' }} />}
            </div>

            {/* Last run */}
            {status?.lastRun && (
              <div>
                <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--ink-secondary)' }}>ריצה אחרונה</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-card" style={{ background: 'var(--subtle)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>זמן</p>
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-primary)' }}>{fmtDate(status.lastRun.startedAt)}</p>
                  </div>
                  <div className="p-3 rounded-card" style={{ background: 'var(--subtle)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>נמצאו</p>
                    <p className="text-[18px] font-bold" style={{ color: 'var(--ink-primary)' }}>{status.lastRun.jobsDiscovered}</p>
                  </div>
                  <div className="p-3 rounded-card" style={{ background: 'var(--subtle)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>מתאימות</p>
                    <p className="text-[18px] font-bold" style={{ color: '#057642' }}>{status.lastRun.jobsQualifying}</p>
                  </div>
                  <div className="p-3 rounded-card" style={{ background: 'var(--subtle)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>CVs / הוגשו</p>
                    <p className="text-[18px] font-bold" style={{ color: 'var(--brand)' }}>
                      {status.lastRun.cvsGenerated} / {status.lastRun.applicationsSubmitted + status.lastRun.applicationsQueued}
                    </p>
                  </div>
                </div>
                {status.lastRun.duration && (
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-tertiary)' }}>
                    משך: {fmtDuration(status.lastRun.duration)} • סטטוס: {status.lastRun.status}
                  </p>
                )}
              </div>
            )}

            {/* Getting started hint */}
            {!cfg?.enabled && !status?.lastRun && (
              <div className="text-center py-6">
                <Zap size={32} className="mx-auto mb-2" style={{ color: 'var(--ink-tertiary)' }} />
                <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>התחל עם AutoPilot</p>
                <p className="text-[12px] mt-1" style={{ color: 'var(--ink-secondary)' }}>
                  הפעל AutoPilot כדי שימצא לך משרות, ייצור CVs מותאמים, ויגיש אוטומטית (או עם אישור שלך)
                </p>
                <button
                  onClick={() => toggleMutation.mutate(true)}
                  className="mt-3 px-5 py-2 rounded-pill text-[13px] font-semibold text-white"
                  style={{ background: 'var(--brand)' }}
                >
                  הפעל AutoPilot
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── QUEUE TAB ── */}
        {tab === 'queue' && (
          <div className="space-y-3">
            {queue && queue.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                    {queue.length} הגשות ממתינות לאישור
                  </h3>
                  <button
                    onClick={() => approveAllMutation.mutate()}
                    disabled={approveAllMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-pill text-[12px] font-semibold text-white"
                    style={{ background: '#057642' }}
                  >
                    <CheckCheck size={12} />
                    אשר הכל
                  </button>
                </div>

                {queue.map(item => (
                  <div key={item.id} className="p-3 rounded-card" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-start gap-3">
                      {/* Score ring */}
                      <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{
                        background: item.score >= 70 ? '#ecfdf5' : item.score >= 50 ? '#fff7ed' : '#fef2f2',
                        border: `2px solid ${item.score >= 70 ? '#057642' : item.score >= 50 ? '#b45309' : '#b24020'}`,
                      }}>
                        <span className="text-[14px] font-bold" style={{
                          color: item.score >= 70 ? '#057642' : item.score >= 50 ? '#b45309' : '#b24020',
                        }}>{Math.round(item.score)}%</span>
                      </div>

                      {/* Job info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink-primary)' }}>{item.title}</p>
                        <p className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                          {item.company} • {item.location}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.matchedSkills.slice(0, 5).map(s => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#ecfdf5', color: '#057642' }}>{s}</span>
                          ))}
                          {item.missingSkills.slice(0, 3).map(s => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#fef2f2', color: '#b24020' }}>{s}</span>
                          ))}
                        </div>
                        {item.redFlags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle size={10} style={{ color: '#b24020' }} />
                            <span className="text-[10px]" style={{ color: '#b24020' }}>{item.redFlags.join(', ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => approveMutation.mutate(item.id)}
                          disabled={approveMutation.isPending}
                          className="p-2 rounded-card transition-colors"
                          style={{ background: '#ecfdf5', color: '#057642' }}
                          title="אשר"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(item.id)}
                          disabled={rejectMutation.isPending}
                          className="p-2 rounded-card transition-colors"
                          style={{ background: '#fef2f2', color: '#b24020' }}
                          title="דחה"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCheck size={32} className="mx-auto mb-2" style={{ color: 'var(--ink-tertiary)' }} />
                <p className="text-[14px]" style={{ color: 'var(--ink-secondary)' }}>אין הגשות ממתינות לאישור</p>
                <p className="text-[12px]" style={{ color: 'var(--ink-tertiary)' }}>כשAutoPilot ימצא משרות מתאימות, הן יופיעו כאן</p>
              </div>
            )}
          </div>
        )}

        {/* ── LOG TAB ── */}
        {tab === 'log' && (
          <div className="space-y-1">
            {logData?.logs && logData.logs.length > 0 ? (
              logData.logs.map(log => {
                const sev = SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.INFO
                const Icon = sev.icon
                return (
                  <div key={log.id} className="flex items-start gap-2.5 p-2.5 rounded-card" style={{ background: sev.bg }}>
                    <Icon size={14} style={{ color: sev.text }} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: sev.text }}>{log.message}</p>
                      <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>{fmtDate(log.createdAt)}</p>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--ink-tertiary)' }}>
                      {log.eventType}
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8">
                <Clock size={32} className="mx-auto mb-2" style={{ color: 'var(--ink-tertiary)' }} />
                <p className="text-[14px]" style={{ color: 'var(--ink-secondary)' }}>אין אירועים עדיין</p>
                <p className="text-[12px]" style={{ color: 'var(--ink-tertiary)' }}>הפעל AutoPilot כדי לראות את יומן הפעילות</p>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && cfg && (
          <div className="space-y-5">
            {/* Mode */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--ink-tertiary)' }}>מצב עבודה</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { mode: 'semi-auto' as const, title: 'חצי-אוטומטי', desc: 'מוצא משרות ומייצר CVs, מחכה לאישורך לפני הגשה', icon: Shield },
                  { mode: 'full-auto' as const, title: 'אוטומטי מלא', desc: 'מגיש אוטומטית למשרות עם ציון גבוה במיוחד', icon: Zap },
                ].map(m => (
                  <button
                    key={m.mode}
                    onClick={() => configMutation.mutate({ mode: m.mode })}
                    className="p-3 rounded-card text-right transition-all"
                    style={{
                      border: `2px solid ${cfg.mode === m.mode ? 'var(--brand)' : 'var(--border)'}`,
                      background: cfg.mode === m.mode ? 'var(--selected)' : 'white',
                    }}
                  >
                    <m.icon size={18} style={{ color: cfg.mode === m.mode ? 'var(--brand)' : 'var(--ink-tertiary)' }} className="mb-1.5" />
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-primary)' }}>{m.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-secondary)' }}>{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule + Scores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>תדירות ריצה</label>
                <select
                  value={cfg.schedule}
                  onChange={(e) => configMutation.mutate({ schedule: e.target.value })}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                >
                  {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>ציון מינימלי</label>
                <select
                  value={cfg.minScore}
                  onChange={(e) => configMutation.mutate({ minScore: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                >
                  {[40, 50, 60, 70, 80].map(v => <option key={v} value={v}>{v}% ומעלה</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>סף הגשה אוטומטית</label>
                <select
                  value={cfg.autoApplyThreshold}
                  onChange={(e) => configMutation.mutate({ autoApplyThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                  disabled={cfg.mode !== 'full-auto'}
                >
                  {[70, 75, 80, 85, 90].map(v => <option key={v} value={v}>{v}%+</option>)}
                </select>
              </div>
            </div>

            {/* Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>מגבלה יומית</label>
                <select
                  value={cfg.maxPerDay}
                  onChange={(e) => configMutation.mutate({ maxPerDay: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                >
                  {[5, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v} הגשות ליום</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>מגבלה לריצה</label>
                <select
                  value={cfg.maxPerRun}
                  onChange={(e) => configMutation.mutate({ maxPerRun: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                >
                  {[3, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v} לריצה</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>מיקום</label>
                <div className="relative">
                  <MapPin size={14} className="absolute right-3 top-2.5" style={{ color: 'var(--ink-tertiary)' }} />
                  <input
                    type="text"
                    value={cfg.location}
                    onChange={(e) => configMutation.mutate({ location: e.target.value })}
                    className="w-full pr-9 pl-3 py-2 rounded-card bg-white text-[13px]"
                    style={{ border: '1px solid var(--border)' }}
                  />
                </div>
              </div>
            </div>

            {/* Blacklist */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>
                רשימה שחורה (חברות לא להגיש אליהן)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={blacklistInput}
                  onChange={(e) => setBlacklistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && blacklistInput.trim()) {
                      configMutation.mutate({ blacklistedCompanies: [...cfg.blacklistedCompanies, blacklistInput.trim()] })
                      setBlacklistInput('')
                    }
                  }}
                  placeholder="הוסף שם חברה..."
                  className="flex-1 px-3 py-2 rounded-card bg-white text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                />
                <button
                  onClick={() => {
                    if (blacklistInput.trim()) {
                      configMutation.mutate({ blacklistedCompanies: [...cfg.blacklistedCompanies, blacklistInput.trim()] })
                      setBlacklistInput('')
                    }
                  }}
                  className="px-3 py-2 rounded-card"
                  style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}
                >
                  <Plus size={16} />
                </button>
              </div>
              {cfg.blacklistedCompanies.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cfg.blacklistedCompanies.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[12px]" style={{ background: '#fef2f2', color: '#b24020' }}>
                      {c}
                      <button onClick={() => configMutation.mutate({ blacklistedCompanies: cfg.blacklistedCompanies.filter(x => x !== c) })}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Sources */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--ink-tertiary)' }}>מקורות חיפוש (ריק = הכל)</label>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map(s => {
                  const isActive = cfg.sources.length === 0 || cfg.sources.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        const newSources = cfg.sources.includes(s.id)
                          ? cfg.sources.filter(x => x !== s.id)
                          : [...cfg.sources, s.id]
                        configMutation.mutate({ sources: newSources })
                      }}
                      className="px-3 py-1.5 rounded-pill text-[12px] font-medium transition-colors"
                      style={{
                        background: isActive ? 'var(--selected)' : 'white',
                        color: isActive ? 'var(--brand)' : 'var(--ink-tertiary)',
                        border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border)'}`,
                      }}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AutoPilot
