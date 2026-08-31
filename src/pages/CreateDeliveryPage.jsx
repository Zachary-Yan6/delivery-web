import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import api from '../api/client'
import DeliveryLocationPicker from '../components/DeliveryLocationPicker'
export default function CreateDeliveryPage() {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', address: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [destination, setDestination] = useState(null)



  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.post('/deliveries', {
        ...form,
        destinationLatitude: destination?.latitude,
        destinationLongitude: destination?.longitude,
      })
      navigate('/dispatcher')
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.response?.data?.detail || 'Could not create the delivery.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell
      role="dispatcher"
      title="Create a delivery"
      subtitle="Add the customer and destination details before assigning a driver."
      actions={<button className="btn btn-secondary" onClick={() => navigate('/dispatcher')}>Cancel</button>}
    >
      <section className="panel form-card">
        <h2>Customer details</h2>
        <p className="panel-intro">Fields marked with an asterisk are required.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="form-field">
            Customer name *
            <input name="customerName" value={form.customerName} onChange={handleChange} placeholder="e.g. Olivia Chen" required />
          </label>
          <label className="form-field">
            Customer phone
            <input name="customerPhone" value={form.customerPhone} onChange={handleChange} placeholder="e.g. +44 7700 900000" />
          </label>
          <label className="form-field full">
            Delivery address *
            <textarea name="address" value={form.address} onChange={handleChange} placeholder="Enter the full delivery address" required rows="5" />
          </label>
          <section className="destination-picker">
            <div className="section-heading">
              <div>
                <h2>Delivery location</h2>
                <p>Click the map to set an exact destination for future route planning.</p>
              </div>

              {destination && (
                  <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setDestination(null)}
                  >
                    Clear pin
                  </button>
              )}
            </div>

            <DeliveryLocationPicker
                destination={destination}
                onChange={setDestination}
            />

            <p className="coordinate-readout">
              {destination
                  ? `Selected: ${destination.latitude.toFixed(6)}, ${destination.longitude.toFixed(6)}`
                  : 'No location selected yet.'}
            </p>
          </section>
          <div className="form-actions form-field full">
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create delivery'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/dispatcher')}>Cancel</button>
          </div>
        </form>
        {error && <p className="alert alert-error">{error}</p>}
      </section>
    </AppShell>
  )
}
