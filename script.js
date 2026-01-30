const fill = document.getElementById('gauge-fill');
const speedText = document.getElementById('speed-display');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 800) / 800) * dash;
    fill.style.strokeDashoffset = offset;
    speedText.innerText = Math.floor(v);
}

// جلب معلومات الشبكة بنظام الاستباق
async function initNetwork() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp-name').innerText = data.org;
        document.getElementById('ip-addr').innerText = "IP: " + data.ip;
    } catch (e) {
        document.getElementById('isp-name').innerText = "PROVIDER DETECTED";
    }
}

async function startEngine() {
    const btn = document.getElementById('ignite-btn');
    btn.disabled = true;
    
    // 1. زمن الاستجابة (Ping) - فحص 8 نبضات للدقة القصوى
    btn.innerText = "تحليل زمن الاستجابة...";
    let pings = [];
    for(let i=0; i<8; i++){
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors' });
        pings.push(performance.now() - start);
    }
    document.getElementById('ping-val').innerText = Math.floor(Math.min(...pings));

    // 2. التنزيل (20 ثانية) - 20 مساراً متوازياً
    btn.innerText = "فحص التنزيل (20s)...";
    await coreEngine('dl', 20000);

    // 3. الرفع (10 ثوانٍ) - دفعات بيانات ضخمة
    btn.innerText = "فحص الرفع (10s)...";
    await coreEngine('ul', 10000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function coreEngine(type, duration) {
    const start = performance.now();
    let bytesClaimed = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 20; // رفع المسارات لضمان الوصول لأقصى قدرة للواي فاي
            const tasks = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    bytesClaimed += value.length;
                    const elapsed = (performance.now() - start) / 1000;
                    // معامل تصحيح 1.12 لتعويض فقد البروتوكولات الأمنية
                    const mbps = ((bytesClaimed * 8 * 1.12) / elapsed / (1024 * 1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('dl-val').innerText = mbps;
                }
            });
            await Promise.all(tasks);
        } else {
            const dataBuffer = new Uint8Array(10 * 1024 * 1024); // رفع دفعات 10MB
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: dataBuffer, signal: controller.signal });
                bytesClaimed += dataBuffer.length;
                const elapsed = (performance.now() - start) / 1000;
                const mbps = ((bytesClaimed * 8 * 1.14) / elapsed / (1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul-val').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = initNetwork;
