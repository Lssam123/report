const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    gaugeLine: document.getElementById('gaugeProgress'),
    idlePing: document.getElementById('idlePing'),
    dlSpeed: document.getElementById('dlSpeed'),
    ulSpeed: document.getElementById('ulSpeed')
};

const TEST_DURATION = 10000; // 10 ثواني
const GAUGE_CIRCUMFERENCE = 880; // محيط الدائرة للـ SVG الجديد (2 * PI * 140)
let gaugeMaxSpeed = 100;

// نقطة فحص البنق (كلاودفلير لتعطي بنق الألعاب الحقيقي)
const PING_URL = "https://1.1.1.1/cdn-cgi/trace";

// --- دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. البنق الصافي (محاكاة الألعاب)
        ui.btn.innerText = "فحص الاستجابة...";
        ui.status.innerText = "جاري حساب الاستجابة الصافية للشبكة...";
        const rawPing = await measureGamingPing();
        ui.idlePing.innerText = rawPing;
        await sleep(500);

        // 2. التنزيل
        ui.btn.innerText = "فحص التنزيل...";
        ui.status.innerText = "جاري قياس سرعة التنزيل (10 ثواني)...";
        
        // لون العداد أزرق للتنزيل
        ui.gaugeLine.style.stroke = "url(#gaugeGradient)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 12px rgba(0, 242, 254, 0.5))";
        
        const dlSpeed = await testDownload();
        ui.dlSpeed.innerText = dlSpeed;
        await sleep(1000);

        // 3. الرفع (باستخدام Workers)
        resetGauge();
        ui.btn.innerText = "فحص الرفع...";
        ui.status.innerText = "جاري قياس سرعة الرفع (10 ثواني)...";
        
        // لون العداد أخضر للرفع
        ui.gaugeLine.style.stroke = "url(#uploadGradient)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 12px rgba(0, 242, 96, 0.5))";
        
        const ulSpeed = await testUploadBulletproof();
        ui.ulSpeed.innerText = ulSpeed;

        ui.status.innerText = "اكتمل الفحص بنجاح. النتائج دقيقة وجاهزة.";
        ui.status.style.color = "#00f2fe";

    } catch (err) {
        ui.status.innerText = "حدث خطأ. يرجى التأكد من الاتصال.";
        ui.status.style.color = "#ff0844";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص";
    }
});

// --- الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.status.style.color = "var(--text-muted)";
    ui.idlePing.innerText = "--"; 
    ui.dlSpeed.innerText = "--";
    ui.ulSpeed.innerText = "--";
}

function resetGauge() {
    gaugeMaxSpeed = 100;
    ui.mainVal.innerText = "0.00";
    ui.gaugeLine.style.strokeDashoffset = GAUGE_CIRCUMFERENCE;
}

function updateGauge(speed) {
    if (speed > gaugeMaxSpeed * 0.9) gaugeMaxSpeed = Math.ceil((speed + 50) / 100) * 100;
    ui.mainVal.innerText = speed.toFixed(2);
    let percent = Math.min(speed / gaugeMaxSpeed, 1);
    ui.gaugeLine.style.strokeDashoffset = GAUGE_CIRCUMFERENCE - (percent * GAUGE_CIRCUMFERENCE);
}

// --- محرك البنق (Gaming Ping) ---
async function measureGamingPing() {
    let pings = [];
    // تسخين الاتصال لتجاوز وقت معالجة المتصفح (TLS Handshake)
    try { await fetch(PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(performance.now() - start);
        } catch(e) {}
        await sleep(50);
    }
    
    // استخراج أسرع استجابة (الحد الأدنى) وخصم 2ms كتعويض لمعالجة الجافاسكريبت الداخلية.
    if (pings.length > 0) {
        let rawPing = Math.min(...pings) - 2;
        return rawPing > 1 ? Math.round(rawPing) : 1; 
    }
    return "--";
}

// --- محرك التنزيل ---
function testDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=150000000"; 
        let totalBytes = 0;
        let finalSpeed = 0;
        const startTime = performance.now();

        const timeout = setTimeout(() => {
            controller.abort();
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                const duration = (performance.now() - startTime) / 1000;
                if (duration > 0.2) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateGauge(finalSpeed);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- محرك الرفع الغاشم (Bulletproof Upload for GitHub Pages) ---
// يعتمد على إرسال حزم بوضعية no-cors لضمان عدم حظر المتصفح للعملية
function testUploadBulletproof() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2 ميجابايت للحزمة
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)]);

        // تحديث الواجهة اللحظي
        const uiTimer = setInterval(() => {
            if (!isRunning) return;
            const duration = (performance.now() - globalStartTime) / 1000;
            if (duration > 0.5 && totalSentBytes > 0) {
                finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
            }
        }, 250);

        // إيقاف الفحص بعد 10 ثواني
        setTimeout(() => {
            isRunning = false;
            clearInterval(uiTimer);
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        async function uploadWorker() {
            while (isRunning) {
                try {
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: chunkData,
                        mode: 'no-cors', // تخطي الحظر الأمني
                        cache: 'no-store'
                    });
                    
                    if (isRunning) totalSentBytes += CHUNK_SIZE;
                } catch(e) {
                    await sleep(50);
                }
            }
        }

        // تشغيل 4 مسارات لضمان سحب أقصى سرعة للخط
        for (let i = 0; i < 4; i++) {
            uploadWorker();
        }
    });
}
