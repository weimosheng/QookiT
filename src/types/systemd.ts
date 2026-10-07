export interface SystemdUnit {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
}

export interface SystemdUnitStatus {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
  unit_file_state: string;
  main_pid: number;
  memory_current: number;
  cpu_usage_nsec: number;
  active_enter_timestamp: string;
  inactive_enter_timestamp: string;
  fragment_path: string;
}
