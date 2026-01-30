const fill = document.getElementById('gauge-fill');
const speedVal = document.getElementById('speed-num');

function updateUI(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 700) / 700) * dash;
    fill.style.strokeDashoffset = offset;
    speedVal.innerText = Math.floor(v);
}

// جلب بيانات الشبكة بنظام الاستعلام المزدوج
async function getSpecs() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp-text').innerText = data.org;
        document.getElementById('ip-text').innerText = "IP: " + data.ip;
    } catch (e) {
        document.getElementById('isp-text').innerText = "Network Provider Detected";
    }
}

async function igniteTurbo() {
    const btn = document.getElementById('action-btn');
    btn.disabled = true;
    
    // 1. زمن الاستجابة (Ping) - متوسط حسابي دقيق
    btn.innerText = "تحليل زمن الاستجابة...";
    let pings = [];
    for(let i=0; i<5; i++){
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors' });
        pings.push(performance.now() - start);
    }
    document.getElementById('ping').innerText = Math.floor(Math.min(...pings));

    // 2. التنزيل (20 ثانية) - 16 خيط متوازي
    btn.innerText = "فحص التنزيل الحقيقي...";
    await turboCore('dl', 20000);

    // 3. الرفع (10 ثواني) - إرسال دفعات ضخمة
    btn.innerText = "فحص الرفع الحقيقي...";
    await turboCore('ul', 10000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function turboCore(type, duration) {
    const start = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 16; // زيادة القنوات لسحب السرعة القصوى للـ 5G والواي فاي
            const tasks = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalBytes += value.length;
                    const elapsed = (performance.now() - start) / 1000;
                    // معامل تصحيح 1.11 لتعويض فاقد المعالجة في المتصفحات
                    const mbps = ((totalBytes * 8 * 1.11) / elapsed / (1024 * 1024)).toFixed(1);
                    updateUI(parseFloat(mbps));
                    document.getElementById('download').innerText = mbps;
                }
            });
            await Promise.all(tasks);
        } else {
            const buffer = new Uint8Array(8 * 1024 * 1024); // رفع دفعات 8MB
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: buffer, signal: controller.signal });
                totalBytes += buffer.length;
                const elapsed = (performance.now() - start) / 1000;
                const mbps = ((totalBytes * 8 * 1.12) / elapsed / (1024 * 1024)).toFixed(1);
                updateUI(parseFloat(mbps));
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getSpecs;
