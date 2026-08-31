import { useEffect, useRef, useState } from 'react'
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

const REFRESH_INTERVAL_MS = 10_000
const STALE_AFTER_MS = 60_000

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
    const [error, setError] = useState('')
    const [alertError, setAlertError] = useState('')
    const [lastUpdated, setLastUpdated] = useState(null)

    async function loadLocations() {
        try {
            const response = await api.get('/dispatcher/driver-locations')

            const validLocations = response.data.filter(
                (location) =>
                    Number.isFinite(Number(location.latitude)) &&
                    Number.isFinite(Number(location.longitude)),
            )

            setLocations(validLocations)
            setLastUpdated(new Date())
            setError('')
        } catch {
            setError('Could not load driver locations.')
        }
    }

    async function loadAlerts() {
        try {
            const response = await api.get('/dispatcher/alerts')

            setAlerts(response.data)
            setAlertError('')
        } catch {
            setAlertError('Could not load tracking alerts.')
        }
    }

    async function refreshMapData() {
        await Promise.all([
            loadLocations(),
            loadAlerts(),
        ])
    }

    useEffect(() => {
        refreshMapData()

        const intervalId = window.setInterval(
            refreshMapData,
            REFRESH_INTERVAL_MS,
        )

        return () => window.clearInterval(intervalId)
    }, [])

    return (
        <AppShell
            role="dispatcher"
            title="Live driver map"
            subtitle="Driver positions and tracking alerts refresh automatically every 10 seconds."
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

                        {lastUpdated && (
                            <p className="map-refresh-time">
                                Last refreshed:{' '}
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