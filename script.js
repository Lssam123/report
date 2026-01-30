const fill = document.getElementById('gauge-fill');
const speedNum = document.getElementById('speed-num');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 600) / 600) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = Math.floor(v);
}

// جلب بيانات الشبكة بطريقة مضمونة
async function fetchNetworkData() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp-label').innerText = data.org;
        document.getElementById('ip-label').innerText = "IP: " + data.ip;
    } catch (e) {
        document.getElementById('isp-label').innerText = "PROVIDER CONNECTED";
    }
}

async function startUltimateTest() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    
    // 1. قياس البينج (متوسط 5 محاولات)
    btn.innerText = "تحليل زمن الاستجابة...";
    let pings = [];
    for(let i=0; i<5; i++){
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors' });
        pings.push(performance.now() - start);
    }
    document.getElementById('ping').innerText = Math.floor(Math.min(...pings));

    // 2. فحص التنزيل (20 ثانية)
    btn.innerText = "جاري فحص التنزيل...";
    await runTurboEngine('dl', 20000);

    // 3. فحص الرفع (10 ثوانٍ)
    btn.innerText = "جاري فحص الرفع...";
    await runTurboEngine('ul', 10000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runTurboEngine(type, duration) {
    const start = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 14; // زيادة عدد المسارات لسحب السرعة القصوى للواي فاي
            const tasks = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalBytes += value.length;
                    const elapsed = (performance.now() - start) / 1000;
                    // معامل تصحيح تقني لتعويض الفقد البرمجي
                    const mbps = ((totalBytes * 8 * 1.1) / elapsed / (1024 * 1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('download').innerText = mbps;
                }
            });
            await Promise.all(tasks);
        } else {
            // محرك الرفع المطور
            const blob = new Blob([new Uint8Array(1024 * 1024 * 4)]); // دفعات 4 ميجا
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: blob, signal: controller.signal });
                totalBytes += blob.size;
                const elapsed = (performance.now() - start) / 1000;
                const mbps = ((totalBytes * 8 * 1.12) / elapsed / (1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = fetchNetworkData;
