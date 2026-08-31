import { useEffect, useMemo, useState } from 'react'
import {
    CircleMarker,
    MapContainer,
    Polyline,
    Popup,
    TileLayer,
    useMap,
} from 'react-leaflet'
import AppShell from '../components/AppShell'
import api from '../api/client'

const COMPLETED_STATUSES = ['DELIVERED', 'FAILED']
const LOCATION_STALE_AFTER_MS = 60_000

function formatDistance(meters) {
    if (meters == null) return '—'

    return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds) {
    if (seconds == null) return '—'

    const totalMinutes = Math.round(seconds / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`
}

function getErrorMessage(error, fallback) {
    const data = error.response?.data

    if (typeof data === 'string') return data

    return data?.message || data?.detail || fallback
}

function statusClass(status) {
    return `status-${status.toLowerCase().replace('_', '-')}`
}

function getLocationTime(location) {
    return location?.receivedAt || location?.recordedAt
}

function isLocationStale(location) {
    const timestamp = getLocationTime(location)

    if (!timestamp) return true

    const age = Date.now() - new Date(timestamp).getTime()

    return Number.isNaN(age) || age > LOCATION_STALE_AFTER_MS
}

function formatLocationAge(location) {
    const timestamp = getLocationTime(location)

    if (!timestamp) return 'Unknown'

    const ageInSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
    )

    if (ageInSeconds < 60) {
        return `${ageInSeconds}s ago`
    }

    return `${Math.floor(ageInSeconds / 60)} min ago`
}

function FitRouteBounds({ points }) {
    const map = useMap()

    useEffect(() => {
        if (points.length === 1) {
            map.setView(points[0], 14)
            return
        }

        if (points.length > 1) {
            map.fitBounds(points, {
                padding: [40, 40],
                maxZoom: 14,
            })
        }
    }, [map, points])

    return null
}

export default function RoutePlanningPage() {
    const [deliveries, setDeliveries] = useState([])
    const [drivers, setDrivers] = useState([])
    const [driverLocations, setDriverLocations] = useState([])
    const [selectedDriverId, setSelectedDriverId] = useState('')
    const [selectedIds, setSelectedIds] = useState([])
    const [route, setRoute] = useState(null)
    const [loading, setLoading] = useState(true)
    const [planning, setPlanning] = useState(false)
    const [error, setError] = useState('')
    const [draggedId, setDraggedId] = useState(null)
    const [dragOverId, setDragOverId] = useState(null)

    async function loadPlannerData() {
        setLoading(true)

        try {
            const [deliveryResponse, driverResponse, locationResponse] =
                await Promise.all([
                    api.get('/deliveries'),
                    api.get('/drivers'),
                    api.get('/dispatcher/driver-locations'),
                ])

            setDeliveries(deliveryResponse.data)
            setDrivers(driverResponse.data)
            setDriverLocations(locationResponse.data)
            setError('')
        } catch (requestError) {
            setError(
                getErrorMessage(requestError, 'Could not load route-planning data.'),
            )
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadPlannerData()
    }, [])

    useEffect(() => {
        const intervalId = window.setInterval(async () => {
            try {
                const response = await api.get('/dispatcher/driver-locations')
                setDriverLocations(response.data)
            } catch {
                // Keep the last known location visible if refresh fails.
            }
        }, 10_000)

        return () => window.clearInterval(intervalId)
    }, [])

    const eligibleDeliveries = useMemo(
        () =>
            deliveries.filter(
                (delivery) =>
                    delivery.destinationLatitude != null &&
                    delivery.destinationLongitude != null &&
                    !COMPLETED_STATUSES.includes(delivery.status),
            ),
        [deliveries],
    )

    const selectedDeliveries = selectedIds
        .map((id) =>
            eligibleDeliveries.find((delivery) => delivery.id === id),
        )
        .filter(Boolean)

    const activeDrivers = useMemo(
        () => drivers.filter((driver) => driver.active),
        [drivers],
    )

    const selectedDriver = activeDrivers.find(
        (driver) => driver.id === Number(selectedDriverId),
    )

    const selectedDriverLocation = driverLocations.find(
        (location) => location.driverId === Number(selectedDriverId),
    )

    const isSelectedDriverLocationStale = isLocationStale(
        selectedDriverLocation,
    )

    const routeOrigin = route?.origin || selectedDriverLocation

    const mapPoints = useMemo(() => {
        if (route?.geometry?.length) {
            return route.geometry.map((point) => [
                point.latitude,
                point.longitude,
            ])
        }

        const deliveryPoints = selectedDeliveries.map((delivery) => [
            Number(delivery.destinationLatitude),
            Number(delivery.destinationLongitude),
        ])

        return routeOrigin
            ? [[routeOrigin.latitude, routeOrigin.longitude], ...deliveryPoints]
            : deliveryPoints
    }, [route, routeOrigin, selectedDeliveries])

    function toggleDelivery(deliveryId) {
        setRoute(null)

        setSelectedIds((currentIds) =>
            currentIds.includes(deliveryId)
                ? currentIds.filter((id) => id !== deliveryId)
                : [...currentIds, deliveryId],
        )
    }

    function moveStop(index, direction) {
        const targetIndex = index + direction

        if (targetIndex < 0 || targetIndex >= selectedIds.length) return

        setRoute(null)

        setSelectedIds((currentIds) => {
            const nextIds = [...currentIds]
            const temporaryId = nextIds[index]

            nextIds[index] = nextIds[targetIndex]
            nextIds[targetIndex] = temporaryId

            return nextIds
        })
    }

    function reorderStops(sourceId, targetId) {
        if (sourceId === targetId) return

        setRoute(null)

        setSelectedIds((currentIds) => {
            const sourceIndex = currentIds.indexOf(sourceId)
            const targetIndex = currentIds.indexOf(targetId)

            if (sourceIndex === -1 || targetIndex === -1) {
                return currentIds
            }

            const nextIds = [...currentIds]
            const [movedId] = nextIds.splice(sourceIndex, 1)

            const insertIndex =
                sourceIndex < targetIndex ? targetIndex - 1 : targetIndex

            nextIds.splice(insertIndex, 0, movedId)

            return nextIds
        })
    }

    async function planRoute() {
        if (!selectedDriverId) {
            setError('Select a driver for this route.')
            return
        }

        if (!selectedDriverLocation) {
            setError('The selected driver has not reported a location yet.')
            return
        }

        if (isSelectedDriverLocationStale) {
            setError('The selected driver location is older than one minute.')
            return
        }

        if (selectedIds.length < 2) {
            setError('Select at least two deliveries to create a route.')
            return
        }

        setPlanning(true)
        setError('')

        try {
            const response = await api.post('/dispatcher/routes', {
                driverId: Number(selectedDriverId),
                deliveryIds: selectedIds,
            })

            setRoute(response.data)
        } catch (requestError) {
            setError(
                getErrorMessage(requestError, 'Could not calculate this route.'),
            )
        } finally {
            setPlanning(false)
        }
    }

    return (
        <AppShell
            role="dispatcher"
            title="Route planning"
            subtitle="Choose a driver, arrange delivery stops, and calculate a driving route."
        >
            <div className="route-planner-layout">
                <section className="panel">
                    <div className="section-heading">
                        <div>
                            <h2>Available deliveries</h2>
                            <p>Select active deliveries that have destination pins.</p>
                        </div>

                        <span className="muted-count">
              {eligibleDeliveries.length} available
            </span>
                    </div>

                    {loading ? (
                        <p className="panel-intro">Loading deliveries…</p>
                    ) : eligibleDeliveries.length === 0 ? (
                        <p className="panel-intro">
                            No deliveries are ready for planning. Add destination pins to at
                            least two active deliveries first.
                        </p>
                    ) : (
                        <div className="route-delivery-list">
                            {eligibleDeliveries.map((delivery) => {
                                const selected = selectedIds.includes(delivery.id)

                                return (
                                    <label
                                        className={`route-delivery-option ${selected ? 'selected' : ''}`}
                                        key={delivery.id}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleDelivery(delivery.id)}
                                        />

                                        <span>
                      <strong>
                        #{delivery.id} · {delivery.customerName}
                      </strong>
                      <small>{delivery.address}</small>
                    </span>

                                        <span
                                            className={`status-pill ${statusClass(delivery.status)}`}
                                        >
                      {delivery.status.replace('_', ' ')}
                    </span>
                                    </label>
                                )
                            })}
                        </div>
                    )}
                </section>

                <aside className="route-sidebar">
                    <section className="panel">
                        <div className="section-heading">
                            <div>
                                <h2>Driver and stop order</h2>
                                <p>Drag stops to change their delivery order.</p>
                            </div>

                            <span className="muted-count">
                {selectedIds.length} selected
              </span>
                        </div>

                        <label className="route-driver-field">
                            Route driver

                            <select
                                value={selectedDriverId}
                                onChange={(event) => {
                                    setSelectedDriverId(event.target.value)
                                    setRoute(null)
                                }}
                            >
                                <option value="">Select an active driver</option>

                                {activeDrivers.map((driver) => (
                                    <option key={driver.id} value={driver.id}>
                                        {driver.fullName} — {driver.phone}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {selectedDriverId && !selectedDriverLocation && (
                            <p className="route-origin-note">
                                This driver has not shared a location yet. Ask them to start
                                location sharing.
                            </p>
                        )}

                        {selectedDriverLocation && isSelectedDriverLocationStale && (
                            <p className="route-origin-note route-origin-stale">
                                Driver location is stale — last reported{' '}
                                {formatLocationAge(selectedDriverLocation)}. Ask the driver to
                                resume location sharing before planning.
                            </p>
                        )}

                        {selectedDriverLocation && !isSelectedDriverLocationStale && (
                            <p className="route-origin-note route-origin-ready">
                                Route starts from {selectedDriver?.fullName}'s latest location,
                                reported {formatLocationAge(selectedDriverLocation)}.
                            </p>
                        )}

                        {selectedDeliveries.length === 0 ? (
                            <p className="panel-intro">Select deliveries from the list.</p>
                        ) : (
                            <ol className="route-stop-list">
                                {selectedDeliveries.map((delivery, index) => (
                                    <li
                                        key={delivery.id}
                                        draggable
                                        className={[
                                            draggedId === delivery.id ? 'dragging' : '',
                                            dragOverId === delivery.id ? 'drag-over' : '',
                                        ].join(' ')}
                                        onDragStart={(event) => {
                                            setDraggedId(delivery.id)
                                            event.dataTransfer.effectAllowed = 'move'
                                            event.dataTransfer.setData(
                                                'text/plain',
                                                String(delivery.id),
                                            )
                                        }}
                                        onDragOver={(event) => {
                                            event.preventDefault()
                                            setDragOverId(delivery.id)
                                        }}
                                        onDrop={(event) => {
                                            event.preventDefault()

                                            if (draggedId != null) {
                                                reorderStops(draggedId, delivery.id)
                                            }

                                            setDraggedId(null)
                                            setDragOverId(null)
                                        }}
                                        onDragEnd={() => {
                                            setDraggedId(null)
                                            setDragOverId(null)
                                        }}
                                    >
                    <span className="drag-handle" aria-hidden="true">
                      ⠿
                    </span>

                                        <span className="route-stop-number">{index + 1}</span>

                                        <span className="route-stop-details">
                      <strong>{delivery.customerName}</strong>
                      <small>{delivery.address}</small>
                    </span>

                                        <div className="route-order-actions">
                                            <button
                                                className="icon-button"
                                                type="button"
                                                onClick={() => moveStop(index, -1)}
                                                disabled={index === 0}
                                                aria-label={`Move ${delivery.customerName} earlier`}
                                            >
                                                ↑
                                            </button>

                                            <button
                                                className="icon-button"
                                                type="button"
                                                onClick={() => moveStop(index, 1)}
                                                disabled={index === selectedDeliveries.length - 1}
                                                aria-label={`Move ${delivery.customerName} later`}
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}

                        <button
                            className="btn btn-primary route-plan-button"
                            type="button"
                            onClick={planRoute}
                            disabled={
                                !selectedDriverId ||
                                !selectedDriverLocation ||
                                isSelectedDriverLocationStale ||
                                selectedIds.length < 2 ||
                                planning
                            }
                        >
                            {planning ? 'Calculating route…' : 'Calculate route'}
                        </button>
                    </section>

                    <section className="panel route-summary">
                        <h2>Route summary</h2>

                        {route ? (
                            <>
                                <div className="route-metrics">
                                    <div>
                                        <span>Total distance</span>
                                        <strong>{formatDistance(route.distanceMeters)}</strong>
                                    </div>

                                    <div>
                                        <span>Estimated drive time</span>
                                        <strong>{formatDuration(route.durationSeconds)}</strong>
                                    </div>
                                </div>

                                <p className="panel-intro">
                                    Starts with {route.origin.driverName} and includes{' '}
                                    {route.stops.length} delivery stops.
                                </p>
                            </>
                        ) : (
                            <p className="panel-intro">
                                Choose a driver and at least two stops, then calculate the
                                route.
                            </p>
                        )}
                    </section>
                </aside>
            </div>

            <section className="panel route-map-panel">
                <div className="section-heading">
                    <div>
                        <h2>Route preview</h2>
                        <p>
                            Green marker: driver origin. Blue markers: delivery stops. Red
                            marker: final stop.
                        </p>
                    </div>
                </div>

                <MapContainer
                    center={[20, 0]}
                    zoom={2}
                    scrollWheelZoom
                    className="route-map"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <FitRouteBounds points={mapPoints} />

                    {route?.geometry?.length > 0 && (
                        <Polyline
                            positions={mapPoints}
                            pathOptions={{
                                color: '#2563eb',
                                weight: 5,
                                opacity: 0.85,
                            }}
                        />
                    )}

                    {routeOrigin && (
                        <CircleMarker
                            center={[routeOrigin.latitude, routeOrigin.longitude]}
                            radius={12}
                            pathOptions={{
                                color: '#15803d',
                                fillColor: '#22c55e',
                                fillOpacity: 0.95,
                                weight: 3,
                            }}
                        >
                            <Popup>
                                <strong>
                                    Route origin:{' '}
                                    {routeOrigin.driverName || selectedDriver?.fullName}
                                </strong>
                                <br />
                                Driver’s latest reported location
                            </Popup>
                        </CircleMarker>
                    )}

                    {selectedDeliveries.map((delivery, index) => {
                        const isFinalStop = index === selectedDeliveries.length - 1
                        const color = isFinalStop ? '#dc2626' : '#2563eb'

                        return (
                            <CircleMarker
                                key={delivery.id}
                                center={[
                                    Number(delivery.destinationLatitude),
                                    Number(delivery.destinationLongitude),
                                ]}
                                radius={11}
                                pathOptions={{
                                    color,
                                    fillColor: color,
                                    fillOpacity: 0.95,
                                    weight: 3,
                                }}
                            >
                                <Popup>
                                    <strong>
                                        Stop {index + 1}: {delivery.customerName}
                                    </strong>
                                    <br />
                                    {delivery.address}
                                </Popup>
                            </CircleMarker>
                        )
                    })}
                </MapContainer>
            </section>

            {error && <p className="alert alert-error">{error}</p>}
        </AppShell>
    )
}