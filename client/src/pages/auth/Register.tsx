import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

export default function Register() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות')
      return
    }
    if (password.length < 8) {
      setError('סיסמה חייבת להכיל לפחות 8 תווים')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register(email, password, fullName)
      setAuthToken(res.accessToken, res.refreshToken)
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, 'הרשמה נכשלה. נסה שוב.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="הצטרפות ל-JobHunter"
      subtitle="חיפוש העבודה החכם שלך מתחיל כאן"
      footer={
        <span className="text-[14px]" style={{ color: 'var(--ink-secondary)' }}>
          כבר יש לך חשבון?{' '}
          <Link to="/auth/login" className="font-semibold" style={{ color: 'var(--brand)' }}>
            כניסה
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}

        <div>
          <label className={authLabelCls} htmlFor="fullName">
            שם מלא
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

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
            minLength={8}
            autoComplete="new-password"
            className={authInputCls}
            style={authInputStyle}
          />
          <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-tertiary)' }}>
            לפחות 8 תווים, כולל אות וספרה
          </p>
        </div>

        <div>
          <label className={authLabelCls} htmlFor="confirmPassword">
            אימות סיסמה
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <p className="text-[12px]" style={{ color: 'var(--ink-tertiary)' }}>
          בלחיצה על "הצטרפות" אני מאשר/ת את{' '}
          <a href="#" className="font-semibold" style={{ color: 'var(--brand)' }}>
            תנאי השימוש
          </a>{' '}
          ואת{' '}
          <a href="#" className="font-semibold" style={{ color: 'var(--brand)' }}>
            מדיניות הפרטיות
          </a>
          .
        </p>

        <button type="submit" disabled={loading} className={authButtonCls}>
          {loading ? 'יוצר חשבון…' : 'הצטרפות'}
        </button>
      </form>
    </AuthLayout>
  )
}
