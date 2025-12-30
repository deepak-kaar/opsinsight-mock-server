import os from "os";

let lastCpuInfo = os.cpus();
let currentCpu = 0;
let peakCpu5m = 0;
let avgCpu5m = 0;

const SAMPLE_WINDOW = 300; // 5 minutes (300 x 1s)
let cpuHistory = [];
let historySum = 0;

function calculateCpuUsage(prev, next) {
    let idleDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < prev.length; i++) {
        const p = prev[i].times;
        const n = next[i].times;

        const prevTotal = Object.values(p).reduce((a, b) => a + b, 0);
        const nextTotal = Object.values(n).reduce((a, b) => a + b, 0);

        idleDiff += n.idle - p.idle;
        totalDiff += nextTotal - prevTotal;
    }

    return totalDiff > 0
        ? Math.round((1 - idleDiff / totalDiff) * 100)
        : 0;
}

// Sample every 1 second
setInterval(() => {
    const nextCpuInfo = os.cpus();
    currentCpu = calculateCpuUsage(lastCpuInfo, nextCpuInfo);
    lastCpuInfo = nextCpuInfo;

    // Maintain fixed 5-min window
    cpuHistory.push(currentCpu);
    historySum += currentCpu;

    if (cpuHistory.length > SAMPLE_WINDOW) {
        historySum -= cpuHistory.shift();
    }

    avgCpu5m = Math.round(historySum / cpuHistory.length);
    peakCpu5m = Math.max(...cpuHistory);
}, 1000);

export function getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
        cpu: {
            current: currentCpu,
            average5m: avgCpu5m,
            peak5m: peakCpu5m,
            cores: os.cpus().length,
            loadAverage: os.loadavg().map(v => Math.round(v * 100) / 100)
        },
        memory: {
            totalGB: Math.round((totalMem / 1024 ** 3) * 100) / 100,
            freeGB: Math.round((freeMem / 1024 ** 3) * 100) / 100,
            usedPercent: Math.round((1 - freeMem / totalMem) * 100)
        },
        uptimeSec: Math.round(process.uptime())
    };
}
