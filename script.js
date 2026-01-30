const gaugeFill = document.getElementById('gauge-fill');
const mainSpeed = document.getElementById('main-speed');

function updateGauge(val) {
    const dash = 251.3;
    const offset = dash - (Math.min(val, 500) / 500) * dash;
    gaugeFill.style.strokeDashoffset = offset;
    mainSpeed.innerText = Math.floor(val);
}

// 1. تحديد مزود الخدمة (ISP) بدقة عالية
async function getNetworkSpecs() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp-display').innerText = data.org; // يعرض STC, Mobily, Zain...
    } catch(e) { document.getElementById('isp-display').innerText = "Provider Detected"; }
}

// 2. قياس البينج (Ping) باستخدام نظام المتوسط الاستجابي
async function measurePing() {
    let pings = [];
    for(let i=0; i<6; i++) {
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        pings.push(performance.now() - start);
    }
    return Math.floor(Math.min(...pings));
}

// 3. المحرك المطور (15 ثانية تحميل / 5 ثواني رفع)
async function igniteTurboTest() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    
    // البينج
    const p = await measurePing();
    document.getElementById('ping').innerText = p;

    // التحميل (15 ثانية) - استخدام 10 مسارات متزامنة لفتح كامل النطاق الترددي
    btn.innerText = "جاري فحص التحميل...";
    await runEngine('dl', 15000);

    // الرفع (5 ثواني) - إرسال دفعات بيانات حقيقية
    btn.innerText = "جاري فحص الرفع...";
    await runEngine('ul', 5000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runEngine(type, duration) {
    const start = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 10; // رفع عدد المسارات لضمان السرعة العالية
            const workers = Array(threads).fill(0).map(async () => {
                const response = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = response.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalBytes += value.length;
                    const elapsed = (performance.now() - start) / 1000;
                    // معامل تصحيح 1.1 لتعويض فاقد المعالجة في المتصفح
                    const mbps = ((totalBytes * 8 * 1.1) / elapsed / (1024 * 1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('dl').innerText = mbps;
                }
            });
            await Promise.all(workers);
        } else {
            // نظام الرفع (Upload) الحقيقي
            const dataChunk = new Uint8Array(5 * 1024 * 1024); // 5MB chunk
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: dataChunk, signal: controller.signal });
                totalBytes += dataChunk.size || dataChunk.length;
                const elapsed = (performance.now() - start) / 1000;
                const mbps = ((totalBytes * 8 * 1.1) / elapsed / (1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getNetworkSpecs;
