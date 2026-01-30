const fill = document.getElementById('gauge-fill');
const speedText = document.getElementById('speed-num');

function updateGauge(speed) {
    const max = 500; 
    const dashArray = 251.3; 
    const offset = dashArray - (Math.min(speed, max) / max) * dashArray;
    fill.style.strokeDashoffset = offset;
    speedText.innerText = Math.floor(speed);
}

// جلب بيانات الشركة والموقع بدقة
async function fetchNetworkInfo() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        document.getElementById('isp-name').innerText = data.org; // اسم شركة الإنترنت
        document.getElementById('ip-info').innerText = `IP: ${data.ip} | City: ${data.city}`;
    } catch (e) {
        document.getElementById('isp-name').innerText = "مزود خدمة غير معروف";
    }
}

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
    
    const ping = await measurePrecisePing();
    document.getElementById('ping-val').innerText = ping;

    // تحميل متوازي لـ 15 ثانية (لأقصى سرعة)
    btn.innerText = "فحص التحميل (15s)...";
    await runMultiThreadedTest('dl', 15000);

    // رفع لـ 5 ثوانٍ
    btn.innerText = "فحص الرفع (5s)...";
    await runMultiThreadedTest('ul', 5000);

    btn.disabled = false;
    btn.innerText = "فحص جديد";
}

async function runMultiThreadedTest(type, duration) {
    const startTime = performance.now();
    let bytesTotal = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if (type === 'dl') {
            // استخدام 8 مسارات متوازية لسحب أقصى سرعة (Turbo Mode)
            const threads = 8;
            const workers = Array(threads).fill(0).map(async () => {
                try {
                    const response = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                    const reader = response.body.getReader();
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        bytesTotal += value.length;
                        const elapsed = (performance.now() - startTime) / 1000;
                        const mbps = ((bytesTotal * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                        updateGauge(parseFloat(mbps));
                        document.getElementById('dl-val').innerText = mbps;
                    }
                } catch(e) {}
            });
            await Promise.all(workers);
        } else {
            // تحسين دقة الرفع
            const chunk = new Uint8Array(8 * 1024 * 1024); // 8MB لكل دفعة
            while ((performance.now() - startTime) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: chunk, signal: controller.signal });
                bytesTotal += chunk.length;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((bytesTotal * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul-val').innerText = mbps;
            }
        }
    } catch (e) {}
}

// تشغيل جلب المعلومات عند فتح الصفحة
fetchNetworkInfo();
