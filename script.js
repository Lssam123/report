const CONFIG = {
    // روابط الفحص (Cloudflare تعتبر الأسرع عالمياً للفحص الخام)
    DL_URL: "https://speed.cloudflare.com/__down?bytes=500000000", 
    UL_URL: "https://speed.cloudflare.com/__up",
    PING_URL: "https://1.1.1.1/cdn-cgi/trace",
    
    // الأوقات المحددة (بالملي ثانية)
    DL_DURATION: 15000, 
    UL_DURATION: 15000,
    PING_DURATION: 5000,
    
    WARM_UP: 3000,      // وقت تسخين الشبكة (3 ثوانٍ) لضمان استقرار التدفق
    THREADS: 32         // أقصى عدد مسارات متوازية لإشباع القناة
};

const UI = {
    live: document.getElementById('live-mbps'),
    dl: document.getElementById('res-dl'),
    ul: document.getElementById('res-ul'),
    pIdle: document.getElementById('res-ping-idle'),
    pLoaded: document.getElementById('res-ping-loaded'),
    status: document.getElementById('status'),
    btn: document.getElementById('start-btn')
};

// دالة قياس البنق المتقدمة (تعمل لمدة زمنية محددة وتأخذ متوسط العينات)
async function measurePrecisionPing(duration) {
    const startTime = performance.now();
    let samples = [];
    
    while (performance.now() - startTime < duration) {
        const start = performance.now();
        try {
            await fetch(`${CONFIG.PING_URL}?cb=${crypto.randomUUID()}`, { 
                mode: 'no-cors', cache: 'no-store', priority: 'high' 
            });
            samples.push(performance.now() - start);
        } catch (e) {}
        // تأخير بسيط جداً بين العينات لمنع حظر الجهاز
        await new Promise(r => setTimeout(r, 50)); 
    }
    
    if (samples.length === 0) return 0;
    
    // معالجة إحصائية: حذف أعلى وأقل 20% من النتائج (القيم الشاذة)
    samples.sort((a, b) => a - b);
    const startIdx = Math.floor(samples.length * 0.2);
    const endIdx = Math.floor(samples.length * 0.8);
    const validSamples = samples.slice(startIdx, endIdx);
    
    return Math.round(validSamples.reduce((a, b) => a + b, 0) / validSamples.length);
}

// المحرك الرئيسي للتحميل والرفع
async function runNetworkEngine(mode) {
    const duration = mode === 'DL' ? CONFIG.DL_DURATION : CONFIG.UL_DURATION;
    const startTime = performance.now();
    let totalBytes = 0;
    let actualStartTime = 0;
    let isStable = false;
    let loadedPings = [];
    const controller = new AbortController();

    // قياس البنق المثقل (تحت الضغط) بشكل متكرر
    const pingTracker = setInterval(async () => {
        if (isStable) {
            const p = await measurePrecisionPing(200); // عينة سريعة
            loadedPings.push(p);
            UI.pLoaded.innerText = p;
        }
    }, 500);

    const worker = async (id) => {
        // انطلاق تدريجي للمسارات لمنع اختناق المعالج
        await new Promise(r => setTimeout(r, id * 40)); 
        
        try {
            while (performance.now() - startTime < duration) {
                if (mode === 'DL') {
                    const res = await fetch(`${CONFIG.DL_URL}&r=${Math.random()}`, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        // بدء الحساب الفعلي بعد فترة التسخين
                        if (!isStable && (performance.now() - startTime > CONFIG.WARM_UP)) {
                            isStable = true;
                            actualStartTime = performance.now();
                            totalBytes = 0;
                        }
                        totalBytes += value.length;
                        updateUI(totalBytes, actualStartTime);
                    }
                } else {
                    const chunk = new Uint8Array(4 * 1024 * 1024); // 4MB Chunk للرفع
                    await fetch(CONFIG.UL_URL, {
                        method: 'POST',
                        body: chunk,
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                    if (!isStable && (performance.now() - startTime > CONFIG.WARM_UP)) {
                        isStable = true;
                        actualStartTime = performance.now();
                        totalBytes = 0;
                    }
                    totalBytes += chunk.byteLength;
                    updateUI(totalBytes, actualStartTime);
                }
            }
        } catch (e) {}
    };

    function updateUI(bytes, start) {
        if (!isStable) return;
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed > 0) {
            const mbps = ((bytes * 8) / (1024 * 1024)) / elapsed;
            UI.live.innerText = mbps.toFixed(2);
        }
    }

    // تشغيل 32 مساراً
    const workers = Array.from({ length: CONFIG.THREADS }, (_, i) => worker(i));
    
    await new Promise(r => setTimeout(r, duration));
    controller.abort();
    clearInterval(pingTracker);

    // حساب النتيجة النهائية بدقة
    const finalTime = (performance.now() - actualStartTime) / 1000;
    return ((totalBytes * 8) / (1024 * 1024)) / finalTime;
}

// تنفيذ الفحص بالترتيب المطلوب
UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    UI.status.innerText = "بدء الفحص الاحترافي بالترتيب المبرمج...";

    // 1. فحص التحميل (15 ثانية)
    UI.status.innerText = "1/3 جاري فحص سرعة التحميل (15 ثانية)...";
    const dlResult = await runNetworkEngine('DL');
    UI.dl.innerText = dlResult.toFixed(2);

    // 2. فحص الرفع (15 ثانية)
    UI.status.innerText = "2/3 جاري فحص سرعة الرفع (15 ثانية)...";
    UI.pLoaded.innerText = "0"; // قياس البنق المثقل أثناء الرفع أيضاً
    const ulResult = await runNetworkEngine('UL');
    UI.ul.innerText = ulResult.toFixed(2);

    // 3. فحص البنق (5 ثوانٍ)
    UI.status.innerText = "3/3 جاري تحليل البنق الصافي بدقة (5 ثوانٍ)...";
    UI.live.innerText = "0.00";
    const idlePing = await measurePrecisionPing(CONFIG.PING_DURATION);
    UI.pIdle.innerText = idlePing;

    UI.status.innerText = "اكتمل الفحص الشامل بدقة مطلقة.";
    UI.live.innerText = dlResult.toFixed(2);
    UI.btn.disabled = false;
    UI.btn.innerText = "إعادة الفحص";
};
