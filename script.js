const fill = document.getElementById('gauge-fill');
const speedNum = document.getElementById('speed-num');

function updateGauge(v) {
    const dash = 251.3;
    const offset = dash - (Math.min(v, 600) / 600) * dash;
    fill.style.strokeDashoffset = offset;
    speedNum.innerText = Math.floor(v);
}

// جلب معلومات الشبكة (ISP & IP) بموثوقية مضاعفة
async function getNetworkInfo() {
    try {
        // نستخدم ip-api لضمان جلب اسم الشركة (STC, Mobily, etc)
        const res = await fetch('http://ip-api.com/json/?fields=status,message,isp,query');
        const data = await res.json();
        if(data.status === "success") {
            document.getElementById('isp-name').innerText = data.isp;
            document.getElementById('ip-addr').innerText = "IP: " + data.query;
        } else {
            throw new Error();
        }
    } catch (e) {
        // مصدر بديل في حال تعطل الأول
        const res2 = await fetch('https://ipapi.co/json/');
        const data2 = await res2.json();
        document.getElementById('isp-name').innerText = data2.org;
        document.getElementById('ip-addr').innerText = "IP: " + data2.ip;
    }
}

async function startProTest() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    
    // 1. فحص الاستجابة (Ping)
    btn.innerText = "جاري القياس الحقيقي...";
    const pings = [];
    for(let i=0; i<5; i++){
        const start = performance.now();
        await fetch("https://www.google.com/generate_204", { mode: 'no-cors', cache: 'no-store' });
        pings.push(performance.now() - start);
    }
    document.getElementById('ping').innerText = Math.floor(Math.min(...pings));

    // 2. التحميل (20 ثانية) لضمان أقصى دقة
    btn.innerText = "فحص التحميل (20s)...";
    await engine('dl', 20000);

    // 3. الرفع (10 ثواني)
    btn.innerText = "فحص الرفع (10s)...";
    await engine('ul', 10000);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function engine(type, duration) {
    const start = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    try {
        if(type === 'dl') {
            const threads = 12; // زيادة عدد المسارات لسحب السرعة كاملة
            const workers = Array(threads).fill(0).map(async () => {
                const res = await fetch("https://speed.cloudflare.com/__down?bytes=500000000", { signal: controller.signal });
                const reader = res.body.getReader();
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    bytes += value.length;
                    const mbps = ((bytes * 8 * 1.08) / ((performance.now()-start)/1000) / (1024*1024)).toFixed(1);
                    updateGauge(mbps);
                    document.getElementById('download').innerText = mbps;
                }
            });
            await Promise.all(workers);
        } else {
            // رفع بيانات حقيقية (Upload)
            const chunk = new Uint8Array(4 * 1024 * 1024); // 4MB
            while((performance.now() - start) < duration) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: chunk, signal: controller.signal });
                bytes += chunk.length;
                const mbps = ((bytes * 8 * 1.1) / ((performance.now()-start)/1000) / (1024*1024)).toFixed(1);
                updateGauge(mbps);
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch(e) {}
}

window.onload = getNetworkInfo;
