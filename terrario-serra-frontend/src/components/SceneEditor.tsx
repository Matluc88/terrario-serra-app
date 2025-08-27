import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Settings, AlertTriangle } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

interface Zone {
  id: number
  name: string
  slug: string
  description?: string
  created_at?: string
  updated_at?: string
}

interface Scene {
  id: number
  zone_id: number
  name: string
  slug: string
  settings?: {
    temperature_target?: number
    humidity_target?: number
    plants?: string[]
    habitat_type?: string
  }
  is_active: boolean
  created_at: string
  updated_at?: string
}

interface SceneRule {
  id: number
  scene_id: number
  name: string
  condition: {
    type: string
    operator: string
    value: number
  }
  action: {
    type: string
    outlet_id?: number
    state?: boolean
  }
  priority: number
  created_at?: string
  updated_at?: string
}

interface SceneEditorProps {
  zone: Zone
  onSceneUpdate: () => void
}

export default function SceneEditor({ zone, onSceneUpdate }: SceneEditorProps) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)
  const [sceneRules, setSceneRules] = useState<SceneRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchScenes = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/zone/${zone.id}`)
      if (response.ok) {
        const data = await response.json()
        setScenes(data)
      }
    } catch (error) {
      console.error('Error fetching scenes:', error)
    }
  }, [zone.id])

  const fetchSceneRules = useCallback(async (sceneId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${sceneId}/rules`)
      if (response.ok) {
        const data = await response.json()
        setSceneRules(data)
      }
    } catch (error) {
      console.error('Error fetching scene rules:', error)
    }
  }, [])

  useEffect(() => {
    fetchScenes()
  }, [fetchScenes])

  const visualizzaTest = async (scene: Scene) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchSceneRules(scene.id)
      setSelectedScene(scene)
      
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${scene.id}/evaluate`, {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        setSuccess(`Test completato: ${result.message || 'Regole valutate con successo'}`)
      } else {
        const errorData = await response.json()
        setError(typeof errorData.detail === 'string' ? errorData.detail : 'Errore nella valutazione della scena')
      }
    } catch {
      setError('Errore di connessione durante il test della scena')
    } finally {
      setLoading(false)
    }
  }

  const deleteScene = async (sceneId: number) => {
    if (!confirm('Sei sicuro di voler eliminare questa scena? Questa azione non può essere annullata.')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenes/${sceneId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setScenes(scenes.filter(scene => scene.id !== sceneId))
        if (selectedScene?.id === sceneId) {
          setSelectedScene(null)
        }
        setSuccess('Scena eliminata con successo!')
        onSceneUpdate()
      } else {
        const errorData = await response.json()
        setError(typeof errorData.detail === 'string' ? errorData.detail : 'Errore nell\'eliminazione della scena')
      }
    } catch {
      setError('Errore di connessione durante l\'eliminazione della scena')
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

      {/* Scene Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Riepilogo Scene
          </CardTitle>
          <CardDescription>
            Scene create nel mapping per la {zone.slug === 'serra' ? 'serra' : 'terrario'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scenes.length === 0 ? (
            <div className="text-sm text-gray-600">
              Nessuna scena configurata. Vai al tab Mapping per creare una scena.
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
                      onClick={() => visualizzaTest(scene)}
                      disabled={loading}
                    >
                      Visualizza Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteScene(scene.id)}
                      disabled={loading}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Elimina
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scene Details */}
      {selectedScene && (
        <Card>
          <CardHeader>
            <CardTitle>Dettagli Scena - {selectedScene.name}</CardTitle>
            <CardDescription>
              Informazioni sulla scena selezionata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Nome</Label>
                <div className="text-sm text-gray-600">{selectedScene.name}</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Slug</Label>
                <div className="text-sm text-gray-600">{selectedScene.slug}</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Stato</Label>
                <Badge variant={selectedScene.is_active ? "default" : "secondary"}>
                  {selectedScene.is_active ? "Attiva" : "Inattiva"}
                </Badge>
              </div>
              <div>
                <Label className="text-sm font-medium">Creata</Label>
                <div className="text-sm text-gray-600">
                  {new Date(selectedScene.created_at).toLocaleDateString('it-IT')}
                </div>
              </div>
            </div>
            
            {selectedScene.settings && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Impostazioni</Label>
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                  {selectedScene.settings.temperature_target && (
                    <div>Temperatura Target: {selectedScene.settings.temperature_target}°C</div>
                  )}
                  {selectedScene.settings.humidity_target && (
                    <div>Umidità Target: {selectedScene.settings.humidity_target}%</div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-medium">Regole Associate</Label>
              {sceneRules.length === 0 ? (
                <div className="text-sm text-gray-600">
                  Nessuna regola configurata per questa scena.
                </div>
              ) : (
                sceneRules.map((rule) => (
                  <div key={rule.id} className="p-3 border rounded-lg bg-gray-50">
                    <div className="font-medium text-sm">{rule.name}</div>
                    <div className="text-sm text-gray-600">
                      Se {String(rule.condition.type)} {String(rule.condition.operator)} {String(rule.condition.value)} → {' '}
                      {rule.action.type === 'outlet' ? 
                        `${rule.action.state ? 'Accendi' : 'Spegni'} presa ${rule.action.outlet_id}` : 
                        'Azione personalizzata'
                      }
                    </div>
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
