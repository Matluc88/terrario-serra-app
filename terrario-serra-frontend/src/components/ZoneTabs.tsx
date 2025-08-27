import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Play, Hand, Power, Thermometer, Droplets, AlertTriangle, RefreshCw, Activity, CheckCircle, XCircle, Edit } from 'lucide-react'
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

interface SceneRule {
  id: number
  scene_id: number
  name: string
  condition: {
    condition: string
    operator: string
    value: number
  }
  action: {
    on: Record<string, boolean>
    off: Record<string, boolean>
  }
  priority: number
}

interface RuleEvaluation {
  rule_id: number
  rule_name: string
  condition_met: boolean
  action_result?: any
  error?: string
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
  const [, setAutomationSession] = useState<any | null>(null)
  const [automationTimer, setAutomationTimer] = useState<number | null>(null)
  const [automationStartTime, setAutomationStartTime] = useState<Date | null>(null)
  const [sceneRules, setSceneRules] = useState<SceneRule[]>([])
  const [ruleEvaluations, setRuleEvaluations] = useState<RuleEvaluation[]>([])
  const [activeScene, setActiveScene] = useState<Scene | null>(null)
  const [editingScene, setEditingScene] = useState(false)
  const [sceneEditData, setSceneEditData] = useState({
    name: '',
    tempMin: '',
    tempMax: '',
    humidityMin: '',
    humidityMax: ''
  })
  const AUTOMATION_DURATION_MINUTES = 15

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

  const fetchSceneRules = useCallback(async (sceneId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${sceneId}/rules`)
      if (response.ok) {
        const rules = await response.json()
        setSceneRules(rules)
      }
    } catch (err) {
      console.error('Error fetching scene rules:', err)
    }
  }, [])

  const evaluateSceneRules = useCallback(async (sceneId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${sceneId}/evaluate`, {
        method: 'POST'
      })
      if (response.ok) {
        const evaluation = await response.json()
        setRuleEvaluations(evaluation.executed_actions || [])
      }
    } catch (err) {
      console.error('Error evaluating scene rules:', err)
    }
  }, [])

  const fetchActiveScene = useCallback(async () => {
    try {
      const activeSceneFromList = scenes.find(scene => scene.is_active)
      if (activeSceneFromList) {
        setActiveScene(activeSceneFromList)
        await fetchSceneRules(activeSceneFromList.id)
        await evaluateSceneRules(activeSceneFromList.id)
        const tempRange = activeSceneFromList.settings?.temperature_range as { min?: number; max?: number } | undefined
        const humidityRange = activeSceneFromList.settings?.humidity_range as { min?: number; max?: number } | undefined
        setSceneEditData({
          name: activeSceneFromList.name,
          tempMin: tempRange?.min?.toString() || '',
          tempMax: tempRange?.max?.toString() || '',
          humidityMin: humidityRange?.min?.toString() || '',
          humidityMax: humidityRange?.max?.toString() || ''
        })
      } else {
        setActiveScene(null)
        setSceneRules([])
        setRuleEvaluations([])
      }
    } catch (err) {
      console.error('Error fetching active scene:', err)
    }
  }, [scenes, fetchSceneRules, evaluateSceneRules])

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
        toast({
          title: "Successo",
          description: "Automazione fermata"
        })
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

  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const runAutomation = async () => {
    if (!selectedScene) return
    
    setRunningAutomation(true)
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        throw new Error('Errore nell\'avvio automazione')
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

  useEffect(() => {
    fetchDevicesAndOutlets()
    fetchSensorData()
    fetchScenes()
    
    const interval = setInterval(fetchSensorData, 1800000)
    return () => clearInterval(interval)
  }, [zone.id, fetchDevicesAndOutlets, fetchSensorData, fetchScenes])

  useEffect(() => {
    if (scenes.length > 0) {
      fetchActiveScene()
    }
  }, [scenes, fetchActiveScene])

  useEffect(() => {
    if (scenes.length > 0) {
      fetchAutomationStatus()
    }
  }, [scenes, fetchAutomationStatus])

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

  useEffect(() => {
    if (scenes.length > 0) {
      fetchAutomationStatus()
    }
  }, [scenes, fetchAutomationStatus])

  useEffect(() => {
    if (automationTimer !== null && automationTimer > 0) {
      const interval = setInterval(() => {
        setAutomationTimer(prev => {
          if (prev === null || prev <= 1) {
            setAutomationSession(null)
            setAutomationStartTime(null)
            return null
          }
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [automationTimer])


  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '--'
    try {
      return new Date(timestamp).toLocaleString('it-IT')
    } catch {
      return '--'
    }
  }

  const getOutletExplanation = (outlet: Outlet) => {
    if (!sensorData.length || !activeScene) {
      return outlet.last_state ? "Acceso" : "Spento"
    }

    const currentTemp = sensorData[0]?.temperature?.value
    const currentHumidity = sensorData[0]?.humidity?.value
    
    if (currentTemp === null || currentHumidity === null) {
      return outlet.last_state ? "Acceso" : "Spento"
    }

    const tempRange = activeScene.settings?.temperature_range as { min?: number; max?: number } | undefined
    const humidityRange = activeScene.settings?.humidity_range as { min?: number; max?: number } | undefined

    const deviceName = outlet.custom_name?.toLowerCase() || ''
    
    if (deviceName.includes('condizionatore') || deviceName.includes('raffrescatore')) {
      if (tempRange?.max && currentTemp <= tempRange.max) {
        return "Spento - Temperatura nella soglia ottimale"
      } else if (tempRange?.max && currentTemp > tempRange.max) {
        return "Acceso - Temperatura sopra soglia massima"
      }
    }
    
    if (deviceName.includes('riscaldatore') || deviceName.includes('termoriscaldatore')) {
      if (tempRange?.min && currentTemp >= tempRange.min) {
        return "Spento - Temperatura nella soglia ottimale"
      } else if (tempRange?.min && currentTemp < tempRange.min) {
        return "Acceso - Temperatura sotto soglia minima"
      }
    }
    
    if (deviceName.includes('umidificatore')) {
      if (humidityRange?.min && currentHumidity >= humidityRange.min) {
        return "Spento - Umidità nella soglia corretta"
      } else if (humidityRange?.min && currentHumidity < humidityRange.min) {
        return "Acceso - Umidità sotto soglia minima"
      }
    }
    
    if (deviceName.includes('deumidificatore')) {
      if (humidityRange?.max && currentHumidity <= humidityRange.max) {
        return "Spento - Umidità nella soglia corretta"
      } else if (humidityRange?.max && currentHumidity > humidityRange.max) {
        return "Acceso - Umidità sopra soglia massima"
      }
    }

    return outlet.last_state ? "Acceso" : "Spento"
  }

  const saveSceneChanges = async () => {
    if (!activeScene) return

    try {
      setLoading(true)
      const updateData = {
        name: sceneEditData.name,
        slug: activeScene.slug,
        settings: {
          ...activeScene.settings,
          temperature_range: {
            min: parseFloat(sceneEditData.tempMin) || 0,
            max: parseFloat(sceneEditData.tempMax) || 0
          },
          humidity_range: {
            min: parseFloat(sceneEditData.humidityMin) || 0,
            max: parseFloat(sceneEditData.humidityMax) || 0
          }
        },
        is_active: activeScene.is_active
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${activeScene.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        const updatedScene = await response.json()
        setActiveScene(updatedScene)
        setEditingScene(false)
        await fetchScenes()
        toast({
          title: "Successo",
          description: "Scena aggiornata con successo"
        })
      } else {
        throw new Error('Errore nell\'aggiornamento della scena')
      }
    } catch (err) {
      console.error('Error updating scene:', err)
      toast({
        title: "Errore",
        description: "Errore nell'aggiornamento della scena",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }



  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
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
                        onClick={stopAutomation}
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

      <TabsContent value="status" className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Status {zone.slug === 'serra' ? 'Serra' : 'Terrario'}
              </CardTitle>
              <CardDescription>
                Panoramica completa dello stato attuale della {zone.slug === 'serra' ? 'serra' : 'terrario'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Power className="h-4 w-4" />
                    Stato Dispositivi
                  </h4>
                  
                  {devices.map((device) => (
                    <div key={device.id} className="space-y-3">
                      <div className="text-sm font-medium text-gray-700">
                        {device.name}
                      </div>
                      <div className="space-y-2">
                        {outlets.filter(outlet => outlet.device_id === device.id).map((outlet) => (
                          <div key={outlet.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">
                                {outlet.custom_name}
                              </div>
                              <Badge variant={outlet.last_state ? "default" : "secondary"}>
                                {outlet.last_state ? "ON" : "OFF"}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-600 max-w-xs text-right">
                              {getOutletExplanation(outlet)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {devices.length === 0 && (
                    <div className="text-sm text-gray-600">
                      Nessun dispositivo configurato per questa zona
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {activeScene && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Scena Attiva: {activeScene.name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingScene(!editingScene)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {editingScene ? 'Annulla' : 'Modifica'}
                  </Button>
                </CardTitle>
                <CardDescription>
                  Configurazione e regole della scena attualmente attiva
                </CardDescription>
              </CardHeader>
              <CardContent>
                {editingScene ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="scene-name">Nome Scena</Label>
                        <Input
                          id="scene-name"
                          value={sceneEditData.name}
                          onChange={(e) => setSceneEditData(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Nome della scena"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="temp-min">Temp. Min (°C)</Label>
                        <Input
                          id="temp-min"
                          type="number"
                          value={sceneEditData.tempMin}
                          onChange={(e) => setSceneEditData(prev => ({ ...prev, tempMin: e.target.value }))}
                          placeholder="20"
                        />
                      </div>
                      <div>
                        <Label htmlFor="temp-max">Temp. Max (°C)</Label>
                        <Input
                          id="temp-max"
                          type="number"
                          value={sceneEditData.tempMax}
                          onChange={(e) => setSceneEditData(prev => ({ ...prev, tempMax: e.target.value }))}
                          placeholder="25"
                        />
                      </div>
                      <div>
                        <Label htmlFor="humidity-min">Umidità Min (%)</Label>
                        <Input
                          id="humidity-min"
                          type="number"
                          value={sceneEditData.humidityMin}
                          onChange={(e) => setSceneEditData(prev => ({ ...prev, humidityMin: e.target.value }))}
                          placeholder="60"
                        />
                      </div>
                      <div>
                        <Label htmlFor="humidity-max">Umidità Max (%)</Label>
                        <Input
                          id="humidity-max"
                          type="number"
                          value={sceneEditData.humidityMax}
                          onChange={(e) => setSceneEditData(prev => ({ ...prev, humidityMax: e.target.value }))}
                          placeholder="80"
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button onClick={saveSceneChanges} disabled={loading}>
                        {loading ? 'Salvando...' : 'Salva Modifiche'}
                      </Button>
                      <Button variant="outline" onClick={() => setEditingScene(false)}>
                        Annulla
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-gray-600">Temperatura</div>
                        <div className="font-semibold">
                          {(() => {
                            const tempRange = activeScene.settings?.temperature_range as { min?: number; max?: number } | undefined
                            return tempRange ? 
                              `${tempRange.min}°C - ${tempRange.max}°C` : 
                              'Non configurata'
                          })()}
                        </div>
                      </div>
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-gray-600">Umidità</div>
                        <div className="font-semibold">
                          {(() => {
                            const humidityRange = activeScene.settings?.humidity_range as { min?: number; max?: number } | undefined
                            return humidityRange ? 
                              `${humidityRange.min}% - ${humidityRange.max}%` : 
                              'Non configurata'
                          })()}
                        </div>
                      </div>
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-gray-600">Stato</div>
                        <div className="font-semibold">
                          <Badge variant={activeScene.is_active ? "default" : "secondary"}>
                            {activeScene.is_active ? "Attiva" : "Inattiva"}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-gray-600">Creata</div>
                        <div className="font-semibold text-sm">
                          {new Date(activeScene.created_at).toLocaleDateString('it-IT')}
                        </div>
                      </div>
                    </div>

                    {sceneRules.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="font-medium">Regole Attive</h5>
                        {sceneRules.map((rule) => {
                          const evaluation = ruleEvaluations.find(evalItem => evalItem.rule_id === rule.id)
                          return (
                            <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium">{rule.name}</div>
                                <Badge variant={evaluation?.condition_met ? "default" : "secondary"}>
                                  {evaluation?.condition_met ? (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                  ) : (
                                    <XCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {evaluation?.condition_met ? "Attiva" : "Inattiva"}
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-600">
                                {rule.condition.condition} {rule.condition.operator} {rule.condition.value}
                                {rule.condition.condition === 'temperature' ? '°C' : '%'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!activeScene && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Nessuna Scena Attiva
                </CardTitle>
                <CardDescription>
                  Non ci sono scene attive per questa zona. Vai al tab Mapping per creare e attivare una scena.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
