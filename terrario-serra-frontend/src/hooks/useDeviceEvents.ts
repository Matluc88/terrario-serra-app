import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

const BASE = import.meta.env.VITE_API_BASE_URL || "";

export function useDeviceEvents(zoneId: string) {
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/v1/events/sse`);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "device_state_changed" && msg?.zoneId === zoneId) {
          queryClient.setQueryData(["devices", zoneId], (prev: any) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((d: any) =>
              d.id === msg.deviceId ? { ...d, power: msg.power, updatedAt: msg.ts } : d
            );
          });
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [zoneId]);
}
