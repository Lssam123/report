const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let speedSamples = [];

function updateGauge(v, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 800) / 800) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = mode;
    points.push(v);
    if(points.length > 50) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#05ffa1'; ctx.lineWidth = 2;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 800 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function getInstantPing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = []; speedSamples = [];

    // 1. PING غير مثقل
    document.getElementById('status-text').innerText = "تحليل الاستجابة...";
    let unSamples = [];
    for(let i=0; i<6; i++) {
        unSamples.push(await getInstantPing());
        await new Promise(r => setTimeout(r, 100));
    }
    document.getElementById('ping-unloaded').innerText = Math.min(...unSamples).toFixed(0);

    // 2. DOWNLOAD + PING مثقل
    let loadedPings = [];
    const tracker = setInterval(async () => {
        const p = await getInstantPing(); if(p > 0) loadedPings.push(p);
    }, 1000);

    await engine('DOWNLOAD', 15000, 'download');
    clearInterval(tracker);
    const avgLoaded = loadedPings.reduce((a,b) => a+b, 0) / loadedPings.length;
    document.getElementById('ping-loaded').innerText = avgLoaded ? avgLoaded.toFixed(0) : "--";

    // 3. UPLOAD
    speedSamples = [];
    await engine('UPLOAD', 12000, 'upload');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
    document.getElementById('status-text').innerText = "اكتمل التحليل";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let bytesTotal = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        const threads = mode === 'DOWNLOAD' ? 24 : 32;
        const payload = new Uint8Array(mode === 'DOWNLOAD' ? 0 : 4 * 1024 * 1024);
        if(mode === 'UPLOAD') crypto.getRandomValues(payload);

        const tasks = Array(threads).fill(0).map(async () => {
            const url = mode === 'DOWNLOAD' ? "https://speed.cloudflare.com/__down?bytes=500000000" : "https://httpbin.org/post";
            while((performance.now() - startTime) < duration) {
                const res = await fetch(url, { signal: controller.signal, method: mode === 'DOWNLOAD' ? 'GET' : 'POST', body: mode === 'DOWNLOAD' ? null : payload });
                if(mode === 'DOWNLOAD') {
                    const reader = res.body.getReader();
                    while(true) {
                        const {done, value} = await reader.read();
                        if(done) break;
                        bytesTotal += value.length;
                        processSpeed(bytesTotal, startTime, mode, targetId);
                    }
                } else {
                    bytesTotal += payload.length;
                    processSpeed(bytesTotal, startTime, mode, targetId);
                }
            }
        });
        await Promise.all(tasks);
    } catch(e) {}
}

function processSpeed(totalBytes, start, mode, targetId) {
    const elapsed = (performance.now() - start) / 1000;
    if(elapsed < 1.5) return; // تجاهل أول ثانية ونصف للاستقرار

    let mbps = (totalBytes * 8) / elapsed / 1048576;
    const compensation = mode === 'DOWNLOAD' ? 1.06 : 1.12;
    mbps *= compensation;

    speedSamples.push(mbps);
    if(speedSamples.length > 30) speedSamples.shift();
    const smooth = speedSamples.reduce((a,b) => a+b, 0) / speedSamples.length;

    updateGauge(smooth, mode === 'DOWNLOAD' ? "جاري التنزيل..." : "جاري الرفع...");
    document.getElementById(targetId).innerText = smooth.toFixed(2);
}
