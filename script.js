const fill = document.getElementById('gauge-fill');
const speedVal = document.getElementById('speed-val');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 600) / 600) * dash;
    fill.style.strokeDashoffset = offset;
    speedVal.innerText = Math.floor(v);
}

// جلب ISP دقيق و IP رباعي حصراً
async function getNetworkInfo() {
    try {
        // استخدام API يجبر العودة بـ IPv4
        const res = await fetch('https://api.ipify.org?format=json');
        const ipData = await res.json();
        const ip = ipData.ip;
        
        // جلب اسم المزود بناءً على الـ IP
        const resIsp = await fetch(`http://ip-api.com/json/${ip}`);
        const ispData = await resIsp.json();
        
        document.getElementById('isp-label').innerText = ispData.isp || "Internet Provider";
        document.getElementById('ip-label').innerText = "IPv4: " + ip;
    } catch (e) {
        document.getElementById('isp-label').innerText = "اتصال واي فاي نشط";
    }
}

async function runProTest() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    
    // 1. PING (يأخذ 3 ثوانٍ للتحليل)
    btn.innerText = "جاري تحليل الاستجابة...";
    let pings = [];
    for(let i=0; i<6; i++) {
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        pings.push(performance.now() - start);
        await new Promise(r => setTimeout(r, 500)); // تأخير بسيط للمظهر
    }
    document.getElementById('ping').innerText = Math.floor(Math.min(...pings));

    // 2. DOWNLOAD (مدة ثابتة 25 ثانية للدقة)
    btn.innerText = "جاري فحص التنزيل (25s)...";
    await performEngine('dl', 25000);

    // 3. UPLOAD (مدة ثابتة 15 ثانية للدقة)
    btn.innerText = "جاري فحص الرفع (15s)...";
    await performEngine('ul', 15000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function performEngine(type, duration) {
    const start = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 12; 
            const workers = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    bytes += value.length;
                    const elapsed = (performance.now() - start) / 1000;
                    const mbps = ((bytes * 8 * 1.08) / elapsed / (1024 * 1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('dl').innerText = mbps;
                }
            });
            await Promise.all(workers);
        } else {
            // رفع بيانات حقيقي
            const data = new Uint8Array(4 * 1024 * 1024);
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: data, signal: controller.signal });
                bytes += data.length;
                const elapsed = (performance.now() - start) / 1000;
                const mbps = ((bytes * 8 * 1.1) / elapsed / (1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getNetworkInfo;
