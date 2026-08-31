import { useEffect } from 'react'
import {
    CircleMarker,
    MapContainer,
    TileLayer,
    useMap,
    useMapEvents,
} from 'react-leaflet'

function RecenterMap({ destination }) {
    const map = useMap()

    useEffect(() => {
        if (destination) {
            map.setView(
                [destination.latitude, destination.longitude],
                Math.max(map.getZoom(), 13),
            )
        }
    }, [destination, map])

    return null
}

function PinSelector({ destination, onChange }) {
    useMapEvents({
        click(event) {
            onChange({
                latitude: event.latlng.lat,
                longitude: event.latlng.lng,
            })
        },
    })

    return destination ? (
        <CircleMarker
            center={[destination.latitude, destination.longitude]}
            radius={9}
            pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.9,
            }}
        />
    ) : null
}

export default function DeliveryLocationPicker({ destination, onChange }) {
    return (
        <section className="destination-picker">
            <div className="section-heading">
                <div>
                    <h2>Delivery location</h2>
                    <p>Click the map to set or correct the destination pin.</p>
                </div>
            </div>

            <MapContainer
                center={[20, 0]}
                zoom={2}
                scrollWheelZoom
                className="destination-map"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <RecenterMap destination={destination} />
                <PinSelector destination={destination} onChange={onChange} />
            </MapContainer>

            <p className="coordinate-readout">
                {destination
                    ? `Selected: ${destination.latitude.toFixed(6)}, ${destination.longitude.toFixed(6)}`
                    : 'No location selected yet.'}
            </p>
        </section>
    )
}