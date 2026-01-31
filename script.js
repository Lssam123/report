const progBar = document.getElementById('progress-bar');
const speedEl = document.getElementById('speed-num');
const stageEl = document.getElementById('stage-text');
let samples = [];

function updateUI(val, stage, color) {
    const offset = 565 - (Math.min(val, 900) / 900) * 565;
    progBar.style.strokeDashoffset = offset;
    progBar.style.stroke = color;
    speedEl.innerText = val.toFixed(2);
    stageEl.innerText = stage;
}

// دالة البنق المنفصلة
async function getPing() {
    try {
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch (e) { return 0; }
}

// المحرك الرئيسي لإدارة التدفق
async function mainFlow() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    
    // 1. مرحلة البنق (Ping)
    updateUI(0, "تحليل الاستجابة...", "#00f2fe");
    let pingSum = 0;
    for(let i=0; i<5; i++) {
        pingSum += await getPing();
        await new Promise(r => setTimeout(r, 100));
    }
    const avgPing = pingSum / 5;
    document.getElementById('ping-unloaded').innerText = avgPing.toFixed(0);

    // 2. مرحلة التحميل (Download)
    await runTest('DOWNLOAD', 10000, 'download', "#00f2fe");

    // 3. بنق تحت الضغط
    const loadedP = await getPing();
    document.getElementById('ping-loaded').innerText = Math.max(loadedP, avgPing + 5).toFixed(0);

    // 4. مرحلة الرفع (Upload)
    await runTest('UPLOAD', 10000, 'upload', "#f093fb");

    // النهاية
    updateUI(0, "اكتمل الفحص", "#00f2fe");
    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runTest(mode, duration, elementId, color) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let totalBytes = 0;
    samples = [];

    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // بيانات وهمية للرفع
    const blob = new Uint8Array(1024 * 1024); // 1MB
    crypto.getRandomValues(blob);

    const threads = isUp ? 4 : 6;
    const promises = [];

    for (let i = 0; i < threads; i++) {
        promises.push((async () => {
            while (performance.now() - startTime < duration) {
                try {
                    const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=${isUp ? '' : '25000000'}&_=${Math.random()}`;
                    
                    if (!isUp) {
                        const response = await fetch(url, { signal: controller.signal });
                        const reader = response.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            totalBytes += value.length;
                            calculate(totalBytes, startTime, mode, elementId, color);
                        }
                    } else {
                        await fetch(url, { method: 'POST', body: blob, signal: controller.signal });
                        totalBytes += blob.length;
                        calculate(totalBytes, startTime, mode, elementId, color);
                    }
                } catch (e) {
                    if (controller.signal.aborted) break;
                }
            }
        })());
    }

    await Promise.all(promises);
}

function calculate(total, start, mode, eid, color) {
    const now = performance.now();
    const duration = (now - start) / 1000;
    if (duration < 0.5) return;

    const correction = mode === 'DOWNLOAD' ? 1.05 : 1.25;
    const mbps = (total * 8 * correction) / duration / 1048576;
    
    samples.push(mbps);
    if (samples.length > 20) samples.shift();
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;

    updateUI(average, mode === 'DOWNLOAD' ? "جاري التحميل" : "جاري الرفع", color);
    document.getElementById(eid).innerText = average.toFixed(2);
}
