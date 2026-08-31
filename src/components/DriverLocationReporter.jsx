import { useEffect, useState } from 'react';
import api from '../api/client';

const REPORT_INTERVAL_MS = 10_000;

export default function DriverLocationReporter() {
    const [status, setStatus] = useState('Starting location tracking…');

    useEffect(() => {
        if (!navigator.geolocation) {
            setStatus('This browser does not support location tracking.');
            return undefined;
        }

        let lastReportedAt = 0;

        const reportLocation = async (position) => {
            const now = Date.now();

            if (now - lastReportedAt < REPORT_INTERVAL_MS) {
                return;
            }

            lastReportedAt = now;

            try {
                await api.post('/driver/locations', {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    recordedAt: new Date(position.timestamp).toISOString(),
                });

                setStatus(`Location shared at ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                setStatus('Could not share your location. Please try again.');
            }
        };

        const handleLocationError = (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                setStatus('Location permission was denied.');
            } else {
                setStatus('Could not determine your current location.');
            }
        };

        const watchId = navigator.geolocation.watchPosition(
            reportLocation,
            handleLocationError,
            {
                enableHighAccuracy: true,
                maximumAge: 5_000,
                timeout: 15_000,
            },
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    return <p className="location-tracking-status">{status}</p>;
}