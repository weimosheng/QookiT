import { invoke } from "@tauri-apps/api/core";
import type { PerformanceSample } from "../types/performance";

export const performanceService = {
  sample: (connectionId: string) =>
    invoke<PerformanceSample>("performance_sample", { connectionId }),
};
