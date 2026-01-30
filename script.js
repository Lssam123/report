const speedNum = document.getElementById('speed-num');
const gaugeFill = document.getElementById('gauge-fill');
const canvas = document.getElementById('liveGraph');
const ctx = canvas.getContext('2d');
let graphPoints = [];

// جلب المزود فقط (بدون IP) بدقة
async function getISP() {
    try {
        const res = await fetch('http://ip-api.com/json/?fields=isp');
        const data = await res.json();
        document.getElementById('isp-name').innerText = data.isp;
    } catch { document.getElementById('isp-name').innerText = "Active Network"; }
}

function updateUI(val, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(val, 500) / 500) * dash;
    gaugeFill.style.strokeDashoffset = offset;
    speedNum.innerText = val.toFixed(1);
    document.getElementById('current-mode').innerText = mode;
    
    // تحديث الرسم البياني
    graphPoints.push(val);
    if(graphPoints.length > 50) graphPoints.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = '#05ffa1';
    ctx.lineWidth = 2;
    graphPoints.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 500 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function igniteTest() {
    document.getElementById('startBtn').disabled = true;
    graphPoints = [];
    
    // 1. PING
    document.getElementById('current-mode').innerText = "PINGING";
    let start = performance.now();
    await fetch("https://1.1.1.1/cdn-cgi/trace", {mode:'no-cors'});
    document.getElementById('ping').innerText = (performance.now() - start).toFixed(1);

    // 2. DOWNLOAD (20 Seconds)
    await runEngine('DOWNLOAD', 20000, 'download');

    // 3. UPLOAD (10 Seconds)
    await runEngine('UPLOAD', 10000, 'upload');

    document.getElementById('startBtn').disabled = false;
    document.getElementById('current-mode').innerText = "FINISHED";
}

async function runEngine(mode, duration, elementId) {
    const start = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        const threads = 12;
        const tasks = Array(threads).fill(0).map(async () => {
            const url = mode === 'DOWNLOAD' ? "https://speed.cloudflare.com/__down?bytes=500000000" : "https://httpbin.org/post";
            const options = mode === 'DOWNLOAD' ? {signal: controller.signal} : {method:'POST', body: new Uint8Array(2*1024*1024), signal: controller.signal};
            
            const res = await fetch(url, options);
            if(mode === 'DOWNLOAD') {
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    bytes += value.length;
                    const mbps = (bytes * 8 * 1.1) / ((performance.now()-start)/1000) / (1024*1024);
                    updateUI(mbps, mode);
                    document.getElementById(elementId).innerText = mbps.toFixed(1);
                }
            } else {
                while((performance.now() - start) < duration) {
                    await fetch(url, options);
                    bytes += 2*1024*1024;
                    const mbps = (bytes * 8 * 1.1) / ((performance.now()-start)/1000) / (1024*1024);
                    updateUI(mbps, mode);
                    document.getElementById(elementId).innerText = mbps.toFixed(1);
                }
            }
        });
        await Promise.all(tasks);
    } catch(e) {}
}

window.onload = getISP;
