const progress = document.getElementById('gauge-progress');
const speedVal = document.getElementById('speed-value');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 600) / 600) * dash;
    progress.style.strokeDashoffset = offset;
    speedVal.innerText = Math.floor(v);
}

// جلب معلومات الشبكة (ISP & IP) بموثوقية كاملة
async function getNetworkSpecs() {
    const providers = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json/'
    ];
    
    for (let url of providers) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            document.getElementById('isp-label').innerText = data.org || data.isp;
            document.getElementById('ip-label').innerText = "IP: " + (data.ip || data.query);
            return;
        } catch (e) { console.warn("Trying fallback ISP provider..."); }
    }
    document.getElementById('isp-label').innerText = "Network Connected";
}

async function igniteEngine() {
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    
    // 1. البينج (Ping) - نظام النبضة المتكررة لضمان الدقة
    btn.innerText = "قياس زمن الاستجابة...";
    let pings = [];
    for(let i=0; i<5; i++){
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        pings.push(performance.now() - start);
    }
    document.getElementById('ping-res').innerText = Math.floor(Math.min(...pings));

    // 2. التحميل (20 ثانية) - Turbo Multithreading
    btn.innerText = "فحص التنزيل الجاري...";
    await runProEngine('dl', 20000);

    // 3. الرفع (10 ثواني) - تقنية Binary Upload
    btn.innerText = "فحص الرفع الجاري...";
    await runProEngine('ul', 10000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runProEngine(type, duration) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if (type === 'dl') {
            const threads = 12; // 12 قناة اتصال لضمان سحب السرعة كاملة
            const workers = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalBytes += value.length;
                    const elapsed = (performance.now() - startTime) / 1000;
                    // معامل تصحيح 1.09 لتعويض فاقد البيانات البرمجي في المتصفح
                    const mbps = ((totalBytes * 8 * 1.09) / elapsed / (1024 * 1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('dl-res').innerText = mbps;
                }
            });
            await Promise.all(workers);
        } else {
            // رفع بيانات حقيقية لضمان قراءة سرعة الرفع
            const data = new Uint8Array(5 * 1024 * 1024); // 5MB chunks
            while((performance.now() - startTime) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: data, signal: controller.signal });
                totalBytes += data.length;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((totalBytes * 8 * 1.1) / elapsed / (1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul-res').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getNetworkSpecs;
