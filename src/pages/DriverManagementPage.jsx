import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import api from '../api/client'

const emptyForm = { username: '', password: '', fullName: '', phone: '' }

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not available'
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || error.response?.data?.detail || fallback
}

export default function DriverManagementPage() {
  const navigate = useNavigate()
  const [drivers, setDrivers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ fullName: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadDrivers() {
    try {
      const response = await api.get('/drivers')
      setDrivers(response.data)
      setError('')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load drivers.'))
    }
  }

  async function createDriver(event) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.post('/drivers', form)
      setForm(emptyForm)
      await loadDrivers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not create the driver.'))
    } finally {
      setLoading(false)
    }
  }

  function startEditing(driver) {
    setEditingId(driver.id)
    setEditForm({ fullName: driver.fullName, phone: driver.phone })
  }

  async function saveDriver(driverId) {
    try {
      await api.put(`/drivers/${driverId}`, editForm)
      setEditingId(null)
      await loadDrivers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not update the driver.'))
    }
  }

  async function activateDriver(driverId) {
    try {
      await api.patch(`/drivers/${driverId}/activate`)
      await loadDrivers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not activate the driver.'))
    }
  }

  async function deactivateDriver(driverId) {
    if (!window.confirm('Deactivate this driver?')) return

    try {
      await api.delete(`/drivers/${driverId}`)
      await loadDrivers()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not deactivate the driver.'))
    }
  }

  useEffect(() => {
    loadDrivers()
  }, [])

  const activeDrivers = drivers.filter((driver) => driver.active).length

  return (
    <AppShell
      role="dispatcher"
      title="Driver management"
      subtitle="Create driver accounts and keep your available delivery team up to date."
      actions={<button className="btn btn-secondary" onClick={() => navigate('/dispatcher')}>Back to overview</button>}
    >
      <section className="overview-grid">
        <article className="metric-card accent"><p>All drivers</p><strong>{drivers.length}</strong></article>
        <article className="metric-card"><p>Available now</p><strong>{activeDrivers}</strong></article>
      </section>

      <section className="panel">
        <h2>Add a driver</h2>
        <p className="panel-intro">The username and password are used by this driver to sign in.</p>
        <form onSubmit={createDriver} className="form-grid">
          <label className="form-field">
            Username
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="e.g. driver_olivia" required />
          </label>
          <label className="form-field">
            Temporary password
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" minLength="8" required />
          </label>
          <label className="form-field">
            Full name
            <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="e.g. Olivia Chen" required />
          </label>
          <label className="form-field">
            Phone number
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="e.g. +44 7700 900000" required />
          </label>
          <div className="form-actions form-field full">
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create driver'}</button>
          </div>
        </form>
      </section>

      <section className="table-card">
        <div className="table-card-header">
          <div><h2>Your driver team</h2><p>Deactivate drivers only after their active deliveries are completed.</p></div>
          <button className="btn btn-secondary btn-small" onClick={loadDrivers}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Driver</th><th>Phone</th><th>Status</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id}>
                  {editingId === driver.id ? (
                    <>
                      <td><input className="inline-input" value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} aria-label="Driver name" /></td>
                      <td><input className="inline-input" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} aria-label="Driver phone" /></td>
                    </>
                  ) : (
                    <><td className="primary-cell">{driver.fullName}</td><td>{driver.phone}</td></>
                  )}
                  <td><span className={driver.active ? 'status-pill status-delivered' : 'status-pill status-failed'}>{driver.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                  <td>{formatDate(driver.createdAt)}</td>
                  <td>
                    {editingId === driver.id ? (
                      <><button className="btn btn-primary btn-small" onClick={() => saveDriver(driver.id)}>Save</button><button className="btn btn-secondary btn-small" onClick={() => setEditingId(null)} style={{ marginLeft: '6px' }}>Cancel</button></>
                    ) : (
                      <>
                        <button className="btn btn-secondary btn-small" onClick={() => startEditing(driver)}>Edit</button>
                        {driver.active ? <button className="btn btn-danger btn-small" onClick={() => deactivateDriver(driver.id)} style={{ marginLeft: '6px' }}>Deactivate</button> : <button className="btn btn-primary btn-small" onClick={() => activateDriver(driver.id)} style={{ marginLeft: '6px' }}>Activate</button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && <tr className="empty-row"><td colSpan="5">No drivers yet. Add your first driver above.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {error && <p className="alert alert-error">{error}</p>}
    </AppShell>
  )
}
