// --- 1. إعدادات الواجهة والعداد ---
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

const TEST_DURATION = 10000; // مدة الاختبار لكل مرحلة (10 ثواني)
const GAUGE_MAX_DASH = 283; // طول مسار نصف الدائرة في الـ SVG 
let gaugeMaxSpeed = 100; // الحد الأقصى للعداد (يتمدد تلقائياً إذا تجاوزته السرعة)

// السيرفرات السعودية المعتمدة لفحص البنق
const saudiServers = [
    "https://www.stc.com.sa/",
    "https://www.mobily.com.sa/",
    "https://sa.zain.com/",
    "https://salam.sa/"
];

let isTestingLoaded = false;
let loadedPings = [];
let bestSaudiServer = "";

// --- 2. دورة الاختبار الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;
    ui.btn.innerText = "جاري القياس...";

    try {
        // الخطوة 1: فحص البنق الأساسي (السيرفرات السعودية)
        ui.status.innerText = "جاري قياس استجابة السيرفرات السعودية...";
        const pingResult = await measureSaudiPing();
        ui.idlePing.innerHTML = `${pingResult.ping}<span>ms</span>`;
        bestSaudiServer = pingResult.url; // حفظ أسرع سيرفر لاستخدامه في البنق المثقل
        await sleep(500);

        // الخطوة 2: فحص التنزيل والبنق المثقل بالتزامن
        ui.status.innerText = "جاري قياس التنزيل والبنق المثقل (10 ثواني)...";
        ui.gaugeLine.style.stroke = "var(--accent-blue)";
        
        isTestingLoaded = true; 
        loadedPings = [];
        startLoadedPingLoop(); // تشغيل حلقة البنق في الخلفية
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false; // إيقاف حلقة البنق
        ui.dlSpeed.innerHTML = `${dlSpeed}<span>Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPings)}<span>ms</span>`;
        await sleep(1000);

        // الخطوة 3: فحص الرفع (باستخدام خوارزمية Opaque Chunk Timing)
        resetGauge();
        ui.status.innerText = "جاري قياس الرفع (10 ثواني)...";
        ui.gaugeLine.style.stroke = "var(--accent-green)";
        
        const ulSpeed = await testUpload();
        ui.ulSpeed.innerHTML = `${ulSpeed}<span>Mbps</span>`;

        ui.status.innerText = "اكتمل الاختبار بنجاح!";
        ui.status.style.color = "var(--accent-green)";

    } catch (err) {
        ui.status.innerText = "حدث خطأ أثناء القياس. يرجى التأكد من الاتصال.";
        ui.status.style.color = "var(--accent-orange)";
        console.error("Test Error:", err);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الاختبار";
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة (Utility Functions) ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.status.style.color = "var(--accent-blue)";
    const def = `--<span>--</span>`;
    ui.idlePing.innerHTML = def; 
    ui.dlSpeed.innerHTML = def;
    ui.loadedPing.innerHTML = def; 
    ui.ulSpeed.innerHTML = def;
}

function resetGauge() {
    gaugeMaxSpeed = 100;
    ui.mainVal.innerText = "0.00";
    ui.gaugeLine.style.strokeDashoffset = GAUGE_MAX_DASH;
}

function updateGauge(speed) {
    // زيادة حد العداد ديناميكياً إذا زادت السرعة
    if (speed > gaugeMaxSpeed * 0.9) gaugeMaxSpeed = Math.ceil((speed + 50) / 100) * 100;
    ui.mainVal.innerText = speed.toFixed(2);
    
    // حساب النسبة لملء العداد الدائري
    let percent = Math.min(speed / gaugeMaxSpeed, 1);
    let offset = GAUGE_MAX_DASH - (percent * GAUGE_MAX_DASH);
    ui.gaugeLine.style.strokeDashoffset = offset;
}

// حساب "الوسيط" لتجنب القراءات الشاذة في البنق
function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// --- 4. محرك البنق (Ping Engine) للسيرفرات السعودية ---
async function measureSaudiPing() {
    let bestPing = Infinity;
    let bestUrl = saudiServers[0];

    for (let url of saudiServers) {
        // تسخين الاتصال (Warm-up)
        try { await fetch(url, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
        
        let start = performance.now();
        try {
            await fetch(url + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            let ping = Math.round(performance.now() - start);
            if (ping < bestPing) {
                bestPing = ping;
                bestUrl = url;
            }
        } catch(e) {}
    }
    return { ping: bestPing === Infinity ? "--" : bestPing, url: bestUrl };
}

// حلقة البنق المثقل التي تعمل بالتزامن مع التحميل
async function startLoadedPingLoop() {
    if (!bestSaudiServer) return;
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(bestSaudiServer + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(250); // إرسال طلب كل ربع ثانية
    }
}

// --- 5. محرك التنزيل (Download Engine) ---
function testDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=150000000"; // ملف 150MB وهمي
        let totalBytes = 0;
        let finalSpeed = 0;
        const startTime = performance.now();

        // قاطع زمني صارم بعد 10 ثواني
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
                totalBytes += value.length; // حساب دقيق للبايتات المستلمة
                
                const duration = (performance.now() - startTime) / 1000;
                if (duration > 0.2) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateGauge(finalSpeed);
                }
            }
        } catch (e) {
            // تجاهل خطأ التوقف المتعمد (AbortError)
        } 
        
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع (Upload Engine) لتجاوز قيود GitHub المتصفحات ---
// يستخدم خوارزمية (Opaque Chunk Timing) التي تقيس وقت وصول الحزم بدلاً من استخدام onprogress المحظور
function testUpload() {
    return new Promise(async (resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        // تجهيز حزمة 5 ميجابايت (Blob) لرميها على السيرفر
        const CHUNK_SIZE = 5 * 1024 * 1024; 
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)], { type: 'text/plain' });

        // مؤقت إيقاف الاختبار بعد 10 ثواني
        setTimeout(() => {
            isRunning = false;
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        // حلقة الإرسال المستمرة
        while (isRunning) {
            try {
                // وضع no-cors هو السر لتجاوز الحظر الأمني للمتصفحات (CORS Preflight)
                await fetch('https://speed.cloudflare.com/__up', {
                    method: 'POST',
                    body: chunkData,
                    mode: 'no-cors',
                    cache: 'no-store'
                });
                
                if (isRunning) {
                    totalSentBytes += CHUNK_SIZE; // إضافة حجم الحزمة للرصيد الكلي
                    const duration = (performance.now() - globalStartTime) / 1000;
                    if (duration > 0) {
                        finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                        updateGauge(finalSpeed);
                    }
                }
            } catch(e) {
                // في حال فشل حزمة، ننتظر قليلاً ثم نكمل لتجنب توقف الفحص كلياً
                await sleep(100);
            }
        }
    });
}
