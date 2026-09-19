use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Clone, Debug, serde::Serialize)]
pub struct DiskInfo {
    pub mount: String,
    pub total: u64,
    pub used: u64,
    pub available: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct NetInfo {
    pub name: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct PerformanceSample {
    pub hostname: String,
    pub os: String,
    pub kernel: String,
    pub uptime_seconds: u64,
    pub load_avg: [f32; 3],
    pub cpu_cores: u32,
    pub cpu_model: String,
    pub cpu_usage: f32,
    pub mem_total: u64,
    pub mem_used: u64,
    pub mem_available: u64,
    pub mem_cached: u64,
    pub swap_total: u64,
    pub swap_used: u64,
    pub disks: Vec<DiskInfo>,
    pub net_interfaces: Vec<NetInfo>,
    pub process_count: u32,
    pub timestamp: u64,
}

const LINUX_SCRIPT: &str = r#"if [ ! -f /proc/stat ]; then
printf 'ERROR\tnot_linux\n'
exit 0
fi
HN=$(hostname 2>/dev/null || echo unknown)
OS=$(uname -s 2>/dev/null || echo unknown)
KR=$(uname -r 2>/dev/null || echo unknown)
UP=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
LA=$(awk '{print $1, $2, $3}' /proc/loadavg 2>/dev/null || echo "0 0 0")
CC=$(grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)
CM=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | sed 's/.*: //' || echo unknown)
[ -z "$CM" ] && CM=unknown
C1=$(head -n1 /proc/stat 2>/dev/null)
sleep 1
C2=$(head -n1 /proc/stat 2>/dev/null)
CU=$(awk -v c1="$C1" -v c2="$C2" 'BEGIN{
  split(c1,a," "); split(c2,b," ");
  u1=a[2]+a[3]+a[4]; u2=b[2]+b[3]+b[4];
  t1=a[2]+a[3]+a[4]+a[5]; t2=b[2]+b[3]+b[4]+b[5];
  if (t2-t1>0) printf "%.1f", 100*(u2-u1)/(t2-t1); else print "0";
}')
MT=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
MA=$(awk '/MemAvailable/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
MC=$(awk '/^Cached:/{print $2; exit}' /proc/meminfo 2>/dev/null || echo 0)
ST=$(awk '/SwapTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
SF=$(awk '/SwapFree/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
MU=$((MT - MA))
[ "$MU" -lt 0 ] && MU=0
SU=$((ST - SF))
[ "$SU" -lt 0 ] && SU=0
PC=$(ls /proc 2>/dev/null | grep -c '^[0-9]' || echo 0)
printf 'HOSTNAME\t%s\n' "$HN"
printf 'OS\t%s\n' "$OS"
printf 'KERNEL\t%s\n' "$KR"
printf 'UPTIME\t%s\n' "$UP"
printf 'LOADAVG\t%s\n' "$LA"
printf 'CPUCORES\t%s\n' "$CC"
printf 'CPUMODEL\t%s\n' "$CM"
printf 'CPUUSAGE\t%s\n' "$CU"
printf 'MEMTOTAL\t%s\n' "$MT"
printf 'MEMUSED\t%s\n' "$MU"
printf 'MEMAVAIL\t%s\n' "$MA"
printf 'MEMCACHED\t%s\n' "$MC"
printf 'SWAPTOTAL\t%s\n' "$ST"
printf 'SWAPUSED\t%s\n' "$SU"
printf 'PROCS\t%s\n' "$PC"
df -P 2>/dev/null | awk 'NR>1 && $2 ~ /^[0-9]+$/ {printf "DISK\t%s\t%s\t%s\t%s\n", $6, $2, $3, $4}'
awk 'NR>2 {iface=$1; gsub(/:/,"",iface); if (iface!="lo") printf "NET\t%s\t%s\t%s\n", iface, $2, $10}' /proc/net/dev 2>/dev/null
"#;

#[tauri::command]
pub async fn performance_sample(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<PerformanceSample> {
    let entry = state.get_connection(&connection_id).await?;
    let result = entry.connection.exec(LINUX_SCRIPT).await?;
    parse_sample(&result.stdout)
}

fn parse_sample(stdout: &str) -> AppResult<PerformanceSample> {
    let mut hostname = String::from("unknown");
    let mut os = String::from("unknown");
    let mut kernel = String::from("unknown");
    let mut uptime_seconds: u64 = 0;
    let mut load_avg: [f32; 3] = [0.0, 0.0, 0.0];
    let mut cpu_cores: u32 = 1;
    let mut cpu_model = String::from("unknown");
    let mut cpu_usage: f32 = 0.0;
    let mut mem_total: u64 = 0;
    let mut mem_used: u64 = 0;
    let mut mem_available: u64 = 0;
    let mut mem_cached: u64 = 0;
    let mut swap_total: u64 = 0;
    let mut swap_used: u64 = 0;
    let mut process_count: u32 = 0;
    let mut disks: Vec<DiskInfo> = Vec::new();
    let mut net_interfaces: Vec<NetInfo> = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.is_empty() {
            continue;
        }
        match parts[0] {
            "ERROR" => {
                return Err(AppError::Other("该服务器不支持性能采集（仅支持 Linux）".into()));
            }
            "HOSTNAME" if parts.len() > 1 => hostname = parts[1].to_string(),
            "OS" if parts.len() > 1 => os = parts[1].to_string(),
            "KERNEL" if parts.len() > 1 => kernel = parts[1].to_string(),
            "UPTIME" if parts.len() > 1 => uptime_seconds = parts[1].parse().unwrap_or(0),
            "LOADAVG" if parts.len() > 1 => {
                let v: Vec<&str> = parts[1].split_whitespace().collect();
                for (i, val) in v.iter().take(3).enumerate() {
                    load_avg[i] = val.parse().unwrap_or(0.0);
                }
            }
            "CPUCORES" if parts.len() > 1 => cpu_cores = parts[1].parse().unwrap_or(1),
            "CPUMODEL" if parts.len() > 1 => cpu_model = parts[1].to_string(),
            "CPUUSAGE" if parts.len() > 1 => cpu_usage = parts[1].parse().unwrap_or(0.0),
            "MEMTOTAL" if parts.len() > 1 => mem_total = parts[1].parse().unwrap_or(0) * 1024,
            "MEMUSED" if parts.len() > 1 => mem_used = parts[1].parse().unwrap_or(0) * 1024,
            "MEMAVAIL" if parts.len() > 1 => mem_available = parts[1].parse().unwrap_or(0) * 1024,
            "MEMCACHED" if parts.len() > 1 => mem_cached = parts[1].parse().unwrap_or(0) * 1024,
            "SWAPTOTAL" if parts.len() > 1 => swap_total = parts[1].parse().unwrap_or(0) * 1024,
            "SWAPUSED" if parts.len() > 1 => swap_used = parts[1].parse().unwrap_or(0) * 1024,
            "PROCS" if parts.len() > 1 => process_count = parts[1].parse().unwrap_or(0),
            "DISK" if parts.len() > 4 => {
                disks.push(DiskInfo {
                    mount: parts[1].to_string(),
                    total: parts[2].parse().unwrap_or(0) * 1024,
                    used: parts[3].parse().unwrap_or(0) * 1024,
                    available: parts[4].parse().unwrap_or(0) * 1024,
                });
            }
            "NET" if parts.len() > 3 => {
                net_interfaces.push(NetInfo {
                    name: parts[1].to_string(),
                    rx_bytes: parts[2].parse().unwrap_or(0),
                    tx_bytes: parts[3].parse().unwrap_or(0),
                });
            }
            _ => {}
        }
    }

    let timestamp = chrono::Utc::now().timestamp_millis() as u64;

    Ok(PerformanceSample {
        hostname,
        os,
        kernel,
        uptime_seconds,
        load_avg,
        cpu_cores,
        cpu_model,
        cpu_usage,
        mem_total,
        mem_used,
        mem_available,
        mem_cached,
        swap_total,
        swap_used,
        disks,
        net_interfaces,
        process_count,
        timestamp,
    })
}
