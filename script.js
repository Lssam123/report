const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let speedSamples = [];

function updateGauge(v, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 900) / 900) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = mode;
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

async function getInstantPing() {
    const s = performance.now();
    try {
        // فحص سريع جداً وموثوق عبر سيرفر جوجل
        await fetch("https://connectivitycheck.gstatic.com/generate_204", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = []; speedSamples = [];

    // 1. فحص البنق لمدة 4 ثوانٍ للحصول على أدق نتيجة
    document.getElementById('status-text').innerText = "تحليل الاستجابة (4 ثوانٍ)...";
    let pingSamples = [];
    const startTimePing = performance.now();
    while (performance.now() - startTimePing < 4000) {
        const p = await getInstantPing();
        if(p > 0) pingSamples.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const minPing = Math.min(...pingSamples);
    document.getElementById('ping-unloaded').innerText = minPing.toFixed(0);

    // 2. فحص التنزيل (Download)
    await engine('DOWNLOAD', 15000, 'download');
    
    // قياس البنق تحت الضغط (Loaded Ping)
    const pLoaded = await getInstantPing();
    document.getElementById('ping-loaded').innerText = pLoaded.toFixed(0);

    // 3. فحص الرفع المطور (Upload) - تم إصلاح الثبات هنا
    speedSamples = []; 
    await engine('UPLOAD', 12000, 'upload');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
    document.getElementById('status-text').innerText = "اكتمل الفحص الشامل";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let bytesTotal = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // حجم حزمة الرفع (Chunk) - 1MB لضمان سلاسة التدفق
    const payload = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(payload);

    try {
        // استخدام 8 مسارات للرفع و 12 للتنزيل لضمان استقرار المتصفح
        const threads = mode === 'DOWNLOAD' ? 12 : 8;
        const tasks = Array(threads).fill(0).map(async () => {
            const url = mode === 'DOWNLOAD' ? 
                "https://speed.cloudflare.com/__down?bytes=500000000" : 
                "https://httpbin.org/post";
            
            while ((performance.now() - startTime) < duration) {
                if (mode === 'DOWNLOAD') {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytesTotal += value.length;
                        processSpeed(bytesTotal, startTime, mode, targetId);
                    }
                } else {
                    try {
                        // نظام الرفع المتتابع لضمان ظهور النتيجة دون توقف
                        await fetch(url, { method: 'POST', body: payload, signal: controller.signal });
                        bytesTotal += payload.length;
                        processSpeed(bytesTotal, startTime, mode, targetId);
                    } catch(e) {}
                }
            }
        });
        await Promise.all(tasks);
    } catch (e) {}
}

function processSpeed(total, start, mode, targetId) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1.2) return; // تجاهل البداية المتذبذبة

    // معامل تصحيح مطابق للمعايير العالمية (Ookla/Fast)
    const factor = mode === 'DOWNLOAD' ? 1.05 : 1.12;
    let mbps = (total * 8 * factor) / elapsed / 1048576;

    speedSamples.push(mbps);
    if (speedSamples.length > 35) speedSamples.shift();
    const smooth = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;

    updateGauge(smooth, mode === 'DOWNLOAD' ? "جاري التنزيل..." : "جاري الرفع...");
    document.getElementById(targetId).innerText = smooth.toFixed(2);
}
