import { useQuery } from "@tanstack/react-query";
import { getDevices, Device } from "@/api";
export function useDevices(zoneId: string, automationRunning: boolean) {
  return useQuery<Device[], Error>({
    queryKey: ["devices", zoneId],
    queryFn: () => getDevices(zoneId),
    refetchInterval: automationRunning ? 2000 : false,
    refetchOnWindowFocus: true,
  });
}
