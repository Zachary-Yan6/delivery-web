import { useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import api from '../api/client'

const LOCATION_INTERVAL_MS = 10_000

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not available'
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || error.response?.data?.detail || fallback
}

function statusClass(status) {
  return `status-${status.toLowerCase().replace('_', '-')}`
}

function getGeolocationErrorMessage(error) {
  if (error.code === 1) {
    return 'Location permission was denied. Allow location access in your browser settings.'
  }

  if (error.code === 2) {
    return 'Your device location is currently unavailable.'
  }

  if (error.code === 3) {
    return 'Location request timed out. Please try again.'
  }

  return 'Could not read your device location.'
}

function getRouteReadiness(delivery) {
  if (['DELIVERED', 'FAILED'].includes(delivery.status)) {
    return {
      label: 'Completed',
      className: 'route-readiness-closed',
      description: 'Completed deliveries cannot be added to a new route.',
    }
  }

  if (
      delivery.destinationLatitude == null ||
      delivery.destinationLongitude == null
  ) {
    return {
      label: 'Pin required',
      className: 'route-readiness-missing',
      description: 'Set a destination pin before route planning.',
    }
  }

  return {
    label: 'Route ready',
    className: 'route-readiness-ready',
    description: 'This delivery can be added to a route.',
  }
}

export default function DriverDashboard() {

  const [deliveries, setDeliveries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)

  const [isTracking, setIsTracking] = useState(false)
  const [lastSentAt, setLastSentAt] = useState(null)
  const [trackingError, setTrackingError] = useState('')

  const trackingTimerRef = useRef(null)
  const trackingActiveRef = useRef(false)
  const locationRequestInFlightRef = useRef(false)

  async function loadDeliveries() {
    try {
      const response = await api.get('/driver/deliveries')
      setDeliveries(response.data)
      setError('')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load your deliveries.'))
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(deliveryId, action) {
    setUpdatingId(deliveryId)

    try {
      await api.patch(`/driver/deliveries/${deliveryId}/${action}`)
      await loadDeliveries()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not update the delivery.'))
    } finally {
      setUpdatingId(null)
    }
  }

  async function postLocation(position) {
    if (!trackingActiveRef.current) {
      return
    }

    locationRequestInFlightRef.current = true

    try {
      await api.post('/driver/locations', {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        recordedAt: new Date(position.timestamp).toISOString(),
      })

      setLastSentAt(new Date())
      setTrackingError('')
    } catch (requestError) {
      setTrackingError(
          getErrorMessage(requestError, 'Could not send your location.')
      )
    } finally {
      locationRequestInFlightRef.current = false
    }
  }

  function requestCurrentLocation() {
    if (
        !trackingActiveRef.current ||
        locationRequestInFlightRef.current
    ) {
      return
    }

    navigator.geolocation.getCurrentPosition(
        postLocation,
        (geolocationError) => {
          setTrackingError(getGeolocationErrorMessage(geolocationError))

          if (geolocationError.code === 1) {
            stopTracking()
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 9_000,
          maximumAge: 0,
        }
    )
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setTrackingError('Your browser does not support location sharing.')
      return
    }

    trackingActiveRef.current = true
    setIsTracking(true)
    setTrackingError('')

    requestCurrentLocation()

    trackingTimerRef.current = setInterval(
        requestCurrentLocation,
        LOCATION_INTERVAL_MS
    )
  }

  function stopTracking() {
    trackingActiveRef.current = false
    setIsTracking(false)

    if (trackingTimerRef.current) {
      clearInterval(trackingTimerRef.current)
      trackingTimerRef.current = null
    }
  }

  useEffect(() => {
    loadDeliveries()

    return () => {
      if (trackingTimerRef.current) {
        clearInterval(trackingTimerRef.current)
      }
    }
  }, [])

  const activeDeliveries = deliveries.filter((delivery) =>
      ['ASSIGNED', 'IN_TRANSIT'].includes(delivery.status)
  ).length

  const completedDeliveries = deliveries.filter(
      (delivery) => delivery.status === 'DELIVERED'
  ).length

  function actionButtons(delivery) {
    const busy = updatingId === delivery.id

    if (delivery.status === 'ASSIGNED') {
      return (
          <button
              className="btn btn-primary btn-small"
              disabled={busy}
              onClick={() => changeStatus(delivery.id, 'start')}
          >
            {busy ? 'Updating...' : 'Start delivery'}
          </button>
      )
    }

    if (delivery.status === 'IN_TRANSIT') {
      return (
          <>
            <button
                className="btn btn-primary btn-small"
                disabled={busy}
                onClick={() => changeStatus(delivery.id, 'deliver')}
            >
              Mark delivered
            </button>

            <button
                className="btn btn-danger btn-small"
                disabled={busy}
                onClick={() => changeStatus(delivery.id, 'fail')}
                style={{ marginLeft: '6px' }}
            >
              Mark failed
            </button>
          </>
      )
    }

    return <span className="muted">No action needed</span>
  }

  return (
      <AppShell
          role="driver"
          title="My deliveries"
          subtitle="Keep customers informed by updating each delivery as you go."
          actions={
            <button className="btn btn-secondary" onClick={loadDeliveries}>
              Refresh
            </button>
          }
      >
        <section className="tracking-panel">
          <div>
            <p className="eyebrow">Live location</p>
            <h2>
              {isTracking
                  ? 'Location sharing is active'
                  : 'Location sharing is off'}
            </h2>
            <p>
              {isTracking
                  ? 'Your current location is sent every 10 seconds while this page remains open.'
                  : 'Start sharing when you begin your delivery shift.'}
            </p>

            {lastSentAt && (
                <small>Last location sent: {lastSentAt.toLocaleTimeString()}</small>
            )}
          </div>

          <button
              className={isTracking ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={isTracking ? stopTracking : startTracking}
          >
            {isTracking ? 'Stop sharing' : 'Start sharing'}
          </button>
        </section>

        {trackingError && (
            <p className="alert alert-error">{trackingError}</p>
        )}

        <section className="overview-grid">
          <article className="metric-card accent">
            <p>Assigned to me</p>
            <strong>{deliveries.length}</strong>
          </article>
          <article className="metric-card">
            <p>Active now</p>
            <strong>{activeDeliveries}</strong>
          </article>
          <article className="metric-card">
            <p>Completed</p>
            <strong>{completedDeliveries}</strong>
          </article>
        </section>

        <section className="table-card">
          <div className="table-card-header">
            <div>
              <h2>Delivery queue</h2>
              <p>Use the action button when the delivery state changes.</p>
            </div>
          </div>

          {error && <p className="alert alert-error">{error}</p>}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
              <tr>
                <th>Delivery</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Address</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
              </thead>

              <tbody>
              {loading && (
                  <tr className="empty-row">
                    <td colSpan="7">Loading your deliveries...</td>
                  </tr>
              )}

              {!loading &&
                  deliveries.map((delivery) => {
                      const routeReadiness = getRouteReadiness(delivery)

                      return (
                          <tr key={delivery.id}>
                              <td className="primary-cell">#{delivery.id}</td>

                              <td>{delivery.customerName}</td>

                              <td>
                                  {delivery.customerPhone || (
                                      <span className="muted">Not provided</span>
                                  )}
                              </td>

                              <td>{delivery.address}</td>

                              <td>
                                  <div className="delivery-status-cell">
                                    <span className={`status-pill ${statusClass(delivery.status)}`}>
                                      {delivery.status.replace('_', ' ')}
                                    </span>

                                      <span
                                          className={`route-readiness ${routeReadiness.className}`}
                                          title={routeReadiness.description}
                                      >
                                      Route: {routeReadiness.label}
                                    </span>
                                  </div>
                              </td>

                              <td>{formatDate(delivery.createdAt)}</td>

                              <td>{actionButtons(delivery)}</td>
                          </tr>
                      )
                  })}

              {!loading && deliveries.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan="7">
                      You have no assigned deliveries right now.
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </section>

      </AppShell>
  )
}