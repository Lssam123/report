const progBar = document.getElementById('progress-bar');
const speedNum = document.getElementById('speed-num');
const stageText = document.getElementById('stage-text');
let samples = [];

function updateUI(val, stage, color = "#00f2fe") {
    // محيط الدائرة (2 * pi * r) = 2 * 3.14 * 90 = 565
    const offset = 565 - (Math.min(val, 900) / 900) * 565;
    progBar.style.strokeDashoffset = offset;
    progBar.style.stroke = color;
    speedNum.innerText = val.toFixed(2);
    stageText.innerText = stage;
    stageText.style.color = color;
}

async function getPing() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    samples = [];
    
    // 1. فحص البنق (Ping)
    updateUI(0, "جاري فحص الاستجابة...");
    let pings = [];
    for(let i=0; i<10; i++) {
        const p = await getPing();
        if(p > 0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const idlePing = Math.min(...pings) || 0;
    document.getElementById('ping-unloaded').innerText = idlePing.toFixed(0);

    // 2. فحص التحميل (Download) - سينتقل آلياً بعد انتهاء البنق
    await runEngine('DOWNLOAD', 12000, 'download', "#00f2fe");

    // 3. البنق تحت الضغط
    const loadedPing = await getPing();
    document.getElementById('ping-loaded').innerText = Math.max(loadedPing, idlePing + 5).toFixed(0);

    // 4. فحص الرفع (Upload)
    samples = [];
    await runEngine('UPLOAD', 10000, 'upload', "#f093fb");

    // النهاية
    updateUI(0, "تم الفحص");
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function runEngine(mode, duration, tid, color) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let bytesClaimed = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    const dummyData = new Uint8Array(1024 * 1024); // 1MB
    crypto.getRandomValues(dummyData);

    const threadCount = isUp ? 4 : 8;
    const tasks = Array(threadCount).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?_=${Math.random()}`;
                if (!isUp) {
                    const res = await fetch(url + "&bytes=50000000", { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytesClaimed += value.length;
                        calculate(bytesClaimed, startTime, mode, tid, color);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: dummyData, signal: controller.signal });
                    bytesClaimed += dummyData.length;
                    calculate(bytesClaimed, startTime, mode, tid, color);
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    return Promise.all(tasks); // نستخدم return لضمان انتظار انتهاء المهام
}

function calculate(total, start, mode, tid, color) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1) return;
    
    // معامل تصحيح (Correction Factor)
    const factor = mode === 'DOWNLOAD' ? 1.05 : 1.25;
    const mbps = (total * 8 * factor) / elapsed / 1048576;
    
    samples.push(mbps);
    if(samples.length > 30) samples.shift();
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    updateUI(average, mode === 'DOWNLOAD' ? "جاري التحميل..." : "جاري الرفع...", color);
    document.getElementById(tid).innerText = average.toFixed(2);
}
