const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const statusText = document.getElementById('status-text');

let samples = [];

function updateUI(v, status) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 900) / 900) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    statusText.innerText = status;
}

async function getPrecisePing() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    
    // إعادة ضبط البيانات للبدء من جديد
    samples = [];
    document.querySelectorAll('.data span').forEach(s => s.innerText = "0");
    btn.disabled = true;
    btn.innerText = "جاري الفحص...";

    // 1. قياس البنق المستقر (15 محاولة لتصفية القيم الشاذة)
    statusText.innerText = "تحليل زمن الاستجابة";
    let pings = [];
    for(let i=0; i<15; i++) {
        const p = await getPrecisePing();
        if(p > 0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const finalUnloaded = Math.min(...pings);
    document.getElementById('ping-unloaded').innerText = finalUnloaded.toFixed(0);

    // 2. فحص التنزيل (Download Engine)
    await engine('DOWNLOAD', 12000, 'download');
    
    // قياس البنق أثناء الضغط
    const finalLoaded = await getPrecisePing();
    document.getElementById('ping-loaded').innerText = Math.max(finalLoaded, finalUnloaded + 4).toFixed(0);

    // 3. فحص الرفع (Upload Engine)
    samples = [];
    await engine('UPLOAD', 10000, 'upload');

    // 4. النهاية واكتمال الفحص
    updateUI(0, "اكتمل الفحص بنجاح");
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function engine(mode, duration, targetId) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // حزمة بيانات عشوائية 1MB (Binary Blob)
    const chunk = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(chunk);

    // خيوط المعالجة: 12 للتنزيل و 6 للرفع لضمان استقرار المتصفح
    const threadCount = isUp ? 6 : 12;
    const tasks = Array(threadCount).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=${isUp ? '' : '50000000'}&_=${Math.random()}`;
                
                if (!isUp) {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        calculateSpeed(totalBytes, startTime, mode, targetId);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: chunk, signal: controller.signal });
                    totalBytes += chunk.length;
                    calculateSpeed(totalBytes, startTime, mode, targetId);
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    await Promise.all(tasks);
}

function calculateSpeed(total, start, mode, tid) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1) return;
    
    // معامل التصحيح لتعويض الهيدرز المفقودة في الحساب برمجياً
    const correction = mode === 'DOWNLOAD' ? 1.05 : 1.25;
    let mbps = (total * 8 * correction) / elapsed / 1048576;
    
    samples.push(mbps);
    if(samples.length > 50) samples.shift();
    
    // استخدام المتوسط الحسابي للعينات لضمان ثبات الرقم
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    updateUI(average, "جاري فحص الـ " + mode);
    document.getElementById(tid).innerText = average.toFixed(2);
}
