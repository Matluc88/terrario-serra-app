import { useState, useEffect } from 'react'
import { AlertTriangle, Shield, ShieldOff, Power } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

interface KillSwitchStatus {
  is_active: boolean
  reason?: string
  activated_at?: string
  deactivated_at?: string
}

export default function KillSwitch() {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [reason, setReason] = useState('')
  const [showActivateDialog, setShowActivateDialog] = useState(false)

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/kill/`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setStatus(data)
    } catch (err) {
      console.error('Failed to fetch kill switch status:', err)
    } finally {
      setLoading(false)
    }
  }

  const activateKillSwitch = async () => {
    setActivating(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/kill/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason || 'Arresto di emergenza attivato' }),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setStatus(data)
      setShowActivateDialog(false)
      setReason('')
    } catch (err) {
      console.error('Failed to activate kill switch:', err)
    } finally {
      setActivating(false)
    }
  }

  const deactivateKillSwitch = async () => {
    setDeactivating(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/kill/`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setStatus(data)
    } catch (err) {
      console.error('Failed to deactivate kill switch:', err)
    } finally {
      setDeactivating(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="animate-pulse flex items-center gap-3">
            <div className="h-6 w-6 bg-gray-300 rounded"></div>
            <div className="h-4 bg-gray-300 rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isActive = status?.is_active || false

  return (
    <Card className={`w-full border-2 ${isActive ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-50'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          {isActive ? (
            <>
              <ShieldOff className="h-5 w-5 text-red-600" />
              <span className="text-red-800">SISTEMA BLOCCATO</span>
            </>
          ) : (
            <>
              <Shield className="h-5 w-5 text-green-600" />
              <span className="text-green-800">Sistema Operativo</span>
            </>
          )}
        </CardTitle>
        <CardDescription>
          {isActive 
            ? 'Tutte le operazioni automatiche e manuali sono disabilitate'
            : 'Il sistema è operativo e pronto per i comandi'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isActive && status?.reason && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Motivo:</strong> {status.reason}
            </AlertDescription>
          </Alert>
        )}
        
        <div className="flex gap-3">
          {isActive ? (
            <Button 
              onClick={deactivateKillSwitch}
              disabled={deactivating}
              variant="default"
              className="bg-green-600 hover:bg-green-700"
            >
              {deactivating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Riattivazione...
                </>
              ) : (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Riattiva Sistema
                </>
              )}
            </Button>
          ) : (
            <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Arresto di Emergenza
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Conferma Arresto di Emergenza</DialogTitle>
                  <DialogDescription>
                    Questa azione bloccherà immediatamente tutte le operazioni del sistema.
                    Tutti i dispositivi rimarranno nel loro stato attuale e non potranno essere controllati
                    fino alla riattivazione del sistema.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Motivo (opzionale)</Label>
                    <Input
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Inserisci il motivo dell'arresto di emergenza..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowActivateDialog(false)}
                    disabled={activating}
                  >
                    Annulla
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={activateKillSwitch}
                    disabled={activating}
                  >
                    {activating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Attivazione...
                      </>
                    ) : (
                      <>
                        <ShieldOff className="h-4 w-4 mr-2" />
                        Attiva Arresto di Emergenza
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        {status?.activated_at && (
          <div className="mt-3 text-sm text-gray-600">
            {isActive ? 'Attivato' : 'Ultimo arresto'}: {new Date(status.activated_at).toLocaleString('it-IT')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
