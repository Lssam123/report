const CONFIG = {
    DL_URL: "https://speed.cloudflare.com/__down?bytes=500000000", // زيادة الحجم لـ 500MB لضمان استمرار الفحص
    UL_URL: "https://speed.cloudflare.com/__up",
    PING_URL: "https://1.1.1.1/cdn-cgi/trace",
    THREADS: 32, 
    WARM_UP: 3000,      // زيادة وقت التسخين لـ 3 ثوانٍ لاستقرار البروتوكول
    TEST_DURATION: 15000 // زيادة مدة الفحص لـ 15 ثانية لدقة متناهية
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

// خوارزمية البنق الاحترافية (Micro-sampling)
async function getHighPrecisionPing() {
    let samples = [];
    for (let i = 0; i < 25; i++) {
        const start = performance.now();
        try {
            await fetch(`${CONFIG.PING_URL}?cb=${crypto.randomUUID()}`, { 
                mode: 'no-cors', cache: 'no-store', priority: 'high' 
            });
            samples.push(performance.now() - start);
        } catch (e) {}
    }
    samples.sort((a, b) => a - b);
    // حذف أطراف العينات (الأعلى والأقل) لحساب الوسط الحقيقي
    const middle = samples.slice(5, 20);
    return Math.round(middle.reduce((a, b) => a + b, 0) / middle.length);
}

async function runProfessionalEngine(mode) {
    const startTime = performance.now();
    let totalBytes = 0;
    let calculationStartTime = 0;
    let isStable = false;
    let loadedPings = [];
    const controller = new AbortController();

    // فحص البنق المثقل بشكل دوري أثناء الضغط
    const pingInterval = setInterval(async () => {
        if (isStable) {
            const p = await getHighPrecisionPing();
            loadedPings.push(p);
            UI.pLoaded.innerText = p;
        }
    }, 400);

    const worker = async (id) => {
        // إضافة تأخير بسيط بين انطلاق كل مسار (Staggered Start) لتجنب صدمة الشبكة
        await new Promise(r => setTimeout(r, id * 50)); 
        
        try {
            while (performance.now() - startTime < CONFIG.TEST_DURATION) {
                if (mode === 'DL') {
                    const res = await fetch(`${CONFIG.DL_URL}&r=${Math.random()}`, { 
                        signal: controller.signal,
                        priority: 'high'
                    });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        if (!isStable && (performance.now() - startTime > CONFIG.WARM_UP)) {
                            isStable = true;
                            calculationStartTime = performance.now();
                            totalBytes = 0;
                        }
                        
                        totalBytes += value.length;
                        updateDisplay(totalBytes, calculationStartTime);
                    }
                } else {
                    // الرفع: استخدام Chunk ضخم لتقليل الضغط على المعالج وزيادة دقة النقل
                    const data = new Uint8Array(4 * 1024 * 1024); // 4MB
                    await fetch(CONFIG.UL_URL, {
                        method: 'POST',
                        body: data,
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                    
                    if (!isStable && (performance.now() - startTime > CONFIG.WARM_UP)) {
                        isStable = true;
                        calculationStartTime = performance.now();
                        totalBytes = 0;
                    }
                    totalBytes += data.byteLength;
                    updateDisplay(totalBytes, calculationStartTime);
                }
            }
        } catch (e) {}
    };

    function updateDisplay(bytes, start) {
        if (!isStable) return;
        const now = performance.now();
        const duration = (now - start) / 1000;
        if (duration > 0.1) {
            const mbps = ((bytes * 8) / (1024 * 1024)) / duration;
            UI.live.innerText = mbps.toFixed(2);
        }
    }

    // إطلاق المسارات الـ 32 بنظام التدرج
    const workers = [];
    for (let i = 0; i < CONFIG.THREADS; i++) {
        workers.push(worker(i));
    }

    await new Promise(r => setTimeout(r, CONFIG.TEST_DURATION));
    controller.abort();
    clearInterval(pingInterval);

    // حساب النتيجة النهائية بدقة (المتوسط العام لفترة الاستقرار)
    const finalDuration = (performance.now() - calculationStartTime) / 1000;
    const finalMbps = ((totalBytes * 8) / (1024 * 1024)) / finalDuration;
    
    if (loadedPings.length > 0) {
        UI.pLoaded.innerText = Math.round(loadedPings.reduce((a,b)=>a+b, 0) / loadedPings.length);
    }

    return finalMbps;
}

UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    UI.status.innerText = "تحليل البنق الصافي (Idle)...";
    UI.pIdle.innerText = await getHighPrecisionPing();

    UI.status.innerText = "فحص التحميل الاحترافي (15 ثانية)...";
    const dlResult = await runProfessionalEngine('DL');
    UI.dl.innerText = dlResult.toFixed(2);

    UI.status.innerText = "فحص الرفع الاحترافي (15 ثانية)...";
    UI.pLoaded.innerText = "0"; // تصفير للقياس أثناء الرفع
    const ulResult = await runProfessionalEngine('UL');
    UI.ul.innerText = ulResult.toFixed(2);

    UI.status.innerText = "اكتمل الفحص بأعلى معايير الدقة.";
    UI.live.innerText = dlResult.toFixed(2);
    UI.btn.disabled = false;
};
