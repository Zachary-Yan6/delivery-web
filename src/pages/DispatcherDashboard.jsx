import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import api from '../api/client'

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not completed'
}

function statusClass(status) {
  return `status-${status.toLowerCase().replace('_', '-')}`
}

export default function DispatcherDashboard() {
  const [deliveries, setDeliveries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  async function loadDeliveries() {
    try {
      const response = await api.get('/deliveries')
      setDeliveries(response.data)
      setError('')
    } catch {
      setError('Could not load deliveries. Please refresh or sign in again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDeliveries()
    const refreshTimer = setInterval(loadDeliveries, 10000)
    return () => clearInterval(refreshTimer)
  }, [])

  const activeCount = deliveries.filter((delivery) => ['ASSIGNED', 'IN_TRANSIT'].includes(delivery.status)).length
  const deliveredCount = deliveries.filter((delivery) => delivery.status === 'DELIVERED').length
  const attentionCount = deliveries.filter((delivery) => ['CREATED', 'FAILED'].includes(delivery.status)).length

  return (
    <AppShell
      role="dispatcher"
      title="Delivery overview"
      subtitle="A live view of deliveries across your operation."
      actions={
        <>
          <button className="btn btn-secondary" onClick={() => navigate('/dispatcher/drivers')}>Manage drivers</button>
          <button className="btn btn-primary" onClick={() => navigate('/dispatcher/deliveries/new')}>New delivery</button>
        </>
      }
    >
      <section className="overview-grid" aria-label="Delivery summary">
        <article className="metric-card accent"><p>Total deliveries</p><strong>{deliveries.length}</strong></article>
        <article className="metric-card"><p>On the road</p><strong>{activeCount}</strong></article>
        <article className="metric-card"><p>Delivered</p><strong>{deliveredCount}</strong></article>
        <article className="metric-card"><p>Needs attention</p><strong>{attentionCount}</strong></article>
      </section>

      <section className="table-card">
        <div className="table-card-header">
          <div>
            <h2>All deliveries</h2>
            <p>Updates automatically every 10 seconds.</p>
          </div>
          <button className="btn btn-secondary btn-small" onClick={loadDeliveries}>Refresh</button>
        </div>

        {error && <p className="alert alert-error">{error}</p>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Delivery</th><th>Customer</th><th>Address</th><th>Driver</th><th>Status</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {loading && <tr className="empty-row"><td colSpan="7">Loading deliveries...</td></tr>}
              {!loading && deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="primary-cell">#{delivery.id}</td>
                  <td>{delivery.customerName}</td>
                  <td>{delivery.address}</td>
                  <td>{delivery.driverId ? `Driver #${delivery.driverId}` : <span className="muted">Unassigned</span>}</td>
                  <td><span className={`status-pill ${statusClass(delivery.status)}`}>{delivery.status.replace('_', ' ')}</span></td>
                  <td>{formatDate(delivery.createdAt)}</td>
                  <td><button className="btn btn-secondary btn-small" onClick={() => navigate(`/dispatcher/deliveries/${delivery.id}`)}>View</button></td>
                </tr>
              ))}
              {!loading && deliveries.length === 0 && <tr className="empty-row"><td colSpan="7">No deliveries yet. Create your first delivery to begin.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}
