const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];

function updateGauge(v, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 700) / 700) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(1);
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
        const y = canvas.height - (p / 700 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function getInstantPing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch (e) { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = [];

    // 1. زمن الاستجابة غير المثقل
    document.getElementById('status-text').innerText = "فحص الاستجابة الهادئة...";
    let unSamples = [];
    for(let i=0; i<6; i++) {
        unSamples.push(await getInstantPing());
        await new Promise(r => setTimeout(r, 100));
    }
    document.getElementById('ping-unloaded').innerText = Math.min(...unSamples).toFixed(0);

    // 2. التحميل + زمن الاستجابة المثقل (تحليل Bufferbloat)
    document.getElementById('status-text').innerText = "تحليل التحميل والضغط...";
    let loadedPings = [];
    const pingTracker = setInterval(async () => {
        const p = await getInstantPing();
        if(p > 0) loadedPings.push(p);
    }, 1000);

    await engine('DOWNLOAD', 20000, 'download');
    clearInterval(pingTracker);
    const avgLoaded = loadedPings.reduce((a,b) => a+b, 0) / loadedPings.length;
    document.getElementById('ping-loaded').innerText = avgLoaded ? avgLoaded.toFixed(0) : "--";

    // 3. الرفع المتوازي (24 مسار)
    await engine('UPLOAD', 12000, 'upload');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
    document.getElementById('status-text').innerText = "اكتمل التحليل النهائي";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let bytesTotal = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        const threads = mode === 'DOWNLOAD' ? 16 : 24;
        const payload = new Uint8Array(mode === 'DOWNLOAD' ? 0 : 8 * 1024 * 1024);
        if(mode === 'UPLOAD') crypto.getRandomValues(payload);

        const tasks = Array(threads).fill(0).map(async () => {
            if(mode === 'DOWNLOAD') {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    bytesTotal += value.length;
                    const mbps = (bytesTotal * 8 * 1.1) / ((performance.now()-startTime)/1000) / (1024*1024);
                    updateGauge(mbps, mode);
                    document.getElementById(targetId).innerText = mbps.toFixed(1);
                }
            } else {
                while((performance.now() - startTime) < duration) {
                    await fetch("https://httpbin.org/post", { method: 'POST', body: payload, signal: controller.signal });
                    bytesTotal += payload.length;
                    const mbps = (bytesTotal * 8 * 1.14) / ((performance.now()-startTime)/1000) / (1024*1024);
                    updateGauge(mbps, mode);
                    document.getElementById(targetId).innerText = mbps.toFixed(1);
                }
            }
        });
        await Promise.all(tasks);
    } catch(e) {}
}
