import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, Save, RotateCcw, Play, Plus, X, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const API_BASE_URL = (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL || 'http://localhost:8001'

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

interface Outlet {
  id: number
  device_id: number
  channel: string
  role?: string
  custom_name?: string
  enabled: boolean
  last_state: boolean
}

interface OutletConfig {
  name: string
  type: string
}

interface Rule {
  condition: string
  operator: string
  value: number
  actions: {
    on: Record<number, boolean>
    off: Record<number, boolean>
  }
}

interface MappingInterfaceProps {
  zone: Zone
  outlets: Outlet[]
  onConfigUpdate: () => void
}

export default function MappingInterface({ zone, outlets, onConfigUpdate }: MappingInterfaceProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTestDialog, setShowTestDialog] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [sceneName, setSceneName] = useState('')

  const [tempMin, setTempMin] = useState('')
  const [tempMax, setTempMax] = useState('')
  const [humidityMin, setHumidityMin] = useState('')
  const [humidityMax, setHumidityMax] = useState('')
  
  const [plantsAnimals, setPlantsAnimals] = useState<string[]>([])
  const [newPlantAnimal, setNewPlantAnimal] = useState('')
  const [habitatType, setHabitatType] = useState('')
  
  const [outletConfigs, setOutletConfigs] = useState<Record<number, OutletConfig>>({})
  const [outletTypes, setOutletTypes] = useState<Record<string, Array<{value: string, label: string}>>>({})
  
  const [rules, setRules] = useState<{
    tempLow: Rule
    tempHigh: Rule
    humidityLow: Rule
    humidityHigh: Rule
  }>({
    tempLow: { condition: 'temperature', operator: '<=', value: 0, actions: { on: {}, off: {} } },
    tempHigh: { condition: 'temperature', operator: '>=', value: 0, actions: { on: {}, off: {} } },
    humidityLow: { condition: 'humidity', operator: '<=', value: 0, actions: { on: {}, off: {} } },
    humidityHigh: { condition: 'humidity', operator: '>=', value: 0, actions: { on: {}, off: {} } }
  })

  const getOutletDisplayName = (outlet: Outlet, index: number) => {
    return outletConfigs[outlet.id]?.name || `Switch${index + 1}`
  }

  const fetchOutletTypes = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/devices/outlet-types`)
      const data = await response.json()
      setOutletTypes(data)
    } catch (err) {
      console.error('Error fetching outlet types:', err)
    }
  }, [])

  const refreshAllData = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchOutletTypes(),
        onConfigUpdate()
      ])
      toast({
        title: "Successo",
        description: "Dati aggiornati con successo"
      })
    } catch (err) {
      console.error('Error refreshing data:', err)
      setError('Errore durante l\'aggiornamento dei dati')
      toast({
        title: "Errore",
        description: "Errore durante l'aggiornamento dei dati",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [fetchOutletTypes, onConfigUpdate, toast])

  const updateOutletConfig = (outletId: number, field: 'name' | 'type', value: string) => {
    setOutletConfigs(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: value
      }
    }))
  }

  const updateRule = (ruleType: keyof typeof rules, actionType: 'on' | 'off', outletId: number, checked: boolean) => {
    setRules(prev => ({
      ...prev,
      [ruleType]: {
        ...prev[ruleType],
        actions: {
          ...prev[ruleType].actions,
          [actionType]: {
            ...prev[ruleType].actions[actionType],
            [outletId]: checked
          }
        }
      }
    }))
  }

  const addPlantAnimal = () => {
    if (newPlantAnimal.trim()) {
      setPlantsAnimals(prev => [...prev, newPlantAnimal.trim()])
      setNewPlantAnimal('')
    }
  }

  const removePlantAnimal = (index: number) => {
    setPlantsAnimals(prev => prev.filter((_, i) => i !== index))
  }

  const saveOutletConfig = async (outletId: number) => {
    const config = outletConfigs[outletId]
    if (!config) return

    try {
      const outlet = outlets.find(o => o.id === outletId)
      if (!outlet) return

      const response = await fetch(`${API_BASE_URL}/api/v1/devices/${outlet.device_id}/outlets/${outletId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_name: config.name,
          role: config.type
        })
      })

      if (response.ok) {
        toast({
          title: "Successo",
          description: "Configurazione outlet salvata"
        })
        onConfigUpdate()
      }
    } catch (err) {
      console.error('Error saving outlet config:', err)
      toast({
        title: "Errore",
        description: "Errore nel salvataggio configurazione",
        variant: "destructive"
      })
    }
  }

  const saveConfiguration = async () => {
    if (!sceneName.trim()) {
      setShowSaveDialog(true)
      return
    }

    setLoading(true)
    try {
      const configData = {
        zone_id: zone.id,
        name: sceneName,
        slug: `${sceneName.toLowerCase().replace(/\s+/g, '-')}-${zone.slug}-${Date.now()}`,
        plants_animals: plantsAnimals,
        habitat_type: habitatType,
        temperature_range: tempMin && tempMax ? { min: parseFloat(tempMin), max: parseFloat(tempMax) } : null,
        humidity_range: humidityMin && humidityMax ? { min: parseFloat(humidityMin), max: parseFloat(humidityMax) } : null,
        settings: {
          rules: rules,
          outlet_configs: outletConfigs
        },
        is_active: false
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/zone/${zone.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      })

      if (response.ok) {
        toast({
          title: "Successo",
          description: `Scena "${sceneName}" salvata con successo`
        })
        setSceneName('')
        setShowSaveDialog(false)
        onConfigUpdate?.()
      } else {
        throw new Error('Errore nel salvataggio')
      }
    } catch (err) {
      console.error('Error saving configuration:', err)
      toast({
        title: "Errore",
        description: "Errore nel salvataggio configurazione",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const resetConfiguration = () => {
    setTempMin('')
    setTempMax('')
    setHumidityMin('')
    setHumidityMax('')
    setPlantsAnimals([])
    setHabitatType('')
    setOutletConfigs({})
    setRules({
      tempLow: { condition: 'temperature', operator: '<=', value: 0, actions: { on: {}, off: {} } },
      tempHigh: { condition: 'temperature', operator: '>=', value: 0, actions: { on: {}, off: {} } },
      humidityLow: { condition: 'humidity', operator: '<=', value: 0, actions: { on: {}, off: {} } },
      humidityHigh: { condition: 'humidity', operator: '>=', value: 0, actions: { on: {}, off: {} } }
    })
  }

  const testRules = () => {
    setShowTestDialog(true)
  }

  useEffect(() => {
    fetchOutletTypes()
    
    outlets.forEach(outlet => {
      if (!outletConfigs[outlet.id]) {
        setOutletConfigs(prev => ({
          ...prev,
          [outlet.id]: {
            name: outlet.custom_name || '',
            type: outlet.role || ''
          }
        }))
      }
    })

    if (zone.slug === 'serra') {
      setTempMin('20')
      setTempMax('26')
      setHumidityMin('55')
      setHumidityMax('70')
      setHabitatType('idroponica')
    } else {
      setTempMin('24')
      setTempMax('30')
      setHumidityMin('40')
      setHumidityMax('65')
      setHabitatType('tropicale')
    }
  }, [zone.slug, outlets, fetchOutletTypes, outletConfigs])

  const zoneIcon = zone.slug === 'serra' ? '🌱' : '🦎'
  const zoneTitle = zone.slug === 'serra' ? 'SERRA' : 'TERRARIO'
  const currentOutletTypes = outletTypes[zone.slug] || []

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🎯 TAB MAPPING</span>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAllData}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Aggiorna Generale
            </Button>
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {zoneIcon} SEZIONE {zoneTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {zone.slug === 'serra' ? '🌱 PIANTE ATTUALMENTE COLTIVATE:' : '🐍 ANIMALI ATTUALMENTE OSPITATI:'}
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {plantsAnimals.map((item, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {item}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removePlantAnimal(index)} />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newPlantAnimal}
                  onChange={(e) => setNewPlantAnimal(e.target.value)}
                  placeholder={zone.slug === 'serra' ? 'Nome pianta' : 'Nome animale'}
                  onKeyPress={(e) => e.key === 'Enter' && addPlantAnimal()}
                />
                <Button onClick={addPlantAnimal} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                {zone.slug === 'serra' ? '🌿 TIPO COLTURA:' : '🏠 TIPO HABITAT:'}
              </Label>
              <div className="flex gap-4">
                {zone.slug === 'serra' ? (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="habitat"
                        value="idroponica"
                        checked={habitatType === 'idroponica'}
                        onChange={(e) => setHabitatType(e.target.value)}
                      />
                      Idroponica
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="habitat"
                        value="vaso-terra"
                        checked={habitatType === 'vaso-terra'}
                        onChange={(e) => setHabitatType(e.target.value)}
                      />
                      Vaso/Terra
                    </label>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="habitat"
                        value="tropicale"
                        checked={habitatType === 'tropicale'}
                        onChange={(e) => setHabitatType(e.target.value)}
                      />
                      Tropicale
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="habitat"
                        value="desertico"
                        checked={habitatType === 'desertico'}
                        onChange={(e) => setHabitatType(e.target.value)}
                      />
                      Desertico
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="habitat"
                        value="temperato"
                        checked={habitatType === 'temperato'}
                        onChange={(e) => setHabitatType(e.target.value)}
                      />
                      Temperato
                    </label>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Label>🎯 RANGE VALORI DESIDERATI:</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Label>Temperatura:</Label>
                  <Input
                    type="number"
                    value={tempMin}
                    onChange={(e) => setTempMin(e.target.value)}
                    className="w-16"
                    placeholder="20"
                  />
                  <span>-</span>
                  <Input
                    type="number"
                    value={tempMax}
                    onChange={(e) => setTempMax(e.target.value)}
                    className="w-16"
                    placeholder="26"
                  />
                  <span>°C</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Umidità:</Label>
                  <Input
                    type="number"
                    value={humidityMin}
                    onChange={(e) => setHumidityMin(e.target.value)}
                    className="w-16"
                    placeholder="55"
                  />
                  <span>-</span>
                  <Input
                    type="number"
                    value={humidityMax}
                    onChange={(e) => setHumidityMax(e.target.value)}
                    className="w-16"
                    placeholder="70"
                  />
                  <span>%</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label>🔌 ASSEGNAZIONE NOMI SWITCH:</Label>
              {outlets.map((outlet, index) => (
                <div key={outlet.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <span className="min-w-[80px]">Switch{index + 1}:</span>
                  <Input
                    value={outletConfigs[outlet.id]?.name || ''}
                    onChange={(e) => updateOutletConfig(outlet.id, 'name', e.target.value)}
                    className="flex-1"
                    placeholder="Nome personalizzato"
                  />
                  <span>→ Tipo:</span>
                  <Select
                    value={outletConfigs[outlet.id]?.type || ''}
                    onValueChange={(value) => updateOutletConfig(outlet.id, 'type', value)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Seleziona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentOutletTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveOutletConfig(outlet.id)}
                  >
                    Salva
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <Label>⚙️ CONDIZIONI:</Label>
              
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="font-medium">📐 TEMPERATURA:</Label>
                  
                  <div className="space-y-3 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span>Se T ≤</span>
                      <Input
                        type="number"
                        value={tempMin}
                        onChange={(e) => {
                          setTempMin(e.target.value)
                          setRules(prev => ({
                            ...prev,
                            tempLow: { ...prev.tempLow, value: parseFloat(e.target.value) || 0 }
                          }))
                        }}
                        className="w-16"
                      />
                      <span>°C →</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium">Accendi:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`temp-low-on-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.tempLow.actions.on[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('tempLow', 'on', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Spegni:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`temp-low-off-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.tempLow.actions.off[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('tempLow', 'off', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span>Se T ≥</span>
                      <Input
                        type="number"
                        value={tempMax}
                        onChange={(e) => {
                          setTempMax(e.target.value)
                          setRules(prev => ({
                            ...prev,
                            tempHigh: { ...prev.tempHigh, value: parseFloat(e.target.value) || 0 }
                          }))
                        }}
                        className="w-16"
                      />
                      <span>°C →</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium">Accendi:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`temp-high-on-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.tempHigh.actions.on[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('tempHigh', 'on', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Spegni:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`temp-high-off-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.tempHigh.actions.off[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('tempHigh', 'off', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="font-medium">💧 UMIDITÀ:</Label>
                  
                  <div className="space-y-3 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span>Se UR ≤</span>
                      <Input
                        type="number"
                        value={humidityMin}
                        onChange={(e) => {
                          setHumidityMin(e.target.value)
                          setRules(prev => ({
                            ...prev,
                            humidityLow: { ...prev.humidityLow, value: parseFloat(e.target.value) || 0 }
                          }))
                        }}
                        className="w-16"
                      />
                      <span>% →</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium">Accendi:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`humidity-low-on-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.humidityLow.actions.on[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('humidityLow', 'on', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Spegni:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`humidity-low-off-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.humidityLow.actions.off[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('humidityLow', 'off', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span>Se UR ≥</span>
                      <Input
                        type="number"
                        value={humidityMax}
                        onChange={(e) => {
                          setHumidityMax(e.target.value)
                          setRules(prev => ({
                            ...prev,
                            humidityHigh: { ...prev.humidityHigh, value: parseFloat(e.target.value) || 0 }
                          }))
                        }}
                        className="w-16"
                      />
                      <span>% →</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium">Accendi:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`humidity-high-on-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.humidityHigh.actions.on[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('humidityHigh', 'on', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Spegni:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {outlets.map((outlet, index) => (
                            <label key={`humidity-high-off-${outlet.id}`} className="flex items-center gap-1 text-sm">
                              <Checkbox
                                checked={rules.humidityHigh.actions.off[outlet.id] || false}
                                onCheckedChange={(checked) => updateRule('humidityHigh', 'off', outlet.id, checked as boolean)}
                              />
                              {getOutletDisplayName(outlet, index)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button onClick={saveConfiguration} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Salva Configurazione {zoneTitle}
              </Button>
              <Button variant="outline" onClick={resetConfiguration}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button variant="outline" onClick={testRules}>
                <Play className="h-4 w-4 mr-2" />
                Test {zone.slug === 'serra' ? 'Condizioni' : 'Regole'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>🧪 Test Condizioni {zoneTitle}</DialogTitle>
            <DialogDescription>
              Riepilogo delle condizioni configurate e relative azioni
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-medium">📐 Condizioni Temperatura:</h4>
              <div className="space-y-2 text-sm">
                <div className="p-3 border rounded-lg">
                  <div className="font-medium">Se T ≤ {tempMin}°C:</div>
                  <div className="mt-1">
                    <span className="text-green-600">Accendi: </span>
                    {Object.entries(rules.tempLow.actions.on).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                  <div>
                    <span className="text-red-600">Spegni: </span>
                    {Object.entries(rules.tempLow.actions.off).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="font-medium">Se T ≥ {tempMax}°C:</div>
                  <div className="mt-1">
                    <span className="text-green-600">Accendi: </span>
                    {Object.entries(rules.tempHigh.actions.on).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                  <div>
                    <span className="text-red-600">Spegni: </span>
                    {Object.entries(rules.tempHigh.actions.off).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium">💧 Condizioni Umidità:</h4>
              <div className="space-y-2 text-sm">
                <div className="p-3 border rounded-lg">
                  <div className="font-medium">Se UR ≤ {humidityMin}%:</div>
                  <div className="mt-1">
                    <span className="text-green-600">Accendi: </span>
                    {Object.entries(rules.humidityLow.actions.on).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                  <div>
                    <span className="text-red-600">Spegni: </span>
                    {Object.entries(rules.humidityLow.actions.off).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="font-medium">Se UR ≥ {humidityMax}%:</div>
                  <div className="mt-1">
                    <span className="text-green-600">Accendi: </span>
                    {Object.entries(rules.humidityHigh.actions.on).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                  <div>
                    <span className="text-red-600">Spegni: </span>
                    {Object.entries(rules.humidityHigh.actions.off).filter(([_, active]) => active).map(([outletId]) => {
                      const outlet = outlets.find(o => o.id === parseInt(outletId))
                      return outlet ? (outletConfigs[outlet.id]?.name || `Switch${outlets.indexOf(outlet) + 1}`) : ''
                    }).join(', ') || 'Nessuno'}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTestDialog(false)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Scene Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>💾 Salva Scena {zoneTitle}</DialogTitle>
            <DialogDescription>
              Inserisci un nome per la scena che stai salvando
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scene-name">Nome Scena</Label>
              <Input
                id="scene-name"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                placeholder={`es. ${zone.slug === 'serra' ? 'Estate Giorno' : 'Tropicale Diurno'}`}
                onKeyPress={(e) => e.key === 'Enter' && sceneName.trim() && saveConfiguration()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Annulla
            </Button>
            <Button onClick={saveConfiguration} disabled={!sceneName.trim() || loading}>
              {loading ? 'Salvataggio...' : 'Salva Scena'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
