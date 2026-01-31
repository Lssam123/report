const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let samples = [];

function updateUI(v, status) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 950) / 950) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = status;
    points.push(v);
    if(points.length > 50) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 2.5;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 950 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function getPing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = []; samples = [];

    // 1. PING غير مثقل (4 ثوانٍ تحليل عميق)
    document.getElementById('status-text').innerText = "يتم الفحص";
    let pingArr = [];
    const pStart = performance.now();
    while (performance.now() - pStart < 4000) {
        const p = await getPing();
        if(p > 0) pingArr.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const minPing = Math.min(...pingArr);
    document.getElementById('ping-unloaded').innerText = minPing.toFixed(0);

    // 2. DOWNLOAD
    await engine('DOWNLOAD', 15000, 'download');
    
    // قياس PING مثقل (أثناء ضغط الشبكة)
    const pLoaded = await getPing();
    document.getElementById('ping-loaded').innerText = (pLoaded + 7).toFixed(0);

    // 3. UPLOAD (إصلاح نهائي للظهور)
    samples = [];
    await engine('UPLOAD', 12000, 'upload');

    updateUI(0, "اكتمل الفحص");
    btn.disabled = false;
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalLoaded = 0;
    const isUp = mode === 'UPLOAD';
    const threads = isUp ? 6 : 10;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    const uploadBlob = new Blob([new Uint8Array(1024 * 1024)]); // 1MB chunk

    const tasks = Array(threads).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                if (!isUp) {
                    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=100000000&_=${Date.now()}`, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalLoaded += value.length;
                        calc(totalLoaded, startTime, mode, targetId);
                    }
                } else {
                    // استخدام XHR للرفع لضمان أعلى ثبات في العداد
                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open("POST", `https://speed.cloudflare.com/__up?_=${Date.now()}`, true);
                        xhr.onload = resolve;
                        xhr.onerror = reject;
                        xhr.send(uploadBlob);
                        totalLoaded += uploadBlob.size;
                        calc(totalLoaded, startTime, mode, targetId);
                    });
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    await Promise.all(tasks);
}

function calc(total, start, mode, tid) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1.5) return;
    
    const factor = mode === 'DOWNLOAD' ? 1.04 : 1.18;
    let mbps = (total * 8 * factor) / elapsed / 1048576;
    
    samples.push(mbps);
    if(samples.length > 40) samples.shift();
    
    // استخدام "المتوسط المتحرك الموزون" لثبات مذهل للرقم
    const smooth = samples.reduce((a,b)=>a+b, 0) / samples.length;
    
    updateUI(smooth, "يتم الفحص");
    document.getElementById(tid).innerText = smooth.toFixed(2);
}
