const fill = document.getElementById('gauge-fill');
const speedDisplay = document.getElementById('speed-val');

function updateUI(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 800) / 800) * dash;
    fill.style.strokeDashoffset = offset;
    speedDisplay.innerText = Math.floor(v);
}

// جلب معلومات الشبكة فوراً
async function getNetwork() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('isp').innerText = data.org;
        document.getElementById('ip').innerText = "IP: " + data.ip;
    } catch(e) { document.getElementById('isp').innerText = "PROVIDER ACTIVE"; }
}

async function ignite() {
    const btn = document.getElementById('main-btn');
    btn.disabled = true;
    
    // 1. زمن الاستجابة فائق السرعة
    const startPing = performance.now();
    await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors' });
    document.getElementById('ping').innerText = Math.floor(performance.now() - startPing);

    // 2. التحميل الذكي (بدون مدة محددة - ينتهي عند الاستقرار)
    btn.innerText = "جاري تحليل التدفق...";
    await smartEngine('dl');

    // 3. الرفع الذكي
    btn.innerText = "جاري تحليل الرفع...";
    await smartEngine('ul');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function smartEngine(type) {
    const startTime = performance.now();
    let totalBytes = 0;
    let lastSpeeds = [];
    const controller = new AbortController();

    return new Promise(async (resolve) => {
        // الأمان: إذا لم يستقر النت، ينتهي الفحص بعد 15 ثانية كحد أقصى
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            if(type === 'dl') {
                const threads = 24; // أقصى طاقة للمتصفح
                const tasks = Array(threads).fill(0).map(async () => {
                    const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                    const reader = res.body.getReader();
                    while(true) {
                        const {done, value} = await reader.read();
                        if(done) break;
                        totalBytes += value.length;
                        const mbps = calculateMbps(totalBytes, startTime);
                        updateUI(mbps);
                        document.getElementById('dl').innerText = mbps.toFixed(1);
                        
                        // نظام كشف الاستقرار: إذا لم تتغير السرعة كثيراً لمدة ثانيتين، ننهي الفحص
                        if(isStable(mbps, lastSpeeds)) { controller.abort(); break; }
                    }
                });
                await Promise.all(tasks);
            } else {
                const data = new Uint8Array(8 * 1024 * 1024);
                while(true) {
                    await fetch("https://httpbin.org/post", { method: 'POST', body: data, signal: controller.signal });
                    totalBytes += data.length;
                    const mbps = calculateMbps(totalBytes, startTime);
                    updateUI(mbps);
                    document.getElementById('ul').innerText = mbps.toFixed(1);
                    if(isStable(mbps, lastSpeeds)) { controller.abort(); break; }
                }
            }
        } catch(e) {}
        clearTimeout(timeout);
        resolve();
    });
}

function calculateMbps(bytes, start) {
    const sec = (performance.now() - start) / 1000;
    return (bytes * 8 * 1.12) / sec / (1024 * 1024);
}

function isStable(current, history) {
    history.push(current);
    if(history.length > 30) { // فحص آخر 30 قراءة
        history.shift();
        const avg = history.reduce((a, b) => a + b) / history.length;
        const diff = Math.abs(current - avg);
        return diff < 0.5; // إذا كان التذبذب أقل من 0.5 ميجا، استقر النت
    }
    return false;
}

window.onload = getNetwork;
