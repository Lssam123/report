const fill = document.getElementById('gauge-fill');
const mbpsDisplay = document.getElementById('mbps-val');
const btn = document.getElementById('action-btn');

// تحديث العداد والتأثيرات البصرية
function updateDisplay(speed) {
    // تحديث الدائرة
    const limit = 565;
    const offset = limit - (limit * (Math.min(speed, 100) / 100));
    fill.strokeDashoffset = offset;

    // تحديث الرقم
    mbpsDisplay.innerText = Math.floor(speed);

    // تطوير: تكبير الحكم (Dynamic Scaling)
    const scale = 1 + (speed / 300); 
    mbpsDisplay.style.transform = `scale(${scale})`;

    // تغيير اللون عند تخطي سرعة 60 Mbps
    if (speed > 60) {
        fill.style.stroke = "#ff006e";
        fill.style.filter = "drop-shadow(0 0 15px #ff006e)";
    } else {
        fill.style.stroke = "#00f2fe";
        fill.style.filter = "drop-shadow(0 0 12px #00f2fe)";
    }
}

async function runQuantumTest() {
    btn.disabled = true;
    document.getElementById('btn-label').innerText = "جاري سحب البيانات...";
    document.getElementById('status-text').innerText = "تحميل...";

    // 1. قياس Ping حقيقي
    const pStart = performance.now();
    try {
        await fetch('https://www.cloudflare.com/cdn-cgi/trace', { mode: 'no-cors' });
        document.getElementById('ping-val').innerText = Math.floor(performance.now() - pStart);
    } catch(e) { console.log("Ping error"); }

    // 2. محرك القياس الحقيقي (25MB Stream)
    // هذا الرابط يدعم CORS عالمياً ويضمن عمل الزر
    const testURL = "https://speed.cloudflare.com/__down?bytes=25000000";
    const startTime = performance.now();
    let receivedBytes = 0;

    try {
        const response = await fetch(testURL + "&nocache=" + Math.random());
        const reader = response.body.getReader();

        while(true) {
            const {done, value} = await reader.read();
            if (done) break;

            receivedBytes += value.length;
            const now = performance.now();
            const duration = (now - startTime) / 1000; // بالثواني
            
            // حساب السرعة الحقيقية Mbps
            const mbps = ((receivedBytes * 8) / (duration * 1024 * 1024)).toFixed(1);
            
            updateDisplay(parseFloat(mbps));
        }

        document.getElementById('status-text').innerText = "اكتمل";
        document.getElementById('btn-label').innerText = "إعادة الفحص";
        btn.disabled = false;

    } catch (err) {
        alert("خطأ في الاتصال بالسيرفر. تأكد من جودة الإنترنت.");
        btn.disabled = false;
        document.getElementById('btn-label').innerText = "حاول مرة أخرى";
    }
}

// جلب الـ IP والموقع تلقائياً
fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => {
        document.getElementById('network-info').innerText = "SERVER: GLOBAL | IP: " + data.ip;
    });
