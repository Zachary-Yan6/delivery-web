import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import api from '../api/client'
import DeliveryLocationPicker from '../components/DeliveryLocationPicker'
function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not completed'
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || error.response?.data?.detail || fallback
}

function statusClass(status) {
  return `status-${status.toLowerCase().replace('_', '-')}`
}

const ETA_REFRESH_INTERVAL_MS = 30_000

function formatDuration(seconds) {
  if (seconds == null) return 'Unknown'

  const totalMinutes = Math.ceil(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return hours > 0
      ? `${hours}h ${minutes}m`
      : `${minutes} min`
}

function formatDistance(meters) {
  if (meters == null) return 'Unknown'

  return meters >= 1_000
      ? `${(meters / 1_000).toFixed(1)} km`
      : `${Math.round(meters)} m`
}
export default function DeliveryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [delivery, setDelivery] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ customerName: '', customerPhone: '', address: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [destination, setDestination] = useState(null)
  const [eta, setEta] = useState(null)
  const [etaError, setEtaError] = useState('')

  async function loadData() {
    setLoading(true)
    try {
      const [deliveryResponse, driversResponse] = await Promise.all([
        api.get(`/deliveries/${id}`),
        api.get('/drivers'),
      ])
      const loadedDelivery = deliveryResponse.data
      setDelivery(loadedDelivery)
      setDrivers(driversResponse.data)
      setSelectedDriverId(loadedDelivery.driverId ? String(loadedDelivery.driverId) : '')
      setForm({
        customerName: loadedDelivery.customerName || '',
        customerPhone: loadedDelivery.customerPhone || '',
        address: loadedDelivery.address || '',
      })
      setError('')
      setDestination(
          loadedDelivery.destinationLatitude != null &&
          loadedDelivery.destinationLongitude != null
              ? {
                latitude: Number(loadedDelivery.destinationLatitude),
                longitude: Number(loadedDelivery.destinationLongitude),
              }
              : null,
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load this delivery.'))
    } finally {
      setLoading(false)
    }
  }

  async function assignDriver() {
    if (!selectedDriverId) {
      setError('Please select a driver.')
      return
    }

    try {
      await api.post(`/deliveries/${id}/assignment`, { driverId: Number(selectedDriverId) })
      await loadData()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not assign the driver.'))
    }
  }

  async function updateDelivery(event) {
    event.preventDefault()
    try {
      await api.post(`/deliveries/${id}`, {
        ...form,
        destinationLatitude: destination?.latitude,
        destinationLongitude: destination?.longitude,
      })
      setEditing(false)
      await loadData()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not update the delivery.'))
    }
  }

  async function deleteDelivery() {
    if (!window.confirm('Delete this delivery?')) return

    try {
      await api.delete(`/deliveries/${id}`)
      navigate('/dispatcher')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not delete the delivery.'))
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  useEffect(() => {
    const etaIsRelevant =
        delivery &&
        ['ASSIGNED', 'IN_TRANSIT'].includes(delivery.status)

    if (!etaIsRelevant) {
      setEta(null)
      setEtaError('')
      return undefined
    }

    let cancelled = false

    async function refreshEta() {
      try {
        const response = await api.get(
            `/dispatcher/deliveries/${delivery.id}/eta`,
        )

        if (!cancelled) {
          setEta(response.data)
          setEtaError('')
        }
      } catch (requestError) {
        if (!cancelled) {
          setEta(null)
          setEtaError(
              getErrorMessage(
                  requestError,
                  'ETA is currently unavailable.',
              ),
          )
        }
      }
    }

    refreshEta()

    const intervalId = window.setInterval(
        refreshEta,
        ETA_REFRESH_INTERVAL_MS,
    )

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [delivery?.id, delivery?.status])

  if (loading) {
    return <AppShell role="dispatcher" title="Delivery details"><div className="page-loader">Loading delivery details...</div></AppShell>
  }

  if (!delivery) {
    return <AppShell role="dispatcher" title="Delivery details"><p className="alert alert-error">{error}</p></AppShell>
  }

  const activeDrivers = drivers.filter((driver) => driver.active)
  const assignedDriver = drivers.find((driver) => driver.id === delivery.driverId)
  const inTransitOrComplete = ['IN_TRANSIT', 'DELIVERED', 'FAILED'].includes(delivery.status)

  return (
    <AppShell
      role="dispatcher"
      title={`Delivery #${delivery.id}`}
      subtitle="Review customer information, assignment, and the live delivery state."
      actions={
        <>
          {!editing && <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
          <button className="btn btn-danger" onClick={deleteDelivery}>Delete</button>
        </>
      }
    >
      <div className="two-column">
        <section className="panel">
          <h2>{editing ? 'Edit customer information' : 'Delivery details'}</h2>

          {!editing ? (
            <div className="detail-grid">
              <div className="detail-item"><span className="detail-label">Customer</span><span className="detail-value">{delivery.customerName}</span></div>
              <div className="detail-item"><span className="detail-label">Phone</span><span className="detail-value">{delivery.customerPhone || 'Not provided'}</span></div>
              <div className="detail-item full"><span className="detail-label">Delivery address</span><span className="detail-value">{delivery.address}</span></div>
              <div className="detail-item"><span className="detail-label">Current status</span><span className="detail-value"><span className={`status-pill ${statusClass(delivery.status)}`}>{delivery.status.replace('_', ' ')}</span></span></div>
              <div className="detail-item"><span className="detail-label">Assigned driver</span><span className="detail-value">{assignedDriver?.fullName || 'Not assigned'}</span></div>
              <div className="detail-item"><span className="detail-label">Created</span><span className="detail-value">{formatDate(delivery.createdAt)}</span></div>
              <div className="detail-item"><span className="detail-label">Delivered</span><span className="detail-value">{formatDate(delivery.deliveredAt)}</span></div>
            </div>
          ) : (
            <form onSubmit={updateDelivery} className="form-grid">
              <label className="form-field">
                Customer name
                <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
              </label>
              <label className="form-field">
                Customer phone
                <input value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
              </label>
              <label className="form-field full">
                Delivery address
                <textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required rows="5" />
              </label>
              <DeliveryLocationPicker
                  destination={destination}
                  onChange={setDestination}
              />
              <div className="form-actions form-field full">
                <button className="btn btn-primary" type="submit">Save changes</button>
                <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </form>
          )}
        </section>

        <aside>
          <section className="panel assignment-card">
            <h2>Driver assignment</h2>
            <p className="panel-intro">Assign an active driver while this delivery is still being created.</p>
            <div className="assignment-row">
              <select value={selectedDriverId} onChange={(event) => setSelectedDriverId(event.target.value)} disabled={delivery.status !== 'CREATED'}>
                <option value="">Select an active driver</option>
                {activeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName} - {driver.phone}</option>)}
              </select>
              <button className="btn btn-primary" onClick={assignDriver} disabled={delivery.status !== 'CREATED'}>Assign</button>
            </div>
            {delivery.status !== 'CREATED' && <p className="panel-intro">This delivery has already been assigned and cannot be reassigned.</p>}
          </section>

          {['ASSIGNED', 'IN_TRANSIT'].includes(delivery.status) && (
              <section className="panel eta-card">
                <div className="eta-card-header">
                  <div>
                    <p className="eyebrow">Live estimate</p>
                    <h2>Estimated arrival</h2>
                  </div>

                  {eta && (
                      <span className="eta-refresh-label">
          Updates every 30 sec
        </span>
                  )}
                </div>

                {eta ? (
                    <>
                      <strong className="eta-primary-value">
                        {formatDuration(eta.durationSeconds)}
                      </strong>

                      <p className="eta-arrival-time">
                        Estimated arrival:{' '}
                        {formatDate(eta.estimatedArrivalAt)}
                      </p>

                      <div className="eta-details">
          <span>
            Road distance
            <strong>{formatDistance(eta.distanceMeters)}</strong>
          </span>

                        <span>
            Fixed speed
            <strong>{eta.fixedSpeedKph} km/h</strong>
          </span>
                      </div>
                    </>
                ) : (
                    <p className="eta-unavailable">
                      {etaError ||
                          'ETA will appear after the assigned driver shares a location.'}
                    </p>
                )}
              </section>
          )}

          <section className="panel">
            <h2>Workflow</h2>
            <div className="workflow">
              <div className="workflow-step done"><span className="workflow-dot" />Created</div>
              <div className={delivery.status !== 'CREATED' ? 'workflow-step done' : 'workflow-step'}><span className="workflow-dot" />Assigned</div>
              <div className={inTransitOrComplete ? 'workflow-step done' : 'workflow-step'}><span className="workflow-dot" />In transit</div>
              <div className={delivery.status === 'DELIVERED' ? 'workflow-step done' : 'workflow-step'}><span className="workflow-dot" />Delivered</div>
              <div className={delivery.status === 'FAILED' ? 'workflow-step done' : 'workflow-step'}><span className="workflow-dot" />Failed</div>
            </div>
          </section>
        </aside>
      </div>

      {error && <p className="alert alert-error">{error}</p>}
    </AppShell>
  )
}
