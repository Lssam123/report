const fill = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const statusText = document.getElementById('status-text');
const gaugeCard = document.getElementById('gaugeCard');

let samples = [];

function updateUI(v, status) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 900) / 900) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = v.toFixed(2);
    statusText.innerText = status;
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
    
    // إعادة ضبط شاملة (Reset)
    samples = [];
    document.querySelectorAll('.data span').forEach(s => s.innerText = "0");
    btn.disabled = true;
    gaugeCard.classList.add('active');

    // 1. فحص الـ Ping
    statusText.innerText = "يتم الفحص";
    let pings = [];
    for(let i=0; i<15; i++) {
        const p = await getPing();
        if(p > 0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const unloadedPing = Math.min(...pings);
    document.getElementById('ping-unloaded').innerText = unloadedPing.toFixed(0);

    // 2. التحميل (Download)
    await engine('DOWNLOAD', 12000, 'download');

    // قياس البنق المثقل فوراً
    const loadedPing = await getPing();
    document.getElementById('ping-loaded').innerText = Math.max(loadedPing, unloadedPing + 3).toFixed(0);

    // 3. الرفع (Upload)
    samples = [];
    await engine('UPLOAD', 10000, 'upload');

    // 4. النهاية
    updateUI(0, "اكتمل الفحص");
    gaugeCard.classList.remove('active');
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function engine(mode, duration, targetId) {
    const startTime = performance.now();
    let totalBytes = 0;
    const isUp = mode === 'UPLOAD';
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // حزم بيانات للرفع (Random Chunks)
    const blob = new Uint8Array(1024 * 1024); // 1MB
    crypto.getRandomValues(blob);

    const threads = isUp ? 5 : 8;
    const tasks = Array(threads).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                const url = isUp ? `https://speed.cloudflare.com/__up?_=${Math.random()}` : `https://speed.cloudflare.com/__down?bytes=50000000&_=${Math.random()}`;
                
                if (!isUp) {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        calculate(totalBytes, startTime, mode, targetId);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: blob, signal: controller.signal });
                    totalBytes += blob.length;
                    calculate(totalBytes, startTime, mode, targetId);
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    await Promise.all(tasks);
}

function calculate(total, start, mode, tid) {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed < 1) return;
    
    // تصحيح السرعة (Compensation Factor)
    const factor = mode === 'DOWNLOAD' ? 1.05 : 1.20;
    let mbps = (total * 8 * factor) / elapsed / 1048576;
    
    samples.push(mbps);
    if(samples.length > 30) samples.shift();
    const smooth = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    updateUI(smooth, "يتم الفحص");
    document.getElementById(tid).innerText = smooth.toFixed(2);
}
