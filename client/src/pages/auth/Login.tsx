import { useState, FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authApi } from '@/services/auth.api'
import { setAuthToken } from '@/services/api'
import {
  AuthLayout,
  authButtonCls,
  authErrorCls,
  authInputCls,
  authInputStyle,
  authLabelCls,
  extractErrorMessage,
} from './AuthLayout'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const redirectTo = (location.state as any)?.from || '/'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      setAuthToken(res.accessToken, res.refreshToken)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, 'כניסה נכשלה. בדוק את פרטי ההתחברות.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="כניסה לחשבון"
      subtitle="שמחים שחזרת"
      footer={
        <span className="text-[14px]" style={{ color: 'var(--ink-secondary)' }}>
          חדש ב-JobHunter?{' '}
          <Link to="/auth/register" className="font-semibold" style={{ color: 'var(--brand)' }}>
            הצטרפות
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}

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
            autoComplete="email"
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <div>
          <label className={authLabelCls} htmlFor="password">
            סיסמה
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <div>
          <Link
            to="/auth/forgot-password"
            className="text-[14px] font-semibold"
            style={{ color: 'var(--brand)' }}
          >
            שכחתי סיסמה
          </Link>
        </div>

        <button type="submit" disabled={loading} className={authButtonCls}>
          {loading ? 'מתחבר…' : 'כניסה'}
        </button>
      </form>
    </AuthLayout>
  )
}
