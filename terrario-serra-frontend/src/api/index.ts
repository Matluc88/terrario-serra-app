
export interface Device {
  id: number
  name: string
  zone_id: number
  provider: string
  provider_device_id: string
  meta: Record<string, unknown>
}
const BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function getDevices(zoneId: string | number): Promise<Device[]> {
  const res = await fetch(`${BASE}/api/v1/devices/`)
  if (!res.ok) throw new Error(`HTTP ${res.status} on GET /devices`)
  const list: Device[] = await res.json()
  return list.filter((d) => String(d.zone_id) === String(zoneId))
}
export async function switchOutlet(
  deviceId: string | number,
  outletId: number | null,
  on: boolean
) {
  if (outletId == null) throw new Error('outletId mancante')
  const res = await fetch(
    `${BASE}/api/v1/devices/${deviceId}/outlets/${outletId}/switch?state=${on}`,
    { method: 'POST' }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status} on POST /devices/${deviceId}/outlets/${outletId}/switch`)
  return res.json()
}
