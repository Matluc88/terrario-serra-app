import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Zone {
  id: number
  slug: string
  name: string
  mode: string
  active: boolean
  settings: Record<string, any>
  created_at: string
  updated_at?: string
}

interface ZoneTabsProps {
  zone: Zone
  onZoneUpdate: () => void
}

export default function ZoneTabs({ zone }: ZoneTabsProps) {
  return (
    <Tabs defaultValue="manual" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="manual">Manuale</TabsTrigger>
        <TabsTrigger value="mapping">Mapping</TabsTrigger>
        <TabsTrigger value="automatic">Automatico</TabsTrigger>
      </TabsList>
      
      <TabsContent value="manual" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Controllo Manuale</CardTitle>
            <CardDescription>
              Controllo diretto delle prese e dispositivi della zona {zone.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="text-center py-8 text-gray-500">
                <p>Controlli manuali in sviluppo...</p>
                <p className="text-sm mt-2">
                  Qui saranno disponibili i toggle per ogni presa e dispositivo
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="mapping" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Creazione Scene</CardTitle>
            <CardDescription>
              Crea e modifica scene personalizzate per la zona {zone.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <p>Editor scene in sviluppo...</p>
              <p className="text-sm mt-2">
                Qui potrai creare scene personalizzate con regole temperatura/umidità
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="automatic" className="space-y-4">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {zone.slug === 'serra' ? '🌱' : '🐢'} Automazione {zone.name}
              </CardTitle>
              <CardDescription>
                Seleziona e attiva scene automatiche per la zona
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Stato Automazione</h4>
                    <p className="text-sm text-gray-600">
                      {zone.mode === 'automatic' ? 'Attiva' : 'Disattivata'}
                    </p>
                  </div>
                  <Badge variant={zone.mode === 'automatic' ? 'default' : 'secondary'}>
                    {zone.mode === 'automatic' ? 'Automatico' : 'Manuale'}
                  </Badge>
                </div>
                
                <div className="text-center py-8 text-gray-500">
                  <p>Selezione scene in sviluppo...</p>
                  <p className="text-sm mt-2">
                    Qui potrai selezionare e attivare le scene create nel tab Mapping
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}
