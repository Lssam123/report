const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    mainUnit: document.getElementById('mainUnit'),
    valUnloaded: document.getElementById('valUnloaded'),
    valDownload: document.getElementById('valDownload'),
    valLoaded: document.getElementById('valLoaded'),
    valUpload: document.getElementById('valUpload'),
    boxes: {
        unloaded: document.getElementById('boxUnloaded'),
        download: document.getElementById('boxDownload'),
        loaded: document.getElementById('boxLoaded'),
        upload: document.getElementById('boxUpload')
    }
};

const TEST_DURATION = 10000; 

// استخدام خوادم كلاودفلير المفتوحة (تدعم CORS) للحصول على البنق الدقيق
const PING_ENDPOINT = "https://speed.cloudflare.com/__down?bytes=0";

let isTestingLoaded = false;
let loadedPings = [];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. فحص البنق غير المثقل (Raw TTFB Ping)
        setActiveBox('unloaded');
        ui.status.innerText = "جاري قياس البنق الصافي للشبكة...";
        const unloadedPing = await measurePrecisePing();
        ui.valUnloaded.innerHTML = `${unloadedPing} <span>ms</span>`;
        await sleep(500);

        // 2. فحص التنزيل والبنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.status.innerText = "جاري قياس التنزيل وتأثير الاختناق...";
        
        isTestingLoaded = true;
        loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlSpeed} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPings)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // 3. فحص الرفع
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس الرفع المباشر...";
        
        const ulSpeed = await testUpload();
        ui.valUpload.innerHTML = `${ulSpeed} <span>Mbps</span>`;

        // إنهاء الفحص
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح. النتائج دقيقة وجاهزة للمقارنة.";
        ui.mainVal.style.color = "var(--success)";

    } catch (err) {
        ui.status.innerText = "حدث خطأ في الاتصال. تأكد من استقرار الشبكة.";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص";
        isTestingLoaded = false;
    }
});

// --- الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    ui.mainVal.innerText = "0.00";
    ui.mainVal.style.color = "var(--text-dark)";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def; ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; ui.valUpload.innerHTML = def;
    setActiveBox(null);
}

function setActiveBox(boxName) {
    Object.values(ui.boxes).forEach(box => box.classList.remove('active'));
    if (boxName) ui.boxes[boxName].classList.add('active');
}

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// --- محرك البنق العالمي (TTFB / Resource Timing API) ---
async function measurePrecisePing() {
    let pings = [];
    
    // تسخين الاتصال (لفتح قناة TCP و TLS مسبقاً)
    try { await fetch(PING_ENDPOINT, { cache: 'no-store' }); } catch(e){}
    
    // إرسال 6 طلبات
    for(let i=0; i<6; i++) {
        const testUrl = PING_ENDPOINT + '&t=' + performance.now() + Math.random();
        try {
            await fetch(testUrl, { cache: 'no-store' });
            
            // استخراج وقت الرحلة من متتبع أداء المتصفح مباشرة
            const entries = performance.getEntriesByName(testUrl);
            if (entries.length > 0) {
                const timing = entries[0];
                // البنق الحقيقي هو الفرق بين إرسال الطلب واستلام أول بايت (يتجاهل بطء المعالج)
                const rtt = timing.responseStart - timing.requestStart;
                if (rtt > 0) pings.push(rtt);
            }
        } catch(e) {}
        await sleep(50);
    }
    
    if (pings.length > 1) {
        pings.shift(); // استبعاد القراءة الأولى دائماً لأنها الأبطأ
        const rawPing = Math.min(...pings); // المواقع العالمية تأخذ أسرع استجابة
        return Math.round(rawPing);
    }
    
    return "--";
}

// حلقة البنق المثقل (تعمل أثناء التحميل)
async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        const testUrl = PING_ENDPOINT + '&load=' + performance.now();
        try {
            await fetch(testUrl, { cache: 'no-store' });
            const entries = performance.getEntriesByName(testUrl);
            if (entries.length > 0) {
                const timing = entries[0];
                const rtt = timing.responseStart - timing.requestStart;
                if (rtt > 0) loadedPings.push(Math.round(rtt));
            }
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
                    ui.mainVal.innerText = finalSpeed.toFixed(2);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- محرك الرفع ---
async function testUpload() {
    let finalSpeed = 0;
    let totalSent = 0;
    const startTime = performance.now();
    const endTime = startTime + TEST_DURATION;
    
    // إنشاء حزمة بيانات عشوائية بحجم 2 ميجابايت
    const payload = new Uint8Array(2 * 1024 * 1024);

    while (performance.now() < endTime) {
        try {
            await fetch('https://speed.cloudflare.com/__up', {
                method: 'POST',
                body: payload,
                cache: 'no-store'
            });
            
            totalSent += payload.length;
            const duration = (performance.now() - startTime) / 1000;
            finalSpeed = ((totalSent * 8) / duration) / 1000000;
            ui.mainVal.innerText = finalSpeed.toFixed(2);
            
        } catch (e) {
            console.error("Upload Error:", e);
            if (totalSent === 0) return "Error";
            break; 
        }
    }
    
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}
