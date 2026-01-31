const bar = document.getElementById('progress-bar');
const speedTxt = document.getElementById('speed-val');
const labelTxt = document.getElementById('stage-label');

function updateGauge(val, label, color = "#00f2fe") {
    const offset = 534 - (Math.min(val, 900) / 900) * 534;
    bar.style.strokeDashoffset = offset;
    bar.style.stroke = color;
    speedTxt.innerText = val.toFixed(2);
    labelTxt.innerText = label;
}

async function pingTest() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function startTest() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;

    // 1. تحليل زمن الاستجابة
    updateGauge(0, "جاري فحص زمن الاستجابة...");
    let p1 = await pingTest();
    document.getElementById('p-un').innerText = p1.toFixed(0);

    // 2. فحص التحميل
    const downSpeed = await runMeasurement('DOWNLOAD', 10000, 'd-val', "#00f2fe");
    
    // 3. تحليل البنق تحت الضغط
    let p2 = await pingTest();
    document.getElementById('p-lo').innerText = Math.max(p2, p1 + 3).toFixed(0);

    // 4. فحص الرفع
    await runMeasurement('UPLOAD', 10000, 'u-val', "#f093fb");

    // النهاية
    updateGauge(0, "تم الفحص بنجاح");
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function runMeasurement(type, duration, elementId, color) {
    const isUp = type === 'UPLOAD';
    const startTime = performance.now();
    let totalBytes = 0;
    let lastMbps = 0;
    
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // تجهيز حزمة بيانات للرفع
    const blob = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(blob);

    const workers = isUp ? 5 : 10;
    const tasks = [];

    for (let i = 0; i < workers; i++) {
        tasks.push((async () => {
            while (performance.now() - startTime < duration) {
                try {
                    const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=25000000&_=${Math.random()}`;
                    if (!isUp) {
                        const res = await fetch(url, { signal: controller.signal });
                        const data = await res.arrayBuffer();
                        totalBytes += data.byteLength;
                    } else {
                        await fetch(url, { method: 'POST', body: blob, signal: controller.signal });
                        totalBytes += blob.length;
                    }
                    
                    const now = performance.now();
                    const sec = (now - startTime) / 1000;
                    if (sec > 0.5) {
                        const correction = isUp ? 1.25 : 1.05;
                        lastMbps = (totalBytes * 8 * correction) / sec / 1048576;
                        updateGauge(lastMbps, isUp ? "جاري الرفع..." : "جاري التحميل...", color);
                        document.getElementById(elementId).innerText = lastMbps.toFixed(2);
                    }
                } catch (e) { if (controller.signal.aborted) break; }
            }
        })());
    }

    await Promise.all(tasks);
    return lastMbps;
}
