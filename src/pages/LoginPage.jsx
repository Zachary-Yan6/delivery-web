import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

function getErrorMessage(error) {
  return (
      error.response?.data?.message ||
      error.response?.data?.detail ||
      'Login failed. Check your username and password.'
  )
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/login', { username, password })
      const { token, ...user } = response.data

      sessionStorage.setItem('access_token', token)
      sessionStorage.setItem('current_user', JSON.stringify(user))

      navigate(user.role === 'DRIVER' ? '/driver' : '/dispatcher')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
      <main className="login-page">
        <section className="login-branding">
          <div className="login-content">
            <div className="login-brand">
              <span className="brand-mark">DF</span>
              <span>DeliveryFlow</span>
            </div>

            <div className="login-copy">
              <p>Delivery operations</p>
              <h1>Every delivery, clearly in motion.</h1>
              <p className="login-description">
                Keep dispatchers and drivers aligned from assignment to completion.
              </p>

              <div className="login-flow">
                <span>Create</span>
                <span>Assign</span>
                <span>Deliver</span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-form-area">
          <div className="login-card">
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to your workspace</h2>
            <p>Use your dispatcher or driver account to continue.</p>

            <form onSubmit={handleSubmit} className="form-grid">
              <label className="form-field full">
                Username
                <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Enter your username"
                    required
                />
              </label>

              <label className="form-field full">
                Password
                <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                />
              </label>

              <div className="form-field full">
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>

            {error && <p className="alert alert-error">{error}</p>}
            <p className="login-note">
              Your access is based on your assigned role.
            </p>
          </div>
        </section>
      </main>
  )
}