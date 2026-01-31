const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const canvas = document.getElementById('miniGraph');
const ctx = canvas.getContext('2d');
let points = [];
let speedSamples = [];

function updateGauge(v, mode) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 950) / 950) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    document.getElementById('status-text').innerText = mode;
    points.push(v);
    if(points.length > 50) points.shift();
    drawGraph();
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    points.forEach((p, i) => {
        const x = (canvas.width / 50) * i;
        const y = canvas.height - (p / 950 * canvas.height);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true; points = []; speedSamples = [];
    
    // --- فحص الاستجابة العنيف (Ping & Jitter) لمدة 4 ثوانٍ ---
    document.getElementById('status-text').innerText = "تحليل النبض الشبكي...";
    let pings = [];
    const pStart = performance.now();
    while (performance.now() - pStart < 4000) {
        const s = performance.now();
        try {
            await fetch("https://www.google.com/generate_204", { mode: 'no-cors', cache: 'no-store' });
            pings.push(performance.now() - s);
        } catch(e) {}
        await new Promise(r => setTimeout(r, 100));
    }
    const minP = Math.min(...pings);
    const jitter = pings.length > 1 ? Math.abs(pings[pings.length-1] - pings[pings.length-2]) : 0;
    document.getElementById('ping-unloaded').innerText = minP.toFixed(0);
    document.getElementById('ping-loaded').innerText = jitter.toFixed(1);

    // --- فحص التنزيل الاحترافي ---
    await engine('DOWNLOAD', 15000, 'download');

    // --- فحص الرفع الخارق (تم حل مشكلة التوقف) ---
    speedSamples = [];
    await engine('UPLOAD', 12000, 'upload');

    btn.disabled = false;
    document.getElementById('status-text').innerText = "تم التحليل بنجاح";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // تقنية الرفع المستقر: استخدام دفعات بيانات أصغر وتكرار أسرع
    const chunk = new Uint8Array(512 * 1024); // 512KB لضمان عدم رفض السيرفر
    crypto.getRandomValues(chunk);

    const threads = mode === 'DOWNLOAD' ? 8 : 6; // تقليل الخيوط لزيادة جودة كل خيط
    const workers = Array(threads).fill(0).map(async () => {
        const url = mode === 'DOWNLOAD' ? 
            "https://speed.cloudflare.com/__down?bytes=500000000" : 
            "https://httpbin.org/post";

        while ((performance.now() - startTime) < duration) {
            try {
                if (mode === 'DOWNLOAD') {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        calculate(totalBytes, startTime, mode, targetId);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: chunk, signal: controller.signal });
                    totalBytes += chunk.length;
                    calculate(totalBytes, startTime, mode, targetId);
                }
            } catch (e) {
                if (e.name === 'AbortError') break;
                await new Promise(r => setTimeout(r, 100)); // انتظار بسيط في حال الخطأ ثم المحاولة مجدداً
            }
        }
    });
    await Promise.all(workers);
}

function calculate(total, start, mode, targetId) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1) return;

    // معامل التصحيح الهندسي لتعويض الفقد في المتصفح
    const compensation = mode === 'DOWNLOAD' ? 1.04 : 1.18;
    let mbps = (total * 8 * compensation) / elapsed / 1048576;

    speedSamples.push(mbps);
    if (speedSamples.length > 40) speedSamples.shift();
    
    // استخدام الوسيط (Median) بدلاً من المتوسط لتقليل القفزات المفاجئة
    const sorted = [...speedSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    updateGauge(median, mode === 'DOWNLOAD' ? "تحليل التنزيل..." : "تحليل الرفع...");
    document.getElementById(targetId).innerText = median.toFixed(2);
}
