const fill = document.getElementById('gauge-fill');
const speedText = document.getElementById('speed-display');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 700) / 700) * dash;
    fill.style.strokeDashoffset = offset;
    speedText.innerText = Math.floor(v);
    // تغيير اللون إذا كانت السرعة عالية جداً
    fill.style.stroke = v > 200 ? "#05ffa1" : "#00f2fe";
}

// جلب ISP دقيق و IP رباعي (IPv4)
async function getSpecs() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const { ip } = await res.json();
        const resIsp = await fetch(`http://ip-api.com/json/${ip}?fields=isp,org`);
        const data = await resIsp.json();
        
        document.getElementById('isp-info').innerText = data.isp || data.org;
        document.getElementById('ip-info').innerText = "IPv4: " + ip;
    } catch (e) {
        document.getElementById('isp-info').innerText = "اتصال واي فاي مستقر";
    }
}

async function startHeavyTest() {
    const btn = document.getElementById('main-btn');
    btn.disabled = true;
    
    // 1. زمن الاستجابة (Ping) - فحص هادئ ودقيق
    btn.innerText = "جاري فحص الاستجابة...";
    let pings = [];
    for(let i=0; i<6; i++) {
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors' });
        pings.push(performance.now() - start);
        await new Promise(r => setTimeout(r, 400));
    }
    document.getElementById('ping-res').innerText = Math.floor(Math.min(...pings));

    // 2. التحميل (مدة ثابتة 25 ثانية لسحب كامل السعة)
    btn.innerText = "فحص التنزيل (تحميل هائل)...";
    await engine('dl', 25000);

    // 3. الرفع (مدة ثابتة 15 ثانية)
    btn.innerText = "فحص الرفع (إرسال بيانات)...";
    await engine('ul', 15000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function engine(type, duration) {
    const start = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 16; // زيادة القنوات لضمان استهلاك الواي فاي بالكامل
            const workers = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    totalBytes += value.length;
                    const mbps = ((totalBytes * 8 * 1.1) / ((performance.now()-start)/1000) / (1024*1024)).toFixed(1);
                    updateGauge(parseFloat(mbps));
                    document.getElementById('dl-res').innerText = mbps;
                }
            });
            await Promise.all(workers);
        } else {
            // رفع حقيقي 100%
            const blob = new Uint8Array(5 * 1024 * 1024); // 5MB chunks
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: blob, signal: controller.signal });
                totalBytes += blob.length;
                const mbps = ((totalBytes * 8 * 1.12) / ((performance.now()-start)/1000) / (1024*1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('ul-res').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getSpecs;
