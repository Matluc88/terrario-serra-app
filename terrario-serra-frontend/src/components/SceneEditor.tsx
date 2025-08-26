import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Save, Play, Settings, AlertTriangle } from 'lucide-react'

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

interface Outlet {
  id: number
  device_id: number
  channel: string
  role: string
  custom_name: string
  enabled: boolean
  last_state: boolean
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

interface SceneRule {
  id: number
  scene_id: number
  name: string
  condition: Record<string, unknown>
  action: Record<string, unknown>
  priority: number
  created_at: string
  updated_at?: string
}

interface SceneEditorProps {
  zone: Zone
  outlets: Outlet[]
  onSceneUpdate: () => void
}

export default function SceneEditor({ zone, outlets, onSceneUpdate }: SceneEditorProps) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)
  const [sceneRules, setSceneRules] = useState<SceneRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [newSceneName, setNewSceneName] = useState('')
  const [newSceneSlug, setNewSceneSlug] = useState('')
  const [targetTemperature, setTargetTemperature] = useState('')
  const [targetHumidity, setTargetHumidity] = useState('')

  const [newRuleName, setNewRuleName] = useState('')
  const [ruleConditionType, setRuleConditionType] = useState('temperature')
  const [ruleConditionOperator, setRuleConditionOperator] = useState('>')
  const [ruleConditionValue, setRuleConditionValue] = useState('')
  const [ruleActionType] = useState('outlet')
  const [ruleActionOutlet, setRuleActionOutlet] = useState('')
  const [ruleActionState, setRuleActionState] = useState(true)

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

  const fetchSceneRules = async (sceneId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${sceneId}/rules`)
      if (response.ok) {
        const data = await response.json()
        setSceneRules(data)
      }
    } catch (err) {
      console.error('Error fetching scene rules:', err)
    }
  }

  useEffect(() => {
    fetchScenes()
  }, [zone.id, fetchScenes])

  useEffect(() => {
    if (selectedScene) {
      fetchSceneRules(selectedScene.id)
    } else {
      setSceneRules([])
    }
  }, [selectedScene])

  const createScene = async () => {
    if (!newSceneName.trim() || !newSceneSlug.trim()) {
      setError('Nome e slug della scena sono obbligatori')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const sceneData = {
        name: newSceneName,
        slug: newSceneSlug,
        settings: {
          target_temperature: targetTemperature ? parseFloat(targetTemperature) : null,
          target_humidity: targetHumidity ? parseFloat(targetHumidity) : null
        },
        is_active: false
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/zone/${zone.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sceneData)
      })

      if (response.ok) {
        const newScene = await response.json()
        setScenes([...scenes, newScene])
        setSelectedScene(newScene)
        setNewSceneName('')
        setNewSceneSlug('')
        setTargetTemperature('')
        setTargetHumidity('')
        setSuccess('Scena creata con successo!')
        onSceneUpdate()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Errore nella creazione della scena')
      }
    } catch {
      setError('Errore di connessione durante la creazione della scena')
    } finally {
      setLoading(false)
    }
  }

  const createRule = async () => {
    if (!selectedScene || !newRuleName.trim() || !ruleConditionValue.trim()) {
      setError('Seleziona una scena e compila tutti i campi della regola')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const ruleData = {
        name: newRuleName,
        condition: {
          type: ruleConditionType,
          operator: ruleConditionOperator,
          value: parseFloat(ruleConditionValue)
        },
        action: {
          type: ruleActionType,
          outlet_id: ruleActionType === 'outlet' ? parseInt(ruleActionOutlet) : null,
          state: ruleActionState
        },
        priority: sceneRules.length + 1
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${selectedScene.id}/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ruleData)
      })

      if (response.ok) {
        const newRule = await response.json()
        setSceneRules([...sceneRules, newRule])
        setNewRuleName('')
        setRuleConditionValue('')
        setRuleActionOutlet('')
        setSuccess('Regola aggiunta con successo!')
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Errore nella creazione della regola')
      }
    } catch {
      setError('Errore di connessione durante la creazione della regola')
    } finally {
      setLoading(false)
    }
  }

  const activateScene = async (scene: Scene) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${scene.id}/activate`, {
        method: 'POST'
      })

      if (response.ok) {
        await fetchScenes()
        setSuccess(`Scena "${scene.name}" attivata!`)
        onSceneUpdate()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Errore nell\'attivazione della scena')
      }
    } catch {
      setError('Errore di connessione durante l\'attivazione della scena')
    } finally {
      setLoading(false)
    }
  }

  const evaluateScene = async (scene: Scene) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${scene.id}/evaluate`, {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        setSuccess(`Regole valutate: ${result.executed_actions.length} azioni eseguite`)
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Errore nella valutazione delle regole')
      }
    } catch {
      setError('Errore di connessione durante la valutazione delle regole')
    } finally {
      setLoading(false)
    }
  }

  const deleteRule = async (ruleId: number) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/rules/${ruleId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setSceneRules(sceneRules.filter(rule => rule.id !== ruleId))
        setSuccess('Regola eliminata con successo!')
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Errore nell\'eliminazione della regola')
      }
    } catch {
      setError('Errore di connessione durante l\'eliminazione della regola')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Scene Creation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Crea Nuova Scena
          </CardTitle>
          <CardDescription>
            Crea una nuova scena per la {zone.slug === 'serra' ? 'serra' : 'terrario'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scene-name">Nome Scena</Label>
              <Input
                id="scene-name"
                value={newSceneName}
                onChange={(e) => setNewSceneName(e.target.value)}
                placeholder="es. Giorno Estate"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scene-slug">Slug Scena</Label>
              <Input
                id="scene-slug"
                value={newSceneSlug}
                onChange={(e) => setNewSceneSlug(e.target.value)}
                placeholder="es. giorno-estate"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-temp">Temperatura Target (°C)</Label>
              <Input
                id="target-temp"
                type="number"
                value={targetTemperature}
                onChange={(e) => setTargetTemperature(e.target.value)}
                placeholder="es. 25"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-humidity">Umidità Target (%)</Label>
              <Input
                id="target-humidity"
                type="number"
                value={targetHumidity}
                onChange={(e) => setTargetHumidity(e.target.value)}
                placeholder="es. 60"
              />
            </div>
          </div>

          <Button onClick={createScene} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Crea Scena
          </Button>
        </CardContent>
      </Card>

      {/* Scene List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Scene Esistenti
          </CardTitle>
          <CardDescription>
            Gestisci le scene create per la {zone.slug === 'serra' ? 'serra' : 'terrario'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scenes.length === 0 ? (
            <div className="text-sm text-gray-600">
              Nessuna scena configurata. Crea la tua prima scena sopra.
            </div>
          ) : (
            <div className="space-y-3">
              {scenes.map((scene) => (
                <div key={scene.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium">{scene.name}</div>
                      <div className="text-sm text-gray-600">{scene.slug}</div>
                    </div>
                    <Badge variant={scene.is_active ? "default" : "secondary"}>
                      {scene.is_active ? "Attiva" : "Inattiva"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedScene(scene)}
                    >
                      Modifica
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => activateScene(scene)}
                      disabled={loading || scene.is_active}
                    >
                      Attiva
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => evaluateScene(scene)}
                      disabled={loading || !scene.is_active}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rule Editor */}
      {selectedScene && (
        <Card>
          <CardHeader>
            <CardTitle>Editor Regole - {selectedScene.name}</CardTitle>
            <CardDescription>
              Configura le regole di automazione per questa scena
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add New Rule */}
            <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium">Aggiungi Nuova Regola</h4>
              
              <div className="space-y-2">
                <Label htmlFor="rule-name">Nome Regola</Label>
                <Input
                  id="rule-name"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="es. Accendi riscaldamento se freddo"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Condizione</Label>
                  <Select value={ruleConditionType} onValueChange={setRuleConditionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="temperature">Temperatura</SelectItem>
                      <SelectItem value="humidity">Umidità</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Operatore</Label>
                  <Select value={ruleConditionOperator} onValueChange={setRuleConditionOperator}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">Maggiore di</SelectItem>
                      <SelectItem value="<">Minore di</SelectItem>
                      <SelectItem value=">=">Maggiore o uguale</SelectItem>
                      <SelectItem value="<=">Minore o uguale</SelectItem>
                      <SelectItem value="==">Uguale a</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valore</Label>
                  <Input
                    type="number"
                    value={ruleConditionValue}
                    onChange={(e) => setRuleConditionValue(e.target.value)}
                    placeholder="es. 20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Azione - Presa</Label>
                  <Select value={ruleActionOutlet} onValueChange={setRuleActionOutlet}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona presa" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((outlet) => (
                        <SelectItem key={outlet.id} value={outlet.id.toString()}>
                          {outlet.custom_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stato</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={ruleActionState}
                      onCheckedChange={setRuleActionState}
                    />
                    <span className="text-sm">
                      {ruleActionState ? 'Accendi' : 'Spegni'}
                    </span>
                  </div>
                </div>
              </div>

              <Button onClick={createRule} disabled={loading}>
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi Regola
              </Button>
            </div>

            {/* Existing Rules */}
            <div className="space-y-3">
              <h4 className="font-medium">Regole Esistenti</h4>
              {sceneRules.length === 0 ? (
                <div className="text-sm text-gray-600">
                  Nessuna regola configurata per questa scena.
                </div>
              ) : (
                sceneRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{rule.name}</div>
                      <div className="text-sm text-gray-600">
                        Se {String(rule.condition.type)} {String(rule.condition.operator)} {String(rule.condition.value)} → {' '}
                        {rule.action.type === 'outlet' ? 
                          `${rule.action.state ? 'Accendi' : 'Spegni'} presa ${rule.action.outlet_id}` : 
                          'Azione personalizzata'
                        }
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteRule(rule.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
