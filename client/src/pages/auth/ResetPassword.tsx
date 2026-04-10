import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/services/auth.api'
import {
  AuthLayout,
  authButtonCls,
  authErrorCls,
  authInputCls,
  authInputStyle,
  authLabelCls,
  authSuccessCls,
  extractErrorMessage,
} from './AuthLayout'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [token, setToken] = useState(params.get('token') || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setEmail(params.get('email') || '')
    setToken(params.get('token') || '')
  }, [params])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }
    if (newPassword.length < 8) {
      setError('סיסמה חייבת להכיל לפחות 8 תווים')
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword(email, token, newPassword)
      setDone(true)
      setTimeout(() => navigate('/auth/login', { replace: true }), 2000)
    } catch (err) {
      setError(extractErrorMessage(err, 'איפוס הסיסמה נכשל'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="בחירת סיסמה חדשה"
      subtitle="הזן את הטוקן מהאימייל והגדר סיסמה חדשה"
      footer={
        <Link to="/auth/login" className="text-[14px] font-semibold" style={{ color: 'var(--brand)' }}>
          ← חזרה לכניסה
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}
        {done && (
          <div className={authSuccessCls}>
            הסיסמה אופסה בהצלחה. מעביר אותך לדף הכניסה…
          </div>
        )}

        <div>
          <label className={authLabelCls} htmlFor="email">
            אימייל
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <div>
          <label className={authLabelCls} htmlFor="token">
            טוקן איפוס (מהאימייל)
          </label>
          <input
            id="token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <div>
          <label className={authLabelCls} htmlFor="newPassword">
            סיסמה חדשה
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <div>
          <label className={authLabelCls} htmlFor="confirm">
            אימות סיסמה
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <button type="submit" disabled={loading || done} className={authButtonCls}>
          {loading ? 'מאפס…' : 'איפוס סיסמה'}
        </button>
      </form>
    </AuthLayout>
  )
}
