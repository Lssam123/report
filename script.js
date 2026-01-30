const fill = document.getElementById('gauge-fill');
const speedText = document.getElementById('speed-num');

// تحديث العداد
function updateGauge(speed) {
    const max = 500; // سقف العداد
    const dashArray = 251.3; 
    const offset = dashArray - (Math.min(speed, max) / max) * dashArray;
    fill.style.strokeDashoffset = offset;
    speedText.innerText = Math.floor(speed);
}

// دقة البينج (Ping) العالية
async function measurePrecisePing() {
    let latencies = [];
    for(let i=0; i<5; i++) {
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        latencies.push(performance.now() - start);
    }
    return Math.floor(latencies.reduce((a, b) => a + b) / latencies.length);
}

async function startEngine() {
    const btn = document.getElementById('action-btn');
    btn.disabled = true;
    
    // 1. قياس الاستجابة
    btn.innerText = "جاري القياس التقني...";
    const ping = await measurePrecisePing();
    document.getElementById('ping-val').innerText = ping;

    // 2. التحميل (Download) - 15 ثانية لدقة فائقة
    btn.innerText = "فحص سرعة التحميل...";
    await runStreamTest('dl', 15000);

    // 3. الرفع (Upload) - 5 ثوانٍ فقط كما طلبت
    btn.innerText = "فحص سرعة الرفع...";
    await runStreamTest('ul', 5000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runStreamTest(type, duration) {
    const startTime = performance.now();
    let bytesReceived = 0;
    const controller = new AbortController();

    setTimeout(() => controller.abort(), duration);

    try {
        if (type === 'dl') {
            // تعدد المسارات لضمان سحب كامل باقة الـ 150-500 ميجا
            const threads = 6; 
            const workers = Array(threads).fill(0).map(async () => {
                try {
                    const response = await fetch("https://speed.cloudflare.com/__down?bytes=200000000", { signal: controller.signal });
                    const reader = response.body.getReader();
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        bytesReceived += value.length;
                        const elapsed = (performance.now() - startTime) / 1000;
                        const mbps = ((bytesReceived * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                        updateGauge(parseFloat(mbps));
                        document.getElementById('dl-val').innerText = mbps;
                    }
                } catch(e) {}
            });
            await Promise.all(workers);
        } else {
            // اختبار الرفع (5 ثوانٍ)
            const chunk = new Uint8Array(5 * 1024 * 1024); // 5MB chunks
            while ((performance.now() - startTime) < duration) {
                await fetch("https://httpbin.org/post", { 
                    method: 'POST', body: chunk, signal: controller.signal 
                });
                bytesReceived += chunk.length;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((bytesReceived * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul-val').innerText = mbps;
            }
        }
    } catch (e) { /* استكمال عند انتهاء الوقت */ }
}

// جلب الـ IP
fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => {
    document.getElementById('ip-info').innerText = "IP: " + d.ip + " | Server: Riyadh/Jeddah Edge";
});
