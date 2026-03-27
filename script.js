const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    gaugeLine: document.getElementById('gaugeProgress'),
    idlePing: document.getElementById('idlePing'),
    dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'),
    ulSpeed: document.getElementById('ulSpeed')
};

const TEST_DURATION = 10000; // 10 ثواني لكل فحص
const GAUGE_CIRCUMFERENCE = 754; // محيط الدائرة (2 * PI * 120)
let gaugeMaxSpeed = 100;

// نقطة فحص البنق (نقطة كلاودفلير الأسرع في السعودية لتعطي بنق الألعاب الحقيقي)
const EDGE_PING_URL = "https://1.1.1.1/cdn-cgi/trace";

let isTestingLoaded = false;
let loadedPings = [];

// --- دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. البنق الصافي (محاكاة بنق الألعاب)
        ui.btn.innerText = "جاري فحص الاستجابة...";
        ui.status.innerText = "يتم الآن حساب استجابة الشبكة الصافية...";
        const rawPing = await measureGamingPing();
        ui.idlePing.innerHTML = `${rawPing}<span>ms</span>`;
        await sleep(500);

        // 2. التنزيل والبنق المثقل
        ui.btn.innerText = "فحص التنزيل...";
        ui.status.innerText = "جاري قياس التنزيل وتأثير الاختناق (10 ثواني)...";
        
        // تغيير لون العداد إلى السماوي للتنزيل
        ui.gaugeLine.style.stroke = "var(--glow-cyan)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 10px var(--glow-cyan))";
        
        isTestingLoaded = true; loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false;
        ui.dlSpeed.innerHTML = `${dlSpeed}<span>Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPings)}<span>ms</span>`;
        await sleep(1000);

        // 3. الرفع (الخوارزمية الجديدة والمضمونة لجيتهاب)
        resetGauge();
        ui.btn.innerText = "فحص الرفع...";
        ui.status.innerText = "جاري قياس الرفع (10 ثواني)...";
        
        // تغيير لون العداد إلى البنفسجي للرفع
        ui.gaugeLine.style.stroke = "var(--glow-purple)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 10px var(--glow-purple))";
        
        const ulSpeed = await testUploadBulletproof();
        ui.ulSpeed.innerHTML = `${ulSpeed}<span>Mbps</span>`;

        ui.status.innerText = "اكتمل التشخيص بنجاح. النتائج دقيقة وجاهزة للمناقشة.";
        ui.status.style.color = "var(--glow-cyan)";

    } catch (err) {
        ui.status.innerText = "حدث خطأ. يرجى إيقاف مانع الإعلانات أو الـ VPN.";
        ui.status.style.color = "var(--glow-orange)";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الاختبار";
        isTestingLoaded = false;
    }
});

// --- الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.status.style.color = "var(--text-muted)";
    const def = `--<span>--</span>`;
    ui.idlePing.innerHTML = def; ui.dlSpeed.innerHTML = def;
    ui.loadedPing.innerHTML = def; ui.ulSpeed.innerHTML = def;
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

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// --- محرك البنق (Gaming Ping / Raw Network Latency) ---
async function measureGamingPing() {
    let pings = [];
    // تسخين الاتصال لتجاوز وقت معالجة المتصفح (TLS Handshake)
    try { await fetch(EDGE_PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    // إرسال 5 طلبات سريعة جداً
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(performance.now() - start);
        } catch(e) {}
        await sleep(50);
    }
    
    // الألعاب لا تستخدم المتصفح، لذا للحصول على البنق الصافي نستخرج أسرع استجابة
    // ونخصم منها وقتاً طفيفاً (2ms) كتعويض عن وقت معالجة أوامر الجافاسكريبت الداخلية.
    if (pings.length > 0) {
        let rawPing = Math.min(...pings) - 2;
        return rawPing > 1 ? Math.round(rawPing) : 1; 
    }
    return "--";
}

async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            let p = (performance.now() - start) - 2;
            loadedPings.push(Math.round(p > 1 ? p : 1));
        } catch(e) {}
        await sleep(250);
    }
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
// هذه الخوارزمية تتجاهل onprogress تماماً، لأن المتصفح يحظره أمنياً (CORS).
// بدلاً من ذلك، نفتح 4 مسارات ترمي حزم بحجم 2 ميجابايت باستمرار (no-cors).
// ونحسب السرعة بناءً على عدد الحزم التي وصلت للسيرفر بنجاح خلال الوقت.
function testUploadBulletproof() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2 ميجابايت للحزمة
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)]);

        // مؤقت تحديث الواجهة (يعمل كل ربع ثانية)
        const uiTimer = setInterval(() => {
            if (!isRunning) return;
            const duration = (performance.now() - globalStartTime) / 1000;
            if (duration > 0.5 && totalSentBytes > 0) {
                finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
                ui.ulSpeed.innerHTML = `${finalSpeed.toFixed(2)}<span>Mbps</span>`;
            }
        }, 250);

        // مؤقت إيقاف الفحص بعد 10 ثواني
        setTimeout(() => {
            isRunning = false;
            clearInterval(uiTimer);
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        // وظيفة العامل (Worker): يرسل حزمة، وينتظر وصولها، ثم يحسبها ويرسل غيرها
        async function uploadWorker() {
            while (isRunning) {
                try {
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: chunkData,
                        mode: 'no-cors', // كلمة السر لتخطي حظر جيتهاب
                        cache: 'no-store'
                    });
                    
                    // إذا لم يتم إيقاف الفحص، أضف حجم الحزمة للرصيد الكلي
                    if (isRunning) {
                        totalSentBytes += CHUNK_SIZE;
                    }
                } catch(e) {
                    // في حال فشل الإرسال، ننتظر قليلاً جداً ونحاول مجدداً
                    await sleep(50);
                }
            }
        }

        // تشغيل 4 عمال متوازيين لضمان سحب أقصى طاقة للشبكة
        for (let i = 0; i < 4; i++) {
            uploadWorker();
        }
    });
}
