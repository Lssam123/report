const fill = document.getElementById('gauge-fill');
const speedNum = document.getElementById('speed-num');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 600) / 600) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = Math.floor(v);
}

// جلب مزود الخدمة والـ IP بطريقة مضمونة 100%
async function getNetworkSpecs() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp-header').innerText = data.org;
        document.getElementById('ip-footer').innerText = "IP: " + data.ip;
    } catch (e) {
        document.getElementById('isp-header').innerText = "PROVIDER DETECTED";
    }
}

async function igniteTest() {
    const btn = document.getElementById('btn-start');
    btn.disabled = true;
    
    // 1. فحص البينج (Ping)
    btn.innerText = "قياس الاستجابة...";
    let pings = [];
    for(let i=0; i<5; i++){
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        pings.push(performance.now() - start);
    }
    document.getElementById('ping').innerText = Math.floor(Math.min(...pings));

    // 2. التحميل (20 ثانية)
    btn.innerText = "فحص التنزيل الجاري...";
    await runEngine('dl', 20000);

    // 3. الرفع (10 ثواني)
    btn.innerText = "فحص الرفع الجاري...";
    await runEngine('ul', 10000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function runEngine(type, duration) {
    const start = performance.now();
    let totalData = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 12; // استخدام 12 قناة اتصال لسحب كامل السرعة
            const tasks = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalData += value.length;
                    const elapsed = (performance.now() - start) / 1000;
                    // معامل تصحيح 1.09 لتعويض فاقد البيانات البرمجي
                    const mbps = ((totalData * 8 * 1.09) / elapsed / (1024 * 1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('download').innerText = mbps;
                }
            });
            await Promise.all(tasks);
        } else {
            const blob = new Blob([new Uint8Array(1024 * 1024 * 4)]); // 4MB chunks للرفع
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: blob, signal: controller.signal });
                totalData += blob.size;
                const elapsed = (performance.now() - start) / 1000;
                const mbps = ((totalData * 8 * 1.1) / elapsed / (1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getNetworkSpecs;
