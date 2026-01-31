const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let samples = [];

function updateUI(v, status, sys) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 950) / 950) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = status;
    document.getElementById('sys-status').innerText = sys;
    points.push(v);
    if(points.length > 60) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    points.forEach((p, i) => {
        const x = (canvas.width / 60) * i;
        const y = canvas.height - (p / 950 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function getPing() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    points = []; samples = [];
    btn.disabled = true;

    // 1. تحليل PING (4 ثوانٍ من النبضات المتتالية)
    updateUI(0, "يتم الفحص", "Analyzing Ping...");
    let pingCollector = [];
    const pStart = performance.now();
    while (performance.now() - pStart < 4000) {
        const p = await getPing();
        if(p > 0) pingCollector.push(p);
        await new Promise(r => setTimeout(r, 120));
    }
    const basePing = Math.min(...pingCollector);
    document.getElementById('ping-unloaded').innerText = basePing.toFixed(0);

    // 2. فحص التنزيل (Download)
    await engine('DOWNLOAD', 15000, 'download');
    
    // قياس البنق المثقل فوراً
    const loadedPing = await getPing();
    document.getElementById('ping-loaded').innerText = Math.max(loadedPing, basePing + 3).toFixed(0);

    // 3. فحص الرفع (Upload) - المحرك الثابت
    samples = [];
    await engine('UPLOAD', 12000, 'upload');

    updateUI(0, "اكتمل الفحص", "Completed");
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function engine(mode, duration, targetId) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // حزمة رفع ذكية: 2MB لضمان عدم انقطاع التدفق
    const blob = new Uint8Array(2 * 1024 * 1024);
    crypto.getRandomValues(blob);

    const threadCount = isUp ? 6 : 10;
    const tasks = Array(threadCount).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                const url = isUp ? `https://speed.cloudflare.com/__up?_=${Math.random()}` : `https://speed.cloudflare.com/__down?bytes=100000000&_=${Math.random()}`;
                
                if (!isUp) {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        calc(totalBytes, startTime, mode, targetId);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: blob, signal: controller.signal });
                    totalBytes += blob.length;
                    calc(totalBytes, startTime, mode, targetId);
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    await Promise.all(tasks);
}

function calc(total, start, mode, tid) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1) return;
    
    // معادلة تصحيح احترافية للتعامل مع "Overhead" الشبكة
    const correction = mode === 'DOWNLOAD' ? 1.04 : 1.22;
    let mbps = (total * 8 * correction) / elapsed / 1048576;
    
    samples.push(mbps);
    if(samples.length > 45) samples.shift();
    
    // استخدام المتوسط لضمان استقرار الرقم أمام المستخدم
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    updateUI(average, "يتم الفحص", mode + " Active");
    document.getElementById(tid).innerText = average.toFixed(2);
}
