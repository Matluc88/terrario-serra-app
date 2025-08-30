// src/components/ZoneTabs.tsx
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
const DISABLE_SENSORS = false

interface Zone {
  id: number; slug: string; name: string; mode: string; active: boolean;
  settings: Record<string, unknown>; created_at: string; updated_at?: string
}
interface Device { id:number; provider:string; provider_device_id:string; name:string; zone_id:number; meta:Record<string,unknown> }
interface Outlet { id:number; device_id:number; channel:string; role:string; custom_name:string; enabled:boolean; last_state:boolean }
interface SensorReading {
  sensor_id:number; sensor_name:string;
  temperature:{ value:number|null; unit:string|null; timestamp:string|null };
  humidity:{ value:number|null; unit:string|null; timestamp:string|null };
}
interface Scene { id:number; zone_id:number; name:string; slug:string; settings:Record<string,unknown>; is_active:boolean; created_at:string; updated_at?:string }
interface ZoneTabsProps { zone: Zone; onZoneUpdate: () => void }

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

  const automationRunning = zone?.mode === 'automatic'

  const fetchDevicesAndOutlets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/devices/`)
      const data = await res.json()
      const zoneDevices = data.filter((d: Device) => d.zone_id === zone.id)
      setDevices(zoneDevices)

      const all: Outlet[] = []
      for (const device of zoneDevices) {
        try {
          const r = await fetch(`${API_BASE_URL}/api/v1/devices/${device.id}/outlets`)
          if (r.ok) {
            const j = await r.json()
            all.push(...j.outlets)
          } else {
            for (let i = 1; i <= 5; i++) {
              all.push({ id: device.id*10+i, device_id: device.id, channel:`switch_${i}`, role:i===5?'usb':'outlet', custom_name:i===5?'USB (2A+1C)':`Presa ${i}`, enabled:true, last_state:false })
            }
          }
        } catch {
          for (let i = 1; i <= 5; i++) {
            all.push({ id: device.id*10+i, device_id: device.id, channel:`switch_${i}`, role:i===5?'usb':'outlet', custom_name:i===5?'USB (2A+1C)':`Presa ${i}`, enabled:true, last_state:false })
          }
        }
      }
      setOutlets(all)
    } catch (e) {
      console.error(e)
      setError('Errore nel caricamento dispositivi')
    }
  }, [zone.id])

  // ✅ PATCH: usa endpoint reale /api/v1/sensors/zone/:id
  const fetchSensorData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/sensors/zone/${zone.id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const mapped: SensorReading[] = (Array.isArray(data) ? data : []).map((s: any) => {
        const lr = s.last_readings || {}
        return {
          sensor_id: s.id,
          sensor_name: s.name,
          temperature: {
            value: lr.temperature ?? null,
            unit: lr.temperature != null ? '°C' : null,
            timestamp: lr.temperature_timestamp ?? null,
          },
          humidity: {
            value: lr.humidity ?? null,
            unit: lr.humidity != null ? '%' : null,
            timestamp: lr.humidity_timestamp ?? null,
          },
        }
      })

      setSensorData(mapped)
    } catch (e) {
      console.error(e)
    }
  }, [zone.id])

  const fetchScenes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/scenes/zone/${zone.id}`)
      if (res.ok) setScenes(await res.json())
    } catch (e) { console.error(e) }
  }, [zone.id])

  const fetchDetailedStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/detailed-status`)
      if (res.ok) setDetailedStatus(await res.json())
    } catch (e) { console.error(e) }
  }, [zone.id])

  const fetchAutomationStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/status`)
      if (res.ok) {
        const data = await res.json()
        if (data.has_active_session && data.active_session) {
          setAutomationSession(data.active_session)
          setAutomationTimer(data.active_session.time_remaining_seconds)
          setAutomationStartTime(new Date(data.active_session.started_at))
          const scene = scenes.find(s => s.id === data.active_session.scene_id)
          if (scene) setSelectedScene(scene)
        } else {
          setAutomationSession(null); setAutomationTimer(null); setAutomationStartTime(null)
        }
      }
    } catch (e) { console.error(e) }
  }, [zone.id, scenes])

  const toggleOutlet = async (deviceId: number, outletId: number, state: boolean) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/devices/${deviceId}/outlets/${outletId}/switch?state=${state}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.success) {
        setOutlets(prev => prev.map(o => o.id === outletId ? { ...o, last_state: state } : o))
        onZoneUpdate()
      } else throw new Error(j.error || 'Comando fallito')
    } catch (e:any) {
      setError(e?.message || 'Errore nel controllo dispositivo')
    } finally { setLoading(false) }
  }

  const switchAllZone = async (state: boolean) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/devices/zone/${zone.id}/switch-all?state=${state}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.success) {
        setOutlets(prev => prev.map(o => ({ ...o, last_state: state })))
        onZoneUpdate()
      } else throw new Error(j.error || 'Comando fallito')
    } catch (e:any) {
      setError(e?.message || 'Errore nel controllo zona')
    } finally { setLoading(false) }
  }

  // ---- EFFECTS ----
  useEffect(() => {
    fetchDevicesAndOutlets()
    fetchScenes()

    let intervalId: number | undefined
    if (!DISABLE_SENSORS) {
      fetchSensorData()
      intervalId = window.setInterval(fetchSensorData, 1800000) // 30 min
    }
    return () => { if (intervalId) clearInterval(intervalId) }
  }, [zone.id, fetchDevicesAndOutlets, fetchScenes, fetchSensorData])

  // Polling leggero SOLO quando l’automazione è ON
  useEffect(() => {
    if (!automationRunning) return
    const i = setInterval(() => { fetchDevicesAndOutlets().catch(()=>{}) }, 2000)
    return () => clearInterval(i)
  }, [automationRunning, zone.id, fetchDevicesAndOutlets])

  useEffect(() => {
    if (scenes.length > 0) fetchAutomationStatus()
  }, [scenes, fetchAutomationStatus])

  useEffect(() => {
    if (activeTab === 'status') {
      fetchDetailedStatus()
      const i = setInterval(fetchDetailedStatus, 10000)
      return () => clearInterval(i)
    }
  }, [activeTab, fetchDetailedStatus])

  useEffect(() => {
    if (automationTimer !== null && automationTimer > 0) {
      const i = setInterval(() => {
        setAutomationTimer(prev => {
          if (prev === null || prev <= 1) { setAutomationSession(null); setAutomationStartTime(null); onZoneUpdate(); return null }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(i)
    }
  }, [automationTimer, onZoneUpdate])

  const stopAutomation = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/stop`, { method:'POST' })
      if (res.ok) {
        setAutomationSession(null); setAutomationTimer(null); setAutomationStartTime(null); onZoneUpdate()
        toast({ title:'Successo', description:'Automazione fermata' })
      }
    } catch {
      toast({ title:'Errore', description:"Errore nel fermare l'automazione", variant:'destructive' })
    }
  }

  const runAutomation = async () => {
    if (!selectedScene) return
    setRunningAutomation(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/automation/zone/${zone.id}/start`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ scene_id: selectedScene.id, duration_minutes: AUTOMATION_DURATION_MINUTES })
      })
      if (!res.ok) throw new Error('Errore nell\'avvio automazione')
      const session = await res.json()
      setAutomationSession(session)
      setAutomationTimer(session.time_remaining_seconds)
      setAutomationStartTime(new Date(session.started_at))
      await fetchDevicesAndOutlets()
      onZoneUpdate()
      toast({ title:'Successo', description:`Automazione "${selectedScene.name}" avviata - durata: ${AUTOMATION_DURATION_MINUTES} minuti` })
    } catch {
      toast({ title:'Errore', description:"Errore nell'avvio dell'automazione", variant:'destructive' })
    } finally { setRunningAutomation(false) }
  }

  const formatElapsedTime = (startTime: Date) => {
    const now = new Date()
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days} giorn${days === 1 ? 'o' : 'i'} ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatTimestamp = (t: string | null) => {
    if (!t) return '--'
    try { return new Date(t).toLocaleString('it-IT') } catch { return '--' }
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="manual" className="flex items-center gap-2"><Hand className="h-4 w-4" />Manuale</TabsTrigger>
        <TabsTrigger value="mapping" className="flex items-center gap-2"><Settings className="h-4 w-4" />Mapping</TabsTrigger>
        <TabsTrigger value="scenes" className="flex items-center gap-2"><Settings className="h-4 w-4" />Scene</TabsTrigger>
        <TabsTrigger value="automatic" className="flex items-center gap-2"><Play className="h-4 w-4" />Automatico</TabsTrigger>
        <TabsTrigger value="status" className="flex items-center gap-2"><Activity className="h-4 w-4" />Status</TabsTrigger>
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
                <Button variant="outline" size="sm" onClick={() => switchAllZone(true)} disabled={loading}><Power className="h-4 w-4 mr-1" />Tutto ON</Button>
                <Button variant="outline" size="sm" onClick={() => switchAllZone(false)} disabled={loading}><Power className="h-4 w-4 mr-1" />Tutto OFF</Button>
              </div>
            </CardTitle>
            <CardDescription>Controlla direttamente i dispositivi della {zone.slug === 'serra' ? 'serra' : 'terrario'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2"><Power className="h-4 w-4" />Controllo Prese</h4>
                {devices.map((device) => (
                  <div key={device.id} className="space-y-3">
                    <div className="text-sm font-medium text-gray-700">{device.name}</div>
                    <div className="space-y-2">
                      {outlets.filter(o => o.device_id === device.id).map((outlet) => (
                        <div key={outlet.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-medium">{outlet.custom_name}</div>
                            <Badge variant={outlet.last_state ? "default" : "secondary"}>{outlet.last_state ? "ON" : "OFF"}</Badge>
                          </div>
                          <Switch checked={outlet.last_state} onCheckedChange={(checked) => toggleOutlet(device.id, outlet.id, checked)} disabled={loading || !outlet.enabled} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {devices.length === 0 && (<div className="text-sm text-gray-600">Nessun dispositivo configurato per questa zona</div>)}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium flex items-center gap-2"><Thermometer className="h-4 w-4" />Sensori Ambientali</h4>
                  <Button variant="outline" size="xs" onClick={fetchSensorData}><RefreshCw className="h-3 w-3 mr-1" />Aggiorna</Button>
                </div>
                {sensorData.map((s) => (
                  <div key={s.sensor_id} className="space-y-3 p-4 border rounded-lg">
                    <div className="text-sm font-medium text-gray-700">{s.sensor_name}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4" />
                        <div><div className="text-lg font-semibold">{s.temperature.value !== null ? `${s.temperature.value}${s.temperature.unit}` : '--'}</div><div className="text-xs text-gray-500">Temperatura</div></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4" />
                        <div><div className="text-lg font-semibold">{s.humidity.value !== null ? `${s.humidity.value}${s.humidity.unit}` : '--'}</div><div className="text-xs text-gray-500">Umidità</div></div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">Ultimo aggiornamento: {formatTimestamp(s.temperature.timestamp || s.humidity.timestamp)}</div>
                  </div>
                ))}
                {sensorData.length === 0 && (<div className="text-sm text-gray-600">Nessun sensore configurato per questa zona</div>)}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="mapping" className="space-y-4">
        <MappingInterface zone={zone} outlets={outlets} onConfigUpdate={() => { fetchDevicesAndOutlets(); fetchScenes() }} />
      </TabsContent>

      <TabsContent value="scenes" className="space-y-4">
        <SceneEditor zone={zone} onSceneUpdate={() => { fetchDevicesAndOutlets(); fetchScenes(); onZoneUpdate() }} />
      </TabsContent>

      <TabsContent value="automatic" className="space-y-4">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{zone.slug === 'serra' ? '🌱' : '🐢'} Automazione {zone.slug === 'serra' ? 'Serra' : 'Terrario'}</CardTitle>
              <CardDescription>Seleziona e attiva scene automatiche per la {zone.slug === 'serra' ? 'serra' : 'terrario'}</CardDescription>
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
                    <div className="text-sm text-gray-600">Nessuna scena configurata. Vai al tab Scene per creare una scena.</div>
                  ) : (
                    <Select value={selectedScene?.id.toString() || ''} onValueChange={(v:string) => { const s = scenes.find(x => x.id === parseInt(v)); setSelectedScene(s || null) }}>
                      <SelectTrigger><SelectValue placeholder="Seleziona una scena" /></SelectTrigger>
                      <SelectContent>{scenes.map(s => (<SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>))}</SelectContent>
                    </Select>
                  )}
                </div>

                {selectedScene && (
                  <div className="p-3 border rounded-lg bg-gray-50">
                    <div className="text-sm">
                      <div className="font-medium">{selectedScene.name}</div>
                      <div className="text-gray-600 mt-1">Creata: {new Date(selectedScene.created_at).toLocaleDateString('it-IT')}</div>
                    </div>
                  </div>
                )}

                {automationTimer !== null && (
                  <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-green-800">Automazione attiva da: {automationStartTime ? formatElapsedTime(automationStartTime) : '--'}</div>
                        <div className="text-xs text-green-600">Avviata: {automationStartTime?.toLocaleString('it-IT')}</div>
                        <div className="text-xs text-green-600">Prossima verifica: ogni 5 minuti</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={stopAutomation} className="text-red-600 border-red-200 hover:bg-red-50">Ferma</Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchScenes} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Aggiorna Scene</Button>
                  <Button size="sm" onClick={runAutomation} disabled={!selectedScene || runningAutomation || automationTimer !== null}>
                    {runningAutomation ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Avvio...</>) :
                     automationTimer !== null ? (<><div className="h-4 w-4 bg-green-500 rounded-full mr-2"></div>In Esecuzione</>) :
                     (<><Play className="h-4 w-4 mr-2" />Run Automazione</>)}
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
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Status Automazione {zone.slug === 'serra' ? 'Serra' : 'Terrario'}</CardTitle>
            <CardDescription>Monitoraggio in tempo reale dello stato degli interruttori e automazione</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="font-medium">Stato Automazione</h4>
                {automationStartTime ? (
                  <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                    <div className="text-sm font-medium text-green-800">Automazione attiva da: {formatElapsedTime(automationStartTime)}</div>
                    <div className="text-xs text-green-600">Avviata: {automationStartTime.toLocaleString('it-IT')}</div>
                    <div className="text-xs text-green-600">Modalità: {detailedStatus?.simulation_mode ? 'Simulazione' : 'Produzione'}</div>
                    <div className="text-xs text-green-600">Prossima verifica: ogni 5 minuti</div>
                    {detailedStatus?.session_info?.last_evaluation && (
                      <div className="text-xs text-green-600">Ultima valutazione: {new Date(detailedStatus.session_info.last_evaluation).toLocaleString('it-IT')}</div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <div className="text-sm text-gray-600">Automazione non attiva</div>
                    <div className="text-xs text-gray-500 mt-1">Modalità: {detailedStatus?.simulation_mode ? 'Simulazione' : 'Produzione'}</div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Stato Interruttori</h4>
                <div className="space-y-2">
                  {detailedStatus?.outlet_states?.map((o: any) => (
                    <div key={o.outlet_id} className="p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium">{o.outlet_name}</div>
                        <Badge variant={o.state ? "default" : "secondary"}>{o.state ? "ON" : "OFF"}</Badge>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{o.explanation}</div>
                    </div>
                  )) ?? (<div className="text-sm text-gray-600">Nessun interruttore configurato per questa zona</div>)}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Dati Sensori Attuali</h4>
                {detailedStatus?.sensor_data ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border rounded-lg"><div className="flex items-center gap-2"><Thermometer className="h-4 w-4" /><div><div className="text-lg font-semibold">{detailedStatus.sensor_data.temperature !== null ? `${detailedStatus.sensor_data.temperature}°C` : '--'}</div><div className="text-xs text-gray-500">Temperatura</div></div></div></div>
                    <div className="p-3 border rounded-lg"><div className="flex items-center gap-2"><Droplets className="h-4 w-4" /><div><div className="text-lg font-semibold">{detailedStatus.sensor_data.humidity !== null ? `${detailedStatus.sensor_data.humidity}%` : '--'}</div><div className="text-xs text-gray-500">Umidità</div></div></div></div>
                  </div>
                ) : (<div className="text-sm text-gray-600">Nessun dato sensore disponibile</div>)}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchDetailedStatus} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Aggiorna Status</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
