import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import KillSwitch from './components/KillSwitch'
import ZoneTabs from './components/ZoneTabs'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof __VITE_API_BASE_URL__ !== 'undefined' ? __VITE_API_BASE_URL__ : 'http://localhost:8000')
console.log('DEBUG: VITE_API_BASE_URL =', import.meta.env.VITE_API_BASE_URL)
console.log('DEBUG: __VITE_API_BASE_URL__ =', typeof __VITE_API_BASE_URL__ !== 'undefined' ? __VITE_API_BASE_URL__ : 'undefined')
console.log('DEBUG: Final API_BASE_URL =', API_BASE_URL)

interface Zone {
  id: number
  slug: string
  name: string
  mode: string
  active: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at?: string
}

function App() {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchZones = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/zones/`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setZones(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch zones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchZones()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento sistema...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Errore di connessione: {error}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Sistema Controllo Terrario &amp; Serra
          </h1>
          <p className="text-gray-600">
            Gestione automatizzata per serra e terrario con controllo manuale e scene personalizzabili
          </p>
        </div>

        <div className="mb-6">
          <KillSwitch />
        </div>

        <div className="grid gap-6">
          {zones.map((zone) => (
            <Card key={zone.id} className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {zone.slug === 'serra' ? '🌱' : '🐢'} {zone.name}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    zone.mode === 'automatic' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {zone.mode === 'automatic' ? 'Automatico' : 'Manuale'}
                  </span>
                </CardTitle>
                <CardDescription>
                  Controllo {zone.slug === 'serra' ? 'serra' : 'terrario'} - 
                  Stato: {zone.active ? 'Attivo' : 'Inattivo'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ZoneTabs zone={zone} onZoneUpdate={fetchZones} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
