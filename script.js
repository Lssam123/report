const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let speedSamples = [];

function updateUI(v, status) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 900) / 900) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = status;
    points.push(v);
    if(points.length > 50) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 2;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 900 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function fetchPing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = []; speedSamples = [];

    // 1. فحص Ping غير مثقل (4 ثوانٍ)
    document.getElementById('status-text').innerText = "يتم الفحص...";
    let pings = [];
    const pStart = performance.now();
    while (performance.now() - pStart < 4000) {
        const p = await fetchPing();
        if(p > 0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    document.getElementById('ping-unloaded').innerText = Math.min(...pings).toFixed(0);

    // 2. Download
    await engine('DOWNLOAD', 12000, 'download');
    
    // قياس Ping مثقل (بعد التنزيل مباشرة)
    const pLoaded = await fetchPing();
    document.getElementById('ping-loaded').innerText = pLoaded.toFixed(0);

    // 3. Upload (تم إصلاح المحرك هنا)
    speedSamples = [];
    await engine('UPLOAD', 10000, 'upload');

    updateUI(0, "اكتمل الفحص");
    btn.disabled = false;
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // توليد بيانات وهمية للرفع
    const blob = new Blob([new Uint8Array(1024 * 512)]); // 512KB chunks

    const threads = mode === 'DOWNLOAD' ? 8 : 4; // تقليل الخيوط للرفع لزيادة الاستقرار
    const tasks = Array(threads).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                if (mode === 'DOWNLOAD') {
                    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=100000000&_=${Math.random()}`, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        calc(totalBytes, startTime, mode, targetId);
                    }
                } else {
                    // الرفع باستخدام POST مستمر لمنع تعليق المتصفح
                    await fetch(`https://httpbin.org/post?_=${Math.random()}`, { 
                        method: 'POST', 
                        body: blob, 
                        signal: controller.signal,
                        mode: 'cors'
                    });
                    totalBytes += blob.size;
                    calc(totalBytes, startTime, mode, targetId);
                }
            } catch (e) { if(e.name === 'AbortError') break; }
        }
    });
    await Promise.all(tasks);
}

function calc(total, start, mode, tid) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1) return;
    const comp = mode === 'DOWNLOAD' ? 1.05 : 1.20;
    let mbps = (total * 8 * comp) / elapsed / 1048576;
    speedSamples.push(mbps);
    if(speedSamples.length > 30) speedSamples.shift();
    const smooth = speedSamples.reduce((a,b)=>a+b, 0) / speedSamples.length;
    updateUI(smooth, "يتم الفحص");
    document.getElementById(tid).innerText = smooth.toFixed(2);
}
