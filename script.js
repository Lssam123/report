const meter = document.getElementById('meter');
const mbpsDisplay = document.getElementById('mbps');

function updateGauge(speed) {
    const maxSpeed = 100; // يمكنك تغييره لـ 1000 إذا كان النت سريع جداً
    const percentage = Math.min(speed / maxSpeed, 1);
    const offset = 565 - (565 * percentage);
    meter.style.strokeDashoffset = offset;
    mbpsDisplay.innerText = speed;
}

async function startUltraTest() {
    const btn = document.getElementById('test-btn');
    btn.disabled = true;
    btn.innerText = "جاري التحليل...";

    try {
        // 1. فحص البينج
        const startPing = Date.now();
        await fetch('https://www.cloudflare.com/cdn-cgi/trace', { mode: 'no-cors' });
        const ping = Date.now() - startPing;
        document.getElementById('ping-result').innerText = ping + " ms";

        // 2. فحص التحميل (استخدام ملف كبير لضمان الدقة)
        // سنستخدم رابط عشوائي من صور عالية الدقة لتجنب الكاش
        const downloadUrl = "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070";
        const startTime = Date.now();
        const response = await fetch(downloadUrl + "&t=" + startTime);
        const reader = response.body.getReader();
        let loaded = 0;

        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            loaded += value.length;
            
            const duration = (Date.now() - startTime) / 1000;
            const mbps = ((loaded * 8) / (duration * 1024 * 1024)).toFixed(1);
            
            if (duration > 0.1) updateGauge(mbps);
        }

        const finalDuration = (Date.now() - startTime) / 1000;
        const finalMbps = ((loaded * 8) / (finalDuration * 1024 * 1024)).toFixed(1);
        
        document.getElementById('dl-result').innerText = finalMbps + " Mbps";
        btn.innerText = "فحص جديد";
        btn.disabled = false;

    } catch (e) {
        console.error(e);
        btn.innerText = "خطأ في الاتصال";
        btn.disabled = false;
    }
}

// جلب الـ IP
fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => document.getElementById('ip-addr').innerText = "IP: " + d.ip);
