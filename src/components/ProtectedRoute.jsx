import { Navigate } from 'react-router-dom'

function readCurrentUser() {
    try {
        return JSON.parse(sessionStorage.getItem('current_user'))
    } catch {
        return null
    }
}

export default function ProtectedRoute({ allowedRole, children }) {
    const token = sessionStorage.getItem('access_token')
    const user = readCurrentUser()

    if (!token || !user) {
        return <Navigate to="/login" replace />
    }

    if (allowedRole && user.role !== allowedRole) {
        const home = user.role === 'DRIVER' ? '/driver' : '/dispatcher'
        return <Navigate to={home} replace />
    }

    return children
}