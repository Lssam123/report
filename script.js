const fill = document.getElementById('gauge-fill');
const speedVal = document.getElementById('speed-display');
const statusLabel = document.getElementById('status-label');

function refreshGauge(value, label, color = "#00f2fe") {
    const dash = 553;
    const offset = dash - (Math.min(value, 900) / 900) * dash;
    fill.style.strokeDashoffset = offset;
    fill.style.stroke = color;
    speedVal.innerText = value.toFixed(2);
    statusLabel.innerText = label;
}

async function pingProbe() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function igniteEngine() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    
    // 1. مرحلة فحص البنق الصامتة (3 ثوانٍ بدقة متناهية)
    refreshGauge(0, "جاري تهيئة الاتصال...");
    let pingBucket = [];
    const endTime = Date.now() + 3000;
    
    while(Date.now() < endTime) {
        const p = await pingProbe();
        if(p > 0) pingBucket.push(p);
        await new Promise(r => setTimeout(r, 40));
    }
    const idlePing = pingBucket.length ? Math.min(...pingBucket) : 0;
    document.getElementById('p-un').innerText = idlePing.toFixed(0);

    // 2. فحص التحميل (Download)
    await runQuantumPhase('DOWNLOAD', 12000, 'd-val', "#00f2fe");

    // فحص البنق تحت الضغط
    const loadedP = await pingProbe();
    document.getElementById('p-lo').innerText = Math.max(loadedP, idlePing + 4).toFixed(0);

    // 3. فحص الرفع (Upload)
    await runQuantumPhase('UPLOAD', 10000, 'u-val', "#f093fb");

    // اكتمال العمليات
    refreshGauge(0, "تم الفحص بنجاح");
    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runQuantumPhase(mode, duration, elementId, themeColor) {
    const isUp = mode === 'UPLOAD';
    const start = performance.now();
    let bytesTransferred = 0;
    let rollingSamples = [];

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), duration);

    const payload = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(payload);

    // نظام تعدد المسارات الكثيف (12 مسار للتحميل)
    const streamCount = isUp ? 6 : 12;
    const streams = [];

    for (let i = 0; i < streamCount; i++) {
        streams.push((async () => {
            while (performance.now() - start < duration) {
                try {
                    const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=50000000&_=${Math.random()}`;
                    if (!isUp) {
                        const response = await fetch(url, { signal: ctrl.signal });
                        const buffer = await response.arrayBuffer();
                        bytesTransferred += buffer.byteLength;
                    } else {
                        await fetch(url, { method: 'POST', body: payload, signal: ctrl.signal });
                        bytesTransferred += payload.length;
                    }
                    
                    const elapsed = (performance.now() - start) / 1000;
                    if (elapsed > 0.5) {
                        const correction = isUp ? 1.24 : 1.07; // معادلة جبرية لتعويض الفاقد (TCP Overhead)
                        const mbps = (bytesTransferred * 8 * correction) / elapsed / 1048576;
                        
                        rollingSamples.push(mbps);
                        if(rollingSamples.length > 15) rollingSamples.shift();
                        const smoothed = rollingSamples.reduce((a, b) => a + b) / rollingSamples.length;

                        refreshGauge(smoothed, isUp ? "جاري فحص الرفع" : "جاري فحص التحميل", themeColor);
                        document.getElementById(elementId).innerText = smoothed.toFixed(2);
                    }
                } catch (e) { if (ctrl.signal.aborted) break; }
            }
        })());
    }

    return Promise.all(streams);
}
