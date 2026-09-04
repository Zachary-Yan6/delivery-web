import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
    CircleMarker,
    MapContainer,
    Popup,
    TileLayer,
    useMap,
} from 'react-leaflet'
import AppShell from '../components/AppShell'
import api from '../api/client'

const STALE_AFTER_MS = 60_000
const LOCATION_EXPIRES_AFTER_MS = 90_000

function isStale(location) {
    const receivedAt = new Date(location.receivedAt).getTime()

    return (
        Number.isNaN(receivedAt) ||
        Date.now() - receivedAt > STALE_AFTER_MS
    )
}

function formatTime(value) {
    return value ? new Date(value).toLocaleString() : 'Unknown'
}

function isValidLocation(location) {
    return (
        Number.isFinite(Number(location.latitude)) &&
        Number.isFinite(Number(location.longitude))
    )
}

function mergeLocationUpdate(currentLocations, update) {
    if (!isValidLocation(update)) {
        return currentLocations
    }

    const existing = currentLocations.find(
        (location) => location.driverId === update.driverId,
    )

    // Ignore a delayed WebSocket message if the UI already has a newer point.
    if (
        existing &&
        new Date(update.recordedAt).getTime() <=
            new Date(existing.recordedAt).getTime()
    ) {
        return currentLocations
    }

    const merged = {
        ...existing,
        ...update,
        driverName:
            update.driverName ||
            existing?.driverName ||
            `Driver #${update.driverId}`,
    }

    if (!existing) {
        return [...currentLocations, merged]
    }

    return currentLocations.map((location) =>
        location.driverId === update.driverId ? merged : location,
    )
}

function mergeLocationSnapshot(
    currentLocations,
    snapshotLocations,
    requestStartedAt,
) {
    const snapshotByDriver = new Map(
        snapshotLocations.map((location) => [location.driverId, location]),
    )

    currentLocations.forEach((current) => {
        const snapshot = snapshotByDriver.get(current.driverId)

        if (snapshot) {
            const currentTime = new Date(current.recordedAt).getTime()
            const snapshotTime = new Date(snapshot.recordedAt).getTime()

            if (currentTime > snapshotTime) {
                snapshotByDriver.set(current.driverId, {
                    ...snapshot,
                    ...current,
                    driverName: snapshot.driverName || current.driverName,
                })
            }

            return
        }

        // Preserve a WebSocket update that arrived after this REST request
        // started, even if that request's Redis scan did not observe it yet.
        if (new Date(current.receivedAt).getTime() >= requestStartedAt) {
            snapshotByDriver.set(current.driverId, current)
        }
    })

    return [...snapshotByDriver.values()]
}

function webSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    // Vite proxies /ws to Spring Boot in development. The same relative URL
    // also works when both applications are served behind one reverse proxy.
    return `${protocol}//${window.location.host}/ws`
}

function FitMapToDrivers({ locations }) {
    const map = useMap()
    const hasFitted = useRef(false)

    useEffect(() => {
        if (locations.length === 0 || hasFitted.current) {
            return
        }

        const points = locations.map((location) => [
            Number(location.latitude),
            Number(location.longitude),
        ])

        if (points.length === 1) {
            map.setView(points[0], 14)
        } else {
            map.fitBounds(L.latLngBounds(points), {
                padding: [40, 40],
            })
        }

        hasFitted.current = true
    }, [locations, map])

    return null
}

export default function LiveMapPage() {
    const [locations, setLocations] = useState([])
    const [alerts, setAlerts] = useState([])
    const [error, setError] = useState(() =>
        sessionStorage.getItem('access_token')
            ? ''
            : 'Please sign in again to view live locations.',
    )
    const [alertError, setAlertError] = useState('')
    const [lastUpdated, setLastUpdated] = useState(null)
    const [connectionStatus, setConnectionStatus] = useState(() =>
        sessionStorage.getItem('access_token')
            ? 'connecting'
            : 'disconnected',
    )

    const loadLocations = useCallback(async () => {
        const requestStartedAt = Date.now()

        try {
            const response = await api.get('/dispatcher/driver-locations')

            const validLocations = response.data.filter(isValidLocation)

            // This one-time snapshot supplies driver names and recovers any
            // messages missed while the WebSocket was disconnected.
            setLocations((current) =>
                mergeLocationSnapshot(
                    current,
                    validLocations,
                    requestStartedAt,
                ),
            )
            setLastUpdated(new Date())
            setError('')
        } catch {
            setError('Could not load driver locations.')
        }
    }, [])

    const loadAlerts = useCallback(async () => {
        try {
            const response = await api.get('/dispatcher/alerts')

            setAlerts(response.data)
            setAlertError('')
        } catch {
            setAlertError('Could not load tracking alerts.')
        }
    }, [])

    const refreshMapData = useCallback(async () => {
        await Promise.all([
            loadLocations(),
            loadAlerts(),
        ])
    }, [loadAlerts, loadLocations])

    useEffect(() => {
        const token = sessionStorage.getItem('access_token')

        if (!token) {
            return undefined
        }

        let socket
        let reconnectTimer
        let disposed = false
        let shouldReconnect = true

        function connect() {
            if (disposed) {
                return
            }

            setConnectionStatus('connecting')

            // build websocket connection
            socket = new WebSocket(webSocketUrl())

            // would be called in first connection
            socket.onopen = () => {
                // Browsers cannot attach Authorization to the WebSocket HTTP
                // handshake, so authentication is the first socket message.
                socket.send(JSON.stringify({ type: 'AUTH', token }))
            }

            // would be called when backend send message
            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data)

                    if (message.type === 'AUTHENTICATED') {
                        setConnectionStatus('connected')
                        setError('')

                        // Authentication happens before the snapshot request,
                        // closing the data gap after initial load or reconnect.
                        refreshMapData()
                        return
                    }

                    if (message.type === 'AUTHENTICATION_ERROR') {
                        shouldReconnect = false
                        setConnectionStatus('disconnected')
                        setError(message.message)
                        return
                    }

                    if (message.type !== 'LOCATION_UPDATE') {
                        return
                    }

                    // React re-renders the marker as soon as this state changes;
                    // no browser polling request is needed.
                    setLocations((current) =>
                        mergeLocationUpdate(current, message.payload),
                    )
                    setLastUpdated(new Date())
                } catch {
                    setError('A live location update could not be read.')
                }
            }

            // would be called when connection fails
            socket.onerror = () => {
                socket.close()
            }

            // would be called when connection close
            socket.onclose = (event) => {
                // Code 1008 means the server rejected authentication or access.
                if (event.code === 1008) {
                    shouldReconnect = false
                    setConnectionStatus('disconnected')
                    return
                }

                if (disposed || !shouldReconnect) {
                    return
                }

                setConnectionStatus('reconnecting')
                reconnectTimer = window.setTimeout(connect, 5_000)
            }
        }

        connect()

        return () => {
            disposed = true
            window.clearTimeout(reconnectTimer)
            socket?.close()
        }
    }, [refreshMapData])

    useEffect(() => {
        // This timer performs no network request. It only re-evaluates stale
        // markers and mirrors the 90-second Redis location TTL in the UI.
        const expiryTimer = window.setInterval(() => {
            const now = Date.now()

            setLocations((current) =>
                current.filter((location) => {
                    const receivedAt = new Date(
                        location.receivedAt,
                    ).getTime()

                    return (
                        Number.isFinite(receivedAt) &&
                        now - receivedAt <= LOCATION_EXPIRES_AFTER_MS
                    )
                }),
            )
        }, 5_000)

        return () => window.clearInterval(expiryTimer)
    }, [])

    return (
        <AppShell
            role="dispatcher"
            title="Live driver map"
            subtitle="Driver positions arrive in real time through a secure WebSocket connection."
            actions={
                <button
                    className="btn btn-secondary"
                    onClick={refreshMapData}
                >
                    Refresh now
                </button>
            }
        >
            <section className="map-layout">
                <article className="map-card">
                    <MapContainer
                        center={[20, 0]}
                        zoom={2}
                        scrollWheelZoom
                        className="live-map"
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
                            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        <FitMapToDrivers locations={locations} />

                        {locations.map((location) => {
                            const stale = isStale(location)

                            return (
                                <CircleMarker
                                    key={location.driverId}
                                    center={[
                                        Number(location.latitude),
                                        Number(location.longitude),
                                    ]}
                                    radius={10}
                                    pathOptions={{
                                        color: stale ? '#64748b' : '#2563eb',
                                        fillColor: stale ? '#94a3b8' : '#3b82f6',
                                        fillOpacity: 0.9,
                                        weight: 3,
                                    }}
                                >
                                    <Popup>
                                        <strong>{location.driverName}</strong>
                                        <br />
                                        Last seen: {formatTime(location.receivedAt)}
                                        <br />
                                        {stale
                                            ? 'Location may be outdated'
                                            : 'Location is current'}
                                    </Popup>
                                </CircleMarker>
                            )
                        })}
                    </MapContainer>
                </article>

                <aside className="map-sidebar">
                    <section className="tracking-alert-card">
                        <div className="location-list-header">
                            <h2>Tracking alerts</h2>
                            <span className="alert-count">
                                {alerts.length} active
                            </span>
                        </div>

                        {alertError && (
                            <p className="alert alert-error">
                                {alertError}
                            </p>
                        )}

                        {alerts.length === 0 && !alertError && (
                            <p className="no-active-alerts">
                                No active tracking alerts.
                            </p>
                        )}

                        <div className="tracking-alert-list">
                            {alerts.map((alert) => (
                                <article
                                    className="tracking-alert-row"
                                    key={`${alert.type}-${alert.driverId}`}
                                >
                                    <span className="tracking-alert-icon">
                                        !
                                    </span>

                                    <div>
                                        <strong>{alert.driverName}</strong>
                                        <p>{alert.message}</p>
                                        <small>
                                            Last location:{' '}
                                            {formatTime(alert.lastReceivedAt)}
                                        </small>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="location-list-card">
                        <div className="location-list-header">
                            <h2>Drivers</h2>
                            <span>{locations.length} reporting</span>
                        </div>

                        <p
                            className={`websocket-status websocket-status-${connectionStatus}`}
                        >
                            Live connection: {connectionStatus}
                        </p>

                        {lastUpdated && (
                            <p className="map-refresh-time">
                                Last location update:{' '}
                                {lastUpdated.toLocaleTimeString()}
                            </p>
                        )}

                        {error && (
                            <p className="alert alert-error">{error}</p>
                        )}

                        {locations.length === 0 && !error && (
                            <p className="empty-map-state">
                                No drivers have shared a location yet.
                            </p>
                        )}

                        <div className="location-list">
                            {locations.map((location) => {
                                const stale = isStale(location)

                                return (
                                    <article
                                        className="driver-location-row"
                                        key={location.driverId}
                                    >
                                        <span
                                            className={
                                                stale
                                                    ? 'location-indicator location-stale'
                                                    : 'location-indicator location-current'
                                            }
                                        />

                                        <div>
                                            <strong>
                                                {location.driverName}
                                            </strong>
                                            <p>
                                                {stale
                                                    ? 'Last location is stale'
                                                    : 'Currently reporting'}
                                            </p>
                                            <small>
                                                {formatTime(location.receivedAt)}
                                            </small>
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    </section>
                </aside>
            </section>
        </AppShell>
    )
}
