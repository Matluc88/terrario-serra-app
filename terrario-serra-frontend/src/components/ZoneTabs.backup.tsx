import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Settings, Play, Hand, Power, Thermometer, Droplets, AlertTriangle, RefreshCw, Activity } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import MappingInterface from './MappingInterface'
import SceneEditor from './SceneEditor'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

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

interface Device {
  id: number
  provider: string
  provider_device_id: string
  name: string
  zone_id: number
  meta: Record<string, unknown>
}

interface Outlet {
  id: number
  device_id: number
  channel: string
  role: string
  custom_name: string
  enabled: boolean
  last_state: boolean
}

interface SensorReading {
  sensor_id: number
  sensor_name: string
  temperature: {
    value: number | null
    unit: string | null
    timestamp: string | null
  }
  humidity: {
    value: number | null
    unit: string | null
    timestamp: string | null
  }
}

interface Scene {
  id: number
  zone_id: number
  name: string
  slug: string
  settings: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at?: string
}

interface ZoneTabsProps {
  zone: Zone
  onZoneUpdate: () => void
}

export default function ZoneTabs({ zone, onZoneUpdate }: ZoneTabsProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("manual")
  const [devices, setDevices] = useState<Device[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [sensorData, setSensorData] = useState<SensorReading[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)
  const [runningAutomation, setRunningAutomation] = useState(false)
  const [automationSession, setAutomationSession] = useState<any | null>(null)
  const [automationTimer, setAutomationTimer] = useState<number | null>(null)
  const [automationStartTime, setAutomationStartTime] = useState<Date | null>(null)
  const [detailedStatus, setDetailedStatus] = useState<any | null>(null)
  const AUTOMATION_DURATION_MINUTES = 15

  // Automazione attiva?
  const automationRunning = zone?.mode === 'automatic'

  // -------- fetch helpers --------
  const fetchDevicesAndOutlets = useCallback(async () => {
    try {
      const devicesResponse = await fetch(`${API_BASE_URL}/api/v1/devices/`)
      const devicesData = await devicesResponse.json()
      const zoneDevices = devicesData.filter((d: Device) => d.zone_id === zone.id)
      setDevices(zoneDevices)

      const allOutlets: Outlet[] = []
      for (const device of zoneDevices) {
        try {
          const outletsResponse = await fetch(`${API_BASE_URL}/api/v1/devices/${device.id}/outlets`)
          if (outletsResponse.ok) {
            const outletsData = await outletsResponse.json()
            allOutlets.push(...outletsData.outlets)
          } else {
            // fallback 5 prese
            for (let i = 1; i <= 5; i++) {
              allOutlets.push({
                id: device.id * 10 + i,
                device_id: device.id,
                channel: `switch_${i}`,
                role: i === 5 ? 'usb' : 'outlet',
                custom_name: i === 5 ? 'USB (2A+1C)' : `Presa ${i}`,
                enabled: true,
                last_state: false
              })
            }
          }
        } catch {
          // fallback in caso di errore
          for (let i = 1; i <= 5; i++) {
            allOutlets.push({
              id: device.id * 10 + i,
              device_id: device.id,
              channel: `switch_${i}`,
              role: i === 5 ? 'usb' : 'outlet',
              custom_name: i === 5 ? 'USB (2A+1C)' : `Presa ${i}`,
              enabled: true,
              last_state: false
            })
          }
        }
      }
      setOutlets(allOutlets)
    } catch (err) {
      console.error('Error in fetchDevicesAndOutlets:', err)
      setError('Errore nel caricamento dispositivi')
    }
  }, [zone.id])

  const fetchSensorData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/sensors/zone/${zone.id}/readings`)
      const data = await response.json()
      if (data.success && data.readings) {
        const transformedData = data.readings.map((reading: { sensor_id: number; sensor_name: string; readings?: { temperature?: number; humidity?: number }; timestamp?: string }) => ({
          sensor_id: reading.sensor_id,
          sensor_name: reading.sensor_name,
          temperature: {
            value: reading.readings?.temperature || null,
            unit: reading.readings?.temperature ? '°C' : null,
            timestamp: reading.timestamp || null
          },
          humidity: {
            value: reading.readings?.humidity || null,
            unit: reading.readings?.humidity ? '%' : null,
            timestamp: reading.timestamp || null
          }
        }))
        setSensorData(transformedData)
      }
    } catch (err) {
      console.error('Errore nel caricamento sensori:', err)
    }
  }, [zone.id])

  const fetchScenes = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/zone/${zone.id}`)
      if (response.ok) {
        const data = await response.json()
        setScenes(data)
      }
    } catch (err) {
      console.error('Error fetching scenes:', err)
    }
  }, [zone.id])

  const fetchDetailedStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/detailed-status`)
      if (response.ok) {
        const data = await response.json()
        setDetailedStatus(data)
      }
    } catch (err) {
      console.error('Error fetching detailed status:', err)
    }
  }, [zone.id])

  const fetchAutomationStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/status`)
      if (response.ok) {
        const data = await response.json()
        if (data.has_active_session && data.active_session) {
          setAutomationSession(data.active_session)
          setAutomationTimer(data.active_session.time_remaining_seconds)
          setAutomationStartTime(new Date(data.active_session.started_at))

          const scene = scenes.find(s => s.id === data.active_session.scene_id)
          if (scene) setSelectedScene(scene)
        } else {
          setAutomationSession(null)
          setAutomationTimer(null)
          setAutomationStartTime(null)
        }
      }
    } catch (err) {
      console.error('Error fetching automation status:', err)
    }
  }, [zone.id, scenes])

  // rinominata per evitare collisione con eventuale import
  const toggleOutlet = async (deviceId: number, outletId: number, state: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/devices/${deviceId}/outlets/${outletId}/switch?state=${state}`,
        { method: 'POST' }
      )
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

      const result = await response.json()
      if (result.success) {
        setOutlets(prev => prev.map(outlet =>
          outlet.id === outletId ? { ...outlet, last_state: state } : outlet
        ))
        onZoneUpdate()
      } else {
        throw new Error(result.error || 'Comando fallito')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel controllo dispositivo')
    } finally {
      setLoading(false)
    }
  }

  const switchAllZone = async (state: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/devices/zone/${zone.id}/switch-all?state=${state}`,
        { method: 'POST' }
      )
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

      const result = await response.json()
      if (result.success) {
        setOutlets(prev => prev.map(outlet => ({ ...outlet, last_state: state })))
        onZoneUpdate()
      } else {
        throw new Error(result.error || 'Comando fallito')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel controllo zona')
    } finally {
      setLoading(false)
    }
  }

  // -------- effects --------

  // Primo load + refresh sensori ogni 30 minuti
  useEffect(() => {
    fetchDevicesAndOutlets()
    fetchSensorData()
    fetchScenes()
    const interval = setInterval(fetchSensorData, 1800000)
    return () => clearInterval(interval)
    // IMPORTANTE: NON inserire le funzioni nelle deps per evitare il "before initialization"
  }, [zone.id])

  // Polling leggero SOLO quando automazione ON (fail-safe)
  useEffect(() => {
    if (!automationRunning) return
    const i = setInterval(() => {
      fetchDevicesAndOutlets().catch(() => {})
    }, 2000)
    return () => clearInterval(i)
  }, [automationRunning, zone.id])

  // Aggiorna stato automazione quando arrivano le scene
  useEffect(() => {
    if (scenes.length > 0) {
      fetchAutomationStatus()
    }
  }, [scenes])

  // Status tab: refresh dettagli ogni 10s
  useEffect(() => {
    if (activeTab === 'status') {
      fetchDetailedStatus()
      const interval = setInterval(fetchDetailedStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [activeTab])

  // Timer sessione automazione (countdown)
  useEffect(() => {
    if (automationTimer !== null && automationTimer > 0) {
      const interval = setInterval(() => {
        setAutomationTimer(prev => {
          if (prev === null || prev <= 1) {
            setAutomationSession(null)
            setAutomationStartTime(null)
            onZoneUpdate()
            return null
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [automationTimer, onZoneUpdate])

  const stopAutomation = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/stop`, {
        method: 'POST'
      })
      if (response.ok) {
        setAutomationSession(null)
        setAutomationTimer(null)
        setAutomationStartTime(null)
        onZoneUpdate()
        toast({ title: "Successo", description: "Automazione fermata" })
      }
    } catch (err) {
      console.error('Error stopping automation:', err)
      toast({
        title: "Errore",
        description: "Errore nel fermare l'automazione",
        variant: "destructive"
      })
    }
  }

  const runAutomation = async () => {
    if (!selectedScene) return
    setRunningAutomation(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: selectedScene.id,
          duration_minutes: AUTOMATION_DURATION_MINUTES
        })
      })
      if (response.ok) {
        const sessionData = await response.json()
        setAutomationSession(sessionData)
        setAutomationTimer(sessionData.time_remaining_seconds)
        setAutomationStartTime(new Date(sessionData.started_at))
        await fetchDevicesAndOutlets()
        onZoneUpdate()
        toast({
          title: "Successo",
          description: `Automazione "${selectedScene.name}" avviata - durata: ${AUTOMATION_DURATION_MINUTES} minuti`
        })
      } else {
        throw new Error("Errore nell'avvio automazione")
      }
    } catch (err) {
      console.error('Error starting automation:', err)
      toast({
        title: "Errore",
        description: "Errore nell'avvio dell'automazione",
        variant: "destructive"
      })
    } finally {
      setRunningAutomation(false)
    }
  }

  const formatElapsedTime = (startTime: Date): string => {
    const now = new Date()
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days} giorn${days === 1 ? 'o' : 'i'} ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '--'
    try {
      return new Date(timestamp).toLocaleString('it-IT')
    } catch {
      return '--'
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="manual" className="flex items-center gap-2">
          <Hand className="h-4 w-4" />
          Manuale
        </TabsTrigger>
        <TabsTrigger value="mapping" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Mapping
        </TabsTrigger>
        <TabsTrigger value="scenes" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Scene
        </TabsTrigger>
        <TabsTrigger value="automatic" className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          Automatico
        </TabsTrigger>
        <TabsTrigger value="status" className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Status
        </TabsTrigger>
      </TabsList>

      <TabsContent value="manual" className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Controllo Manuale
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => switchAllZone(true)} disabled={loading}>
                  <Power className="h-4 w-4 mr-1" />
                  Tutto ON
                </Button>
                <Button variant="outline" size="sm" onClick={() => switchAllZone(false)} disabled={loading}>
                  <Power className="h-4 w-4 mr-1" />
                  Tutto OFF
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Controlla direttamente i dispositivi della {zone.slug === 'serra' ? 'serra' : 'terrario'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Power className="h-4 w-4" />
                  Controllo Prese
                </h4>

                {devices.map((device) => (
                  <div key={device.id} className="space-y-3">
                    <div className="text-sm font-medium text-gray-700">{device.name}</div>
                    <div className="space-y-2">
                      {outlets
                        .filter(outlet => outlet.device_id === device.id)
                        .map((outlet) => (
                          <div key={outlet.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">{outlet.custom_name}</div>
                              <Badge variant={outlet.last_state ? "default" : "secondary"}>
                                {outlet.last_state ? "ON" : "OFF"}
                              </Badge>
                            </div>
                            <Switch
                              checked={outlet.last_state}
                              onCheckedChange={(checked) => toggleOutlet(device.id, outlet.id, checked)}
                              disabled={loading || !outlet.enabled}
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                ))}

                {devices.length === 0 && (
                  <div className="text-sm text-gray-600">Nessun dispositivo configurato per questa zona</div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Thermometer className="h-4 w-4" />
                  Sensori Ambientali
                </h4>

                {sensorData.map((sensor) => (
                  <div key={sensor.sensor_id} className="space-y-3 p-4 border rounded-lg">
                    <div className="text-sm font-medium text-gray-700">{sensor.sensor_name}</div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4 text-red-500" />
                        <div>
                          <div className="text-lg font-semibold">
                            {sensor.temperature.value !== null ? `${sensor.temperature.value}${sensor.temperature.unit}` : '--'}
                          </div>
                          <div className="text-xs text-gray-500">Temperatura</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-blue-500" />
                        <div>
                          <div className="text-lg font-semibold">
                            {sensor.humidity.value !== null ? `${sensor.humidity.value}${sensor.humidity.unit}` : '--'}
                          </div>
                          <div className="text-xs text-gray-500">Umidità</div>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Ultimo aggiornamento: {formatTimestamp(sensor.temperature.timestamp)}
                    </div>
                  </div>
                ))}

                {sensorData.length === 0 && (
                  <div className="text-sm text-gray-600">Nessun sensore configurato per questa zona</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="mapping" className="space-y-4">
        <MappingInterface
          zone={zone}
          outlets={outlets}
          onConfigUpdate={() => {
            fetchDevicesAndOutlets()
            fetchScenes()
          }}
        />
      </TabsContent>

      <TabsContent value="scenes" className="space-y-4">
        <SceneEditor
          zone={zone}
          onSceneUpdate={() => {
            fetchDevicesAndOutlets()
            fetchScenes()
            onZoneUpdate()
          }}
        />
      </TabsContent>

      <TabsContent value="automatic" className="space-y-4">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {zone.slug === 'serra' ? '🌱' : '🐢'}
                Automazione {zone.slug === 'serra' ? 'Serra' : 'Terrario'}
              </CardTitle>
              <CardDescription>
                Seleziona e attiva scene automatiche per la {zone.slug === 'serra' ? 'serra' : 'terrario'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Stato Automazione:</span>
                  <Badge variant={automationStartTime !== null ? 'default' : 'secondary'}>
                    {automationStartTime !== null ? `Attiva da ${formatElapsedTime(automationStartTime)}` : 'Inattiva'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Scene Disponibili:</h4>
                  {scenes.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      Nessuna scena configurata. Vai al tab Scene per creare una scena.
                    </div>
                  ) : (
                    <Select
                      value={selectedScene?.id.toString() || ''}
                      onValueChange={(value: string) => {
                        const scene = scenes.find((s: Scene) => s.id === parseInt(value))
                        setSelectedScene(scene || null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona una scena" />
                      </SelectTrigger>
                      <SelectContent>
                        {scenes.map((scene) => (
                          <SelectItem key={scene.id} value={scene.id.toString()}>
                            {scene.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedScene && (
                  <div className="p-3 border rounded-lg bg-gray-50">
                    <div className="text-sm">
                      <div className="font-medium">{selectedScene.name}</div>
                      <div className="text-gray-600 mt-1">
                        Creata: {new Date(selectedScene.created_at).toLocaleDateString('it-IT')}
                      </div>
                    </div>
                  </div>
                )}

                {automationTimer !== null && (
                  <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-green-800">
                          Automazione attiva da: {automationStartTime ? formatElapsedTime(automationStartTime) : '--'}
                        </div>
                        <div className="text-xs text-green-600">Avviata: {automationStartTime?.toLocaleString('it-IT')}</div>
                        <div className="text-xs text-green-600">Prossima verifica: ogni 5 minuti</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={stopAutomation}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Ferma
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchScenes} disabled={loading}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Aggiorna Scene
                  </Button>
                  <Button
                    size="sm"
                    onClick={runAutomation}
                    disabled={!selectedScene || runningAutomation || automationTimer !== null}
                  >
                    {runningAutomation ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Avvio...
                      </>
                    ) : automationTimer !== null ? (
                      <>
                        <div className="h-4 w-4 bg-green-500 rounded-full mr-2"></div>
                        In Esecuzione
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Automazione
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="status" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Status Automazione {zone.slug === 'serra' ? 'Serra' : 'Terrario'}
            </CardTitle>
            <CardDescription>
              Monitoraggio in tempo reale dello stato degli interruttori e automazione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="font-medium">Stato Automazione</h4>
                {automationStartTime ? (
                  <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-green-800">
                          Automazione attiva da: {formatElapsedTime(automationStartTime)}
                        </div>
                        <div className="text-xs text-green-600">Avviata: {automationStartTime.toLocaleString('it-IT')}</div>
                        <div className="text-xs text-green-600">
                          Modalità: {detailedStatus?.simulation_mode ? 'Simulazione' : 'Produzione'}
                        </div>
                        <div className="text-xs text-green-600">Prossima verifica: ogni 5 minuti</div>
                        {detailedStatus?.session_info?.last_evaluation && (
                          <div className="text-xs text-green-600">
                            Ultima valutazione: {new Date(detailedStatus.session_info.last_evaluation).toLocaleString('it-IT')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <div className="text-sm text-gray-600">Automazione non attiva</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Modalità: {detailedStatus?.simulation_mode ? 'Simulazione' : 'Produzione'}
                    </div>
                  </div>
                )}

                {automationSession && (
                  <div className="mt-4 p-3 border rounded-lg bg-blue-50 border-blue-200">
                    <h5 className="text-sm font-medium text-blue-800 mb-2">Dettagli Sessione</h5>
                    <div className="space-y-1 text-xs text-blue-600">
                      <div>ID Sessione: {automationSession.id}</div>
                      <div>Scena: {automationSession.scene_name}</div>
                      <div>Stato: {automationSession.status}</div>
                      <div>Durata: {automationSession.duration_minutes} minuti</div>
                      {automationSession.last_evaluation_at && (
                        <div>Ultima valutazione: {new Date(automationSession.last_evaluation_at).toLocaleString('it-IT')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Stato Interruttori</h4>
                <div className="space-y-2">
                  {detailedStatus?.outlet_states?.map((outlet: any) => (
                    <div key={outlet.outlet_id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium">{outlet.outlet_name}</div>
                          <Badge variant={outlet.state ? "default" : "secondary"}>
                            {outlet.state ? "ON" : "OFF"}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{outlet.explanation}</div>
                    </div>
                  )) || (
                    <div className="text-sm text-gray-600">Nessun interruttore configurato per questa zona</div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Dati Sensori Attuali</h4>
                {detailedStatus?.sensor_data ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4" />
                        <div>
                          <div className="text-lg font-semibold">
                            {detailedStatus.sensor_data.temperature !== null ? `${detailedStatus.sensor_data.temperature}°C` : '--'}
                          </div>
                          <div className="text-xs text-gray-500">Temperatura</div>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4" />
                        <div>
                          <div className="text-lg font-semibold">
                            {detailedStatus.sensor_data.humidity !== null ? `${detailedStatus.sensor_data.humidity}%` : '--'}
                          </div>
                          <div className="text-xs text-gray-500">Umidità</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">Nessun dato sensore disponibile</div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchDetailedStatus} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Aggiorna Status
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
