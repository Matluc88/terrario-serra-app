import { useState, useEffect, useCallback, useRef } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Settings, Play, Hand, Power, Thermometer, Droplets, AlertTriangle, RefreshCw } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import MappingInterface from './MappingInterface'

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
  const [automationTimer, setAutomationTimer] = useState<number | null>(null)
  const [automationStartTime, setAutomationStartTime] = useState<Date | null>(null)
  const AUTOMATION_DURATION_MINUTES = 15
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchDevicesAndOutlets = useCallback(async () => {
    try {
      console.log(`Fetching devices for zone ${zone.id}`)
      const devicesResponse = await fetch(`${API_BASE_URL}/api/v1/devices/`)
      const devicesData = await devicesResponse.json()
      const zoneDevices = devicesData.filter((d: Device) => d.zone_id === zone.id)
      console.log(`Zone ${zone.id} devices:`, zoneDevices)
      console.log(`Zone ${zone.id} devices length:`, zoneDevices.length)
      setDevices(zoneDevices)

      const allOutlets: Outlet[] = []
      for (const device of zoneDevices) {
        try {
          console.log(`Fetching outlets for device ${device.id}`)
          const outletsResponse = await fetch(`${API_BASE_URL}/api/v1/devices/${device.id}/outlets`)
          if (outletsResponse.ok) {
            const outletsData = await outletsResponse.json()
            console.log(`Device ${device.id} outlets:`, outletsData.outlets)
            allOutlets.push(...outletsData.outlets)
          } else {
            console.warn(`Failed to fetch outlets for device ${device.id}, using fallback`)
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
        } catch (error) {
          console.error(`Error fetching outlets for device ${device.id}:`, error)
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
      console.log(`Total outlets for zone ${zone.id}:`, allOutlets)
      console.log(`Total outlets length for zone ${zone.id}:`, allOutlets.length)
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

  const switchOutlet = async (deviceId: number, outletId: number, state: boolean) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/devices/${deviceId}/outlets/${outletId}/switch?state=${state}`,
        { method: 'POST' }
      )
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        setOutlets(prev => prev.map(outlet => 
          outlet.id === outletId 
            ? { ...outlet, last_state: state }
            : outlet
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
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
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

  const startAutomationTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
    }
    
    const startTime = new Date()
    setAutomationStartTime(startTime)
    setAutomationTimer(AUTOMATION_DURATION_MINUTES * 60)
    
    timerIntervalRef.current = setInterval(() => {
      setAutomationTimer(prev => {
        if (prev === null || prev <= 1) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
          }
          setAutomationStartTime(null)
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  const stopAutomationTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    setAutomationTimer(null)
    setAutomationStartTime(null)
  }

  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const runAutomation = async () => {
    if (!selectedScene) return
    
    setRunningAutomation(true)
    startAutomationTimer()
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${selectedScene.id}/evaluate`, {
        method: 'POST'
      })
      
      if (response.ok) {
        await fetchDevicesAndOutlets()
        toast({
          title: "Successo",
          description: `Automazione "${selectedScene.name}" avviata - durata: ${AUTOMATION_DURATION_MINUTES} minuti`
        })
      } else {
        throw new Error('Errore nell\'esecuzione automazione')
      }
    } catch (err) {
      console.error('Error running automation:', err)
      toast({
        title: "Errore",
        description: "Errore nell'esecuzione dell'automazione",
        variant: "destructive"
      })
      stopAutomationTimer()
    } finally {
      setRunningAutomation(false)
    }
  }

  useEffect(() => {
    fetchDevicesAndOutlets()
    fetchSensorData()
    fetchScenes()
    
    const interval = setInterval(fetchSensorData, 1800000)
    return () => clearInterval(interval)
  }, [zone.id, fetchDevicesAndOutlets, fetchSensorData, fetchScenes])

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

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
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="manual" className="flex items-center gap-2">
          <Hand className="h-4 w-4" />
          Manuale
        </TabsTrigger>
        <TabsTrigger value="mapping" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Mapping
        </TabsTrigger>
        <TabsTrigger value="automatic" className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          Automatico
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
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => switchAllZone(true)}
                  disabled={loading}
                >
                  <Power className="h-4 w-4 mr-1" />
                  Tutto ON
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => switchAllZone(false)}
                  disabled={loading}
                >
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
                
                {(() => {
                  console.log('Rendering devices:', devices, 'length:', devices.length)
                  console.log('Outlets state:', outlets, 'length:', outlets.length)
                  devices.forEach(d => console.log(`Device ID: ${d.id}, Name: ${d.name}`))
                  outlets.forEach(o => console.log(`Outlet ID: ${o.id}, Device ID: ${o.device_id}, Channel: ${o.channel}, Name: ${o.custom_name}`))
                  return devices.map((device) => (
                  <div key={device.id} className="space-y-3">
                    <div className="text-sm font-medium text-gray-700">
                      {device.name}
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const deviceOutlets = outlets.filter(outlet => outlet.device_id === device.id)
                        console.log(`Device ${device.id} filtered outlets:`, deviceOutlets, 'length:', deviceOutlets.length)
                        return deviceOutlets.map((outlet) => (
                          <div key={outlet.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">
                                {outlet.custom_name}
                              </div>
                              <Badge variant={outlet.last_state ? "default" : "secondary"}>
                                {outlet.last_state ? "ON" : "OFF"}
                              </Badge>
                            </div>
                            <Switch
                              checked={outlet.last_state}
                              onCheckedChange={(checked) => switchOutlet(device.id, outlet.id, checked)}
                              disabled={loading || !outlet.enabled}
                            />
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                ))
                })()}
                
                {devices.length === 0 && (
                  <div className="text-sm text-gray-600">
                    Nessun dispositivo configurato per questa zona
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Thermometer className="h-4 w-4" />
                  Sensori Ambientali
                </h4>
                
                {sensorData.map((sensor) => (
                  <div key={sensor.sensor_id} className="space-y-3 p-4 border rounded-lg">
                    <div className="text-sm font-medium text-gray-700">
                      {sensor.sensor_name}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4 text-red-500" />
                        <div>
                          <div className="text-lg font-semibold">
                            {sensor.temperature.value !== null 
                              ? `${sensor.temperature.value}${sensor.temperature.unit}` 
                              : '--'}
                          </div>
                          <div className="text-xs text-gray-500">Temperatura</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-blue-500" />
                        <div>
                          <div className="text-lg font-semibold">
                            {sensor.humidity.value !== null 
                              ? `${sensor.humidity.value}${sensor.humidity.unit}` 
                              : '--'}
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
                  <div className="text-sm text-gray-600">
                    Nessun sensore configurato per questa zona
                  </div>
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
                  <Badge variant={automationTimer !== null ? 'default' : 'secondary'}>
                    {automationTimer !== null 
                      ? `In Esecuzione (${formatTimeRemaining(automationTimer)})` 
                      : 'Inattiva'}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Scene Disponibili:</h4>
                  {scenes.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      Nessuna scena configurata. Vai al tab Mapping per creare una scena.
                    </div>
                  ) : (
                    <Select value={selectedScene?.id.toString() || ''} onValueChange={(value: string) => {
                      const scene = scenes.find((s: Scene) => s.id === parseInt(value))
                      setSelectedScene(scene || null)
                    }}>
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
                          Automazione in corso
                        </div>
                        <div className="text-lg font-bold text-green-900">
                          {formatTimeRemaining(automationTimer)}
                        </div>
                        <div className="text-xs text-green-600">
                          Avviata: {automationStartTime?.toLocaleTimeString('it-IT')}
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={stopAutomationTimer}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Ferma
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchScenes}
                    disabled={loading}
                  >
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
    </Tabs>
  )
}
