export interface DiskInfo {
  mount: string;
  total: number;
  used: number;
  available: number;
}

export interface NetInfo {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
}

export interface PerformanceSample {
  hostname: string;
  os: string;
  kernel: string;
  uptime_seconds: number;
  load_avg: [number, number, number];
  cpu_cores: number;
  cpu_model: string;
  cpu_usage: number;
  mem_total: number;
  mem_used: number;
  mem_available: number;
  mem_cached: number;
  swap_total: number;
  swap_used: number;
  disks: DiskInfo[];
  net_interfaces: NetInfo[];
  process_count: number;
  timestamp: number;
}
