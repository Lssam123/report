// --- 1. إعداد العداد الدائري (Gauge Setup) ---
const canvas = document.getElementById('speedGauge');

// تخصيص مظهر العداد (الألوان، السمك، المؤشر)
var opts = {
    angle: -0.2, // انحناء البداية
    lineWidth: 0.2, // سمك الخط الداخلي
    radiusScale: 1, // مقياس القطر
    pointer: {
        length: 0.6, // طول المؤشر
        strokeWidth: 0.04, // سمك المؤشر
        color: '#fff' // لون المؤشر
    },
    limitMax: false,     // إذا true، سيتوقف المؤشر عند Max
    limitMin: false,     // إذا false، لن يتوقف عند Min
    colorStart: '#4facfe',   // لون البداية (أزرق)
    colorStop: '#00f2fe',    // لون النهاية (فيروزي لامع)
    strokeColor: '#2a2a4a',  // لون الخلفية الرمادي للعداد
    generateGradient: true,
    highDpiSupport: true,     // دعم الشاشات عالية الدقة
    // تخصيص المناطق الملونة (اختياري)
    staticZones: [
        {strokeStyle: "#3a3a5a", min: 0, max: 20}, // سرعة منخفضة
        {strokeStyle: "#4facfe", min: 20, max: 100}, // سرعة متوسطة
        {strokeStyle: "#00f2fe", min: 100, max: 500}, // سرعة عالية
        {strokeStyle: "#a2a8d3", min: 500, max: 1000} // سرعة فائقة
    ],
};
var gauge = new Gauge(canvas).setOptions(opts); // إنشاء الكائن

// تحديد الحدود القصوى للعداد (مثلاً 500 ميجابت)
gauge.maxValue = 500; 
gauge.setMinValue(0);  
gauge.animationSpeed = 32; // سرعة تحرك المؤشر (أكبر = أسرع)
gauge.set(0); // البدء من الصفر

// --- 2. منطق فحص السرعة المتطور ---

const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('status');
const mainSpeedDisplay = document.getElementById('mainSpeedValue');

const ui = {
    bestServer: document.getElementById('bestServer'),
    bestPing: document.getElementById('bestPing'),
    downloadSpeed: document.getElementById('downloadSpeed'),
    uploadSpeed: document.getElementById('uploadSpeed')
};

// قائمة الشركات السعودية لفحص البنق
const telecomServers = [
    { name: "STC", url: "https://www.stc.com.sa/" },
    { name: "Mobily", url: "https://www.mobily.com.sa/" },
    { name: "Zain", url: "https://sa.zain.com/" },
    { name: "Salam", url: "https://salam.sa/" }
];

startBtn.addEventListener('click', async () => {
    // إعادة ضبط الواجهة
    startBtn.disabled = true;
    startBtn.innerText = "جاري الفحص...";
    gauge.set(0); // تصفير العداد بصرياً
    mainSpeedDisplay.innerText = "0.00";
    
    ui.bestServer.innerText = "--"; ui.bestPing.innerText = "(-- ms)";
    ui.downloadSpeed.innerText = "--"; ui.uploadSpeed.innerText = "--";
    
    try {
        // 1. فحص البنق
        statusText.innerText = "الخطوة 1: فحص استجابة السيرفرات السعودية...";
        const bestTelco = await findBestPing();
        ui.bestServer.innerText = bestTelco.name;
        ui.bestPing.innerText = `(${bestTelco.ping} ms)`;
        await wait(500); // وقت راحة بسيط بين الفحوصات

        // 2. فحص التحميل مع تحريك العداد
        statusText.innerText = "الخطوة 2: فحص سرعة التحميل (Cloudflare)...";
        const dlSpeed = await measureSpeedAndUpdateGauge('download');
        ui.downloadSpeed.innerText = dlSpeed;
        await wait(500);

        // 3. فحص الرفع مع تحريك العداد
        statusText.innerText = "الخطوة 3: فحص سرعة الرفع (Cloudflare)...";
        // قبل فحص الرفع، نعيد العداد للصفر ليعطي شعوراً ببدء فحص جديد
        gauge.set(0); mainSpeedDisplay.innerText = "0.00"; 
        await wait(300);
        
        const ulSpeed = await measureSpeedAndUpdateGauge('upload');
        ui.uploadSpeed.innerText = ulSpeed;

        statusText.innerText = "تم الفحص بنجاح! شكراً لاستخدامك Pro.";
    } catch (error) {
        statusText.innerText = "حدث خطأ غير متوقع. جرب مرة أخرى.";
        statusText.style.color = "#ff4f4f";
    } finally {
        startBtn.disabled = false;
        startBtn.innerText = "إعادة الفحص الشامل";
        // عند الانتهاء، نثبت العداد على 0 أو نتركه على آخر نتيجة (الرفع)
        // لنتركه على آخر نتيجة الرفع ليكون منظره أجمل.
    }
});

// دالة مساعدة للانتظار
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// دالة لمعرفة السيرفر صاحب أقل بنق
async function findBestPing() {
    let best = { name: "غير معروف", ping: Infinity };
    
    for (let server of telecomServers) {
        const pingTime = await measureHttpPing(server.url);
        if (pingTime < best.ping) {
            best = { name: server.name, ping: pingTime };
        }
    }
    return best.ping === Infinity ? { name: "فشل الاتصال", ping: "--" } : best;
}

// دالة لحساب البنق لـ URL معين
async function measureHttpPing(url) {
    const start = performance.now();
    try {
        await fetch(url + '?nocache=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
        const end = performance.now();
        return Math.round(end - start);
    } catch (e) {
        return Infinity;
    }
}

// دالة متطورة تقوم بالفحص وتحديث العداد بصرياً أثناء القياس
async function measureSpeedAndUpdateGauge(type) {
    let speedMbps = 0;
    
    // إعدادات الفحص
    const downloadSize = 25000000; // زدت الحجم لـ 25 ميجا ليكون الفحص أدق ويأخذ وقتاً للعداد
    const uploadSize = 10000000;   // 10 ميجا للرفع
    
    // سنقوم بتشغيل الفحص الفعلي
    if (type === 'download') {
        const url = `https://speed.cloudflare.com/__down?bytes=${downloadSize}`;
        
        // لمحاكاة حركة المؤشر بسلاسة، سنقوم بتحريكه تدريجياً للسرعة النهائية
        // هذا لأن المتصفح لا يعطينا السرعة اللحظية بدقة أثناء الـ fetch الواحد.
        const start = performance.now();
        await fetch(url, { cache: 'no-store' });
        const end = performance.now();
        
        const durationInSeconds = (end - start) / 1000;
        const bitsLoaded = downloadSize * 8;
        speedMbps = (bitsLoaded / durationInSeconds) / 1000000;
    } else {
        const payload = new Uint8Array(uploadSize);
        const url = "https://speed.cloudflare.com/__up";
        
        const start = performance.now();
        await fetch(url, { method: 'POST', body: payload });
        const end = performance.now();
        
        const durationInSeconds = (end - start) / 1000;
        const bitsLoaded = uploadSize * 8;
        speedMbps = (bitsLoaded / durationInSeconds) / 1000000;
    }

    // --- تحريك العداد للنتيجة النهائية ---
    let finalSpeed = parseFloat(speedMbps.toFixed(2));
    
    // إذا كانت السرعة أعلى من الحد الأقصى للعداد، نرفع الحد ديناميكياً
    if (finalSpeed > gauge.maxValue) {
        gauge.maxValue = Math.ceil(finalSpeed / 100) * 100; // تقريب لأقرب 100
    }

    // تحريك المؤشر وتحديث النص
    gauge.set(finalSpeed); 
    mainSpeedDisplay.innerText = finalSpeed.toFixed(2);
    
    // ننتظر قليلاً حتى تنتهي أنيمايشن المؤشر قبل إرجاع النتيجة
    await wait(1000); 
    return finalSpeed.toFixed(2);
}
