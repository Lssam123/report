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
    ctx.beginPath();
    ctx.strokeStyle = '#05ffa1';
    ctx.lineWidth = 2;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 700 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    points = [];
    
    // 1. المطور: PING & JITTER (10 محاولات)
    document.getElementById('status-text').innerText = "تحليل الاستجابة...";
    document.getElementById('ping-card').classList.add('active');
    let samples = [];
    for(let i=0; i<10; i++) {
        const s = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", {mode:'no-cors', cache:'no-store'});
        samples.push(performance.now() - s);
        await new Promise(r => setTimeout(r, 80));
    }
    const bestPing = Math.min(...samples);
    let jitter = 0;
    for(let i=1; i<samples.length; i++) jitter += Math.abs(samples[i] - samples[i-1]);
    document.getElementById('ping').innerText = bestPing.toFixed(0);
    document.getElementById('jitter').innerText = (jitter/9).toFixed(1);
    document.getElementById('ping-card').classList.remove('active');

    // 2. DOWNLOAD (20 ثانية)
    document.getElementById('dl-card').classList.add('active');
    await engine('DOWNLOAD', 20000, 'download');
    document.getElementById('dl-card').classList.remove('active');

    // 3. المطور: UPLOAD (12 ثانية - 24 قناة)
    document.getElementById('ul-card').classList.add('active');
    await engine('UPLOAD', 12000, 'upload');
    document.getElementById('ul-card').classList.remove('active');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
    document.getElementById('status-text').innerText = "اكتمل الفحص";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let bytesTotal = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    const uploadPayload = new Uint8Array(8 * 1024 * 1024); // 8MB payload
    crypto.getRandomValues(uploadPayload);

    try {
        const threads = mode === 'DOWNLOAD' ? 16 : 24;
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
                    await fetch("https://httpbin.org/post", { method: 'POST', body: uploadPayload, signal: controller.signal });
                    bytesTotal += uploadPayload.length;
                    const mbps = (bytesTotal * 8 * 1.14) / ((performance.now()-startTime)/1000) / (1024*1024);
                    updateGauge(mbps, mode);
                    document.getElementById(targetId).innerText = mbps.toFixed(1);
                }
            }
        });
        await Promise.all(tasks);
    } catch(e) {}
}
