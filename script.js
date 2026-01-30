const fill = document.getElementById('gauge-fill');
const speedDisplay = document.getElementById('speed-num');

// وظيفة تحديث العداد بسلاسة
function updateUI(speed) {
    const max = 500; 
    const dash = 251.3;
    const offset = dash - (Math.min(speed, max) / max) * dash;
    fill.style.strokeDashoffset = offset;
    speedDisplay.innerText = Math.floor(speed);
}

// جلب مزود الخدمة الحقيقي فوراً
async function initNetwork() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp-name').innerText = data.org;
    } catch(e) { document.getElementById('isp-name').innerText = "PROVIDER DETECTED"; }
}

async function startTest() {
    const btn = document.getElementById('main-btn');
    btn.disabled = true;
    
    // 1. البينج السريع
    btn.innerText = "فحص الاستجابة...";
    const startPing = performance.now();
    await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors' });
    document.getElementById('ping').innerText = Math.floor(performance.now() - startPing);

    // 2. التحميل (15 ثانية) - انسيابي
    btn.innerText = "فحص التحميل الجاري...";
    await runEngine('dl', 15000);

    // 3. الرفع (5 ثوانٍ) - انسيابي
    btn.innerText = "فحص الرفع الجاري...";
    await runEngine('ul', 5000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runEngine(type, duration) {
    const startTime = performance.now();
    let bytesClaimed = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if (type === 'dl') {
            const threads = 8;
            const tasks = Array(threads).fill(0).map(async () => {
                const response = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = response.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    bytesClaimed += value.length;
                    const elapsed = (performance.now() - startTime) / 1000;
                    const mbps = ((bytesClaimed * 8) / elapsed / (1024 * 1024)).toFixed(1);
                    updateUI(parseFloat(mbps));
                    document.getElementById('download').innerText = mbps;
                }
            });
            await Promise.all(tasks);
        } else {
            const blob = new Blob([new Uint8Array(1024 * 1024 * 3)]); // 3MB chunk
            while((performance.now() - startTime) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: blob, signal: controller.signal });
                bytesClaimed += blob.size;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((bytesClaimed * 8) / elapsed / (1024 * 1024)).toFixed(1);
                updateUI(parseFloat(mbps));
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = initNetwork;
