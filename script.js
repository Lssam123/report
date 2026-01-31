const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];

function updateGauge(v, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 600) / 600) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(1);
    document.getElementById('status-text').innerText = mode;
    
    points.push(v);
    if(points.length > 40) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = '#05ffa1';
    ctx.lineWidth = 2;
    points.forEach((p, i) => {
        const x = (canvas.width / 40) * i;
        const y = canvas.height - (p / 600 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    points = [];

    // 1. PING (يأخذ 5 ثوانٍ للتحليل الدقيق)
    document.getElementById('status-text').innerText = "تحليل الاستجابة...";
    let start = performance.now();
    await fetch("https://1.1.1.1/cdn-cgi/trace", {mode:'no-cors'});
    document.getElementById('ping').innerText = Math.floor(performance.now() - start);

    // 2. DOWNLOAD (20 ثانية لسحب كامل الطاقة)
    await engine('DOWNLOAD', 20000, 'download');

    // 3. UPLOAD (10 ثوانٍ)
    await engine('UPLOAD', 10000, 'upload');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
    document.getElementById('status-text').innerText = "اكتمل الفحص";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        const threads = 16;
        const tasks = Array(threads).fill(0).map(async () => {
            const res = await fetch(mode === 'DOWNLOAD' ? "https://speed.cloudflare.com/__down?bytes=500000000" : "https://httpbin.org/post", 
                { signal: controller.signal, method: mode === 'DOWNLOAD' ? 'GET' : 'POST', body: mode === 'DOWNLOAD' ? null : new Uint8Array(2*1024*1024) });
            
            if(mode === 'DOWNLOAD') {
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalBytes += value.length;
                    const mbps = (totalBytes * 8 * 1.09) / ((performance.now() - startTime)/1000) / (1024*1024);
                    updateGauge(mbps, mode);
                    document.getElementById(targetId).innerText = mbps.toFixed(1);
                }
            } else {
                while((performance.now() - startTime) < duration) {
                    await fetch("https://httpbin.org/post", { method: 'POST', body: new Uint8Array(1*1024*1024), signal: controller.signal });
                    totalBytes += 1*1024*1024;
                    const mbps = (totalBytes * 8 * 1.1) / ((performance.now() - startTime)/1000) / (1024*1024);
                    updateGauge(mbps, mode);
                    document.getElementById(targetId).innerText = mbps.toFixed(1);
                }
            }
        });
        await Promise.all(tasks);
    } catch(e) {}
}
