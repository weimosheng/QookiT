export interface CronJob {
  line_number: number;
  enabled: boolean;
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  command: string;
  comment: string;
  is_special: boolean;
  special: string;
  raw: string;
}

export interface CronFile {
  name: string;
  size: number;
  owner: string;
  modified: string;
}
