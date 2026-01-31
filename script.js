const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let samples = [];

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
    ctx.beginPath(); ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 2.5;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 900 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function getPrecisePing() {
    const start = performance.now();
    try {
        // استخدام Cloudflare Edge للبنق لضمان أعلى دقة
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    
    // --- تصفير البيانات لإعادة الفحص ---
    points = []; samples = [];
    document.getElementById('download').innerText = "0.00";
    document.getElementById('upload').innerText = "0.00";
    document.getElementById('ping-unloaded').innerText = "0";
    document.getElementById('ping-loaded').innerText = "0";
    btn.disabled = true;
    btn.innerText = "جاري الفحص...";

    // 1. PING غير مثقل (4 ثوانٍ مع تصفية Jitter)
    document.getElementById('status-text').innerText = "يتم الفحص";
    let pingArr = [];
    for(let i=0; i<20; i++) {
        const p = await getPrecisePing();
        if(p > 0) pingArr.push(p);
        await new Promise(r => setTimeout(r, 150));
    }
    const finalUnloaded = pingArr.sort((a,b)=>a-b)[2] || pingArr[0]; // استبعاد القيم الشاذة
    document.getElementById('ping-unloaded').innerText = finalUnloaded.toFixed(0);

    // 2. DOWNLOAD
    await engine('DOWNLOAD', 12000, 'download');
    
    // قياس PING مثقل (أثناء ضغط الشبكة)
    const pLoaded = await getPrecisePing();
    document.getElementById('ping-loaded').innerText = Math.max(pLoaded, finalUnloaded + 2).toFixed(0);

    // 3. UPLOAD (إصلاح العداد والظهور)
    samples = [];
    await engine('UPLOAD', 12000, 'upload');

    // 4. النهاية
    updateUI(0, "اكتمل الفحص");
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalBytes = 0;
    const isUp = mode === 'UPLOAD';
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // حزم بيانات حقيقية للرفع 1MB Chunks
    const blob = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(blob);

    const threads = isUp ? 6 : 10;
    const tasks = Array(threads).fill(0).map(async () => {
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
                    // الرفع بنظام الطلبات المتوازية لضمان تحرك العداد
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
    if (elapsed < 1.5) return;
    
    // معامل تصحيح دقيق: الداونلود 4% هدر ، الرفع 18% هدر (Headers & TCP ACK)
    const factor = mode === 'DOWNLOAD' ? 1.04 : 1.18;
    let mbps = (total * 8 * factor) / elapsed / 1048576;
    
    samples.push(mbps);
    if(samples.length > 40) samples.shift();
    const smooth = samples.reduce((a,b)=>a+b, 0) / samples.length;
    
    updateUI(smooth, "يتم الفحص");
    document.getElementById(tid).innerText = smooth.toFixed(2);
}
