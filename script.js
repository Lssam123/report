const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let speedSamples = [];

function updateGauge(v, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 950) / 950) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = mode;
    points.push(v);
    if(points.length > 50) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 950 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function getPrecisePing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = []; speedSamples = [];

    // 1. PING غير مثقل (4 ثوانٍ)
    document.getElementById('status-text').innerText = "تحليل الاستجابة الهادئة...";
    let pings = [];
    const pStart = performance.now();
    while (performance.now() - pStart < 4000) {
        const p = await getPrecisePing();
        if(p > 0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    document.getElementById('ping-unloaded').innerText = Math.min(...pings).toFixed(0);

    // 2. DOWNLOAD + قياس PING مثقل
    await engine('DOWNLOAD', 15000, 'download');
    const pLoaded = await getPrecisePing();
    document.getElementById('ping-loaded').innerText = pLoaded.toFixed(0);

    // 3. UPLOAD (محرك مطور)
    speedSamples = [];
    await engine('UPLOAD', 12000, 'upload');

    btn.disabled = false;
    document.getElementById('status-text').innerText = "اكتمل الفحص الشامل";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    const threads = mode === 'DOWNLOAD' ? 10 : 6;
    const chunk = new Uint8Array(mode === 'DOWNLOAD' ? 0 : 512 * 1024);
    if(mode === 'UPLOAD') crypto.getRandomValues(chunk);

    const tasks = Array(threads).fill(0).map(async () => {
        const url = mode === 'DOWNLOAD' ? "https://speed.cloudflare.com/__down?bytes=500000000" : "https://httpbin.org/post";
        while ((performance.now() - startTime) < duration) {
            try {
                if (mode === 'DOWNLOAD') {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        calculate(totalBytes, startTime, mode, targetId);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: chunk, signal: controller.signal });
                    totalBytes += chunk.length;
                    calculate(totalBytes, startTime, mode, targetId);
                }
            } catch (e) { if (e.name === 'AbortError') break; }
        }
    });
    await Promise.all(tasks);
}

function calculate(total, start, mode, targetId) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1.2) return;
    const compensation = mode === 'DOWNLOAD' ? 1.05 : 1.18;
    let mbps = (total * 8 * compensation) / elapsed / 1048576;
    speedSamples.push(mbps);
    if (speedSamples.length > 40) speedSamples.shift();
    const sorted = [...speedSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    updateGauge(median, mode === 'DOWNLOAD' ? "جاري التنزيل..." : "جاري الرفع...");
    document.getElementById(targetId).innerText = median.toFixed(2);
}
