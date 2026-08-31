import { Link, useLocation, useNavigate } from 'react-router-dom'

const dispatcherLinks = [
  { label: 'Overview', to: '/dispatcher' },
  { label: 'New delivery', to: '/dispatcher/deliveries/new' },
  { label: 'Drivers', to: '/dispatcher/drivers' },
  { label: 'Live map', to: '/dispatcher/map' },
  { label: 'Route planner', to: '/dispatcher/routes' },
]

const driverLinks = [{ label: 'My deliveries', to: '/driver' }]

export default function AppShell({ role, title, subtitle, actions, children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const links = role === 'dispatcher' ? dispatcherLinks : driverLinks
  const home = role === 'dispatcher' ? '/dispatcher' : '/driver'

  function logout() {
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('current_user')
    navigate('/login')
  }

  function isActive(link) {
    if (link.to === '/dispatcher') {
      return location.pathname === '/dispatcher'
    }

    return location.pathname.startsWith(link.to)
  }

  return (
      <div className="app-shell">
        <aside className="sidebar">
          <Link to={home} className="brand">
            <span className="brand-mark">DF</span>
            <span>
            <strong>DeliveryFlow</strong>
            <small>Operations console</small>
          </span>
          </Link>

          <p className="nav-caption">Workspace</p>

          <nav className="side-nav" aria-label="Main navigation">
            {links.map((link) => (
                <Link
                    key={link.to}
                    to={link.to}
                    className={isActive(link) ? 'nav-link active' : 'nav-link'}
                >
                  {link.label}
                </Link>
            ))}
          </nav>

          <div className="sidebar-footer">
            <span className="role-chip">{role}</span>
            <button className="nav-signout" onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>

        <main className="app-main">
          <header className="app-header">
            <div>
              <p className="eyebrow">{role} workspace</p>
              <h1>{title}</h1>
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>

            {actions && <div className="header-actions">{actions}</div>}
          </header>

          <div className="page-body">{children}</div>
        </main>
      </div>
  )
}