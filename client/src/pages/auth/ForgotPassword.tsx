import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
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

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.forgotPassword(email)
      setSent(true)
      if (res.devToken) setDevToken(res.devToken)
    } catch (err) {
      setError(extractErrorMessage(err, 'הבקשה נכשלה. נסה שוב.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="איפוס סיסמה"
      subtitle="נשלח לך קישור לאיפוס הסיסמה"
      footer={
        <Link to="/auth/login" className="text-[14px] font-semibold" style={{ color: 'var(--brand)' }}>
          ← חזרה לכניסה
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}
        {sent && (
          <div className={authSuccessCls}>
            אם קיים חשבון עם האימייל הזה, קישור איפוס נשלח.
            {devToken && (
              <div className="mt-2 text-[12px] break-all" dir="ltr">
                <strong>Dev token:</strong> {devToken}
              </div>
            )}
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
            disabled={sent}
            className={authInputCls}
            style={authInputStyle}
          />
        </div>

        <button type="submit" disabled={loading || sent} className={authButtonCls}>
          {loading ? 'שולח…' : sent ? 'קישור נשלח' : 'שליחת קישור איפוס'}
        </button>
      </form>
    </AuthLayout>
  )
}
