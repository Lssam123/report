const bar = document.getElementById('progress-bar');
const speedNum = document.getElementById('speed-num');
const stageTxt = document.getElementById('stage-text');

function updateGauge(val, stage, color = "#00f2fe") {
    const dash = 534;
    const offset = dash - (Math.min(val, 900) / 900) * dash;
    bar.style.strokeDashoffset = offset;
    bar.style.stroke = color;
    speedNum.innerText = val.toFixed(2);
    stageTxt.innerText = stage;
}

// دالة فحص البنق (Ping) بمعالجة أخطاء صارمة
async function getPing() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch {
        return 0;
    }
}

async function initiatePerfectTest() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    
    try {
        // 1. مرحلة البنق (3 ثوانٍ صامتة)
        updateGauge(0, "جاري التهيئة...");
        let pings = [];
        const pingEnd = Date.now() + 3000;
        while(Date.now() < pingEnd) {
            const p = await getPing();
            if(p > 0) pings.push(p);
            await new Promise(r => setTimeout(r, 100));
        }
        document.getElementById('p-val').innerText = pings.length ? Math.min(...pings).toFixed(0) : "0";

        // 2. مرحلة التحميل (Download) - انتقال إجباري
        await runPhase('DOWNLOAD', 10000, 'd-val', "#00f2fe");

        // 3. مرحلة الرفع (Upload) - انتقال إجباري
        await runPhase('UPLOAD', 10000, 'u-val', "#f093fb");

    } catch (err) {
        console.error("Critical Error:", err);
    } finally {
        updateGauge(0, "تم الفحص");
        btn.disabled = false;
        btn.innerText = "إعادة الفحص";
    }
}

async function runPhase(mode, duration, targetId, color) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let totalBytes = 0;
    let samples = [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), duration);

    // حزمة بيانات للرفع
    const blob = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(blob);

    const threads = isUp ? 4 : 8;
    const workers = [];

    for (let i = 0; i < threads; i++) {
        workers.push((async () => {
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

                    const elapsed = (performance.now() - startTime) / 1000;
                    if (elapsed > 0.2) {
                        const mbps = (totalBytes * 8 * (isUp ? 1.25 : 1.06)) / elapsed / 1048576;
                        samples.push(mbps);
                        if(samples.length > 10) samples.shift();
                        const avg = samples.reduce((a,b)=>a+b)/samples.length;
                        
                        updateGauge(avg, isUp ? "جاري الرفع..." : "جاري التحميل...", color);
                        document.getElementById(targetId).innerText = avg.toFixed(2);
                    }
                } catch (e) {
                    if (controller.signal.aborted) break;
                    await new Promise(r => setTimeout(r, 100)); // تهدئة الطلبات عند الخطأ
                }
            }
        })());
    }

    await Promise.allSettled(workers); // ضمان انتظار كافة "الخيوط" حتى لو فشل بعضها
    clearTimeout(timeout);
}
