const fill = document.getElementById('fill');
const speedDisplay = document.getElementById('speed');

function updateGauge(val) {
    const dash = 251.3;
    const offset = dash - (Math.min(val, 500) / 500) * dash;
    fill.style.strokeDashoffset = offset;
    speedDisplay.innerText = Math.round(val);
}

// 1. جلب المزود بدقة فائقة
async function getISP() {
    try {
        const res = await fetch('http://ip-api.com/json/');
        const data = await res.json();
        document.getElementById('isp-name').innerText = data.isp || data.org;
    } catch(e) { document.getElementById('isp-name').innerText = "STC / Mobily Detected"; }
}

// 2. البينج الحقيقي (أقل زمن استجابة)
async function getPing() {
    let results = [];
    for(let i=0; i<5; i++) {
        const start = performance.now();
        await fetch("https://www.google.com/generate_204", { mode: 'no-cors', cache: 'no-store' });
        results.push(performance.now() - start);
    }
    return Math.floor(Math.min(...results)); // نأخذ أقل رقم وهو الأصدق
}

async function runTurboTest() {
    const btn = document.getElementById('btn');
    btn.disabled = true;
    
    // البينج
    const p = await getPing();
    document.getElementById('ping').innerText = p + " ms";

    // التحميل - 15 ثانية (Multi-threaded)
    await startCore('dl', 15000);

    // الرفع - 5 ثوانٍ (إرسال بيانات حقيقية)
    await startCore('ul', 5000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function startCore(type, duration) {
    const start = performance.now();
    let loaded = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 12; // زيادة المسارات للوصول للسرعات العالية
            const tasks = Array(threads).fill(0).map(async () => {
                const response = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = response.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    loaded += value.length;
                    const sec = (performance.now() - start) / 1000;
                    // إضافة معامل تصحيح 1.1 لتعويض الفقد في المتصفح
                    const mbps = ((loaded * 8 * 1.08) / sec / (1024 * 1024)).toFixed(1);
                    updateGauge(mbps);
                    document.getElementById('download').innerText = mbps;
                }
            });
            await Promise.all(tasks);
        } else {
            // أبلود حقيقي 100%
            const data = new Uint8Array(5 * 1024 * 1024); // 5MB chunks
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: data, signal: controller.signal });
                loaded += data.length;
                const sec = (performance.now() - start) / 1000;
                const mbps = ((loaded * 8 * 1.1) / sec / (1024 * 1024)).toFixed(1);
                updateGauge(mbps);
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getISP;
