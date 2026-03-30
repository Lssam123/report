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
const GAUGE_DASH = 408; 
let gaugeMaxSpeed = 100;

// النقطة العالمية الأسرع للاستجابة (0 Bytes Payload)
const PING_URL = "https://cp.cloudflare.com/generate_204";

let isTestingLoaded = false;
let loadedPingsArray = [];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. فحص البنق غير المثقل (Raw TTFB Ping)
        setActiveBox('unloaded');
        ui.btn.innerText = "جاري الفحص...";
        ui.status.innerText = "جاري قياس استجابة الشبكة الصافية...";
        const purePing = await measureProPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // 2. فحص التحميل مع البنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.status.innerText = "جاري قياس التحميل والبنق المثقل...";
        ui.gaugeLine.style.stroke = "var(--color-dl)";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // 3. فحص الرفع
        resetGauge();
        setActiveBox('upload');
        ui.status.innerText = "جاري قياس الرفع...";
        ui.gaugeLine.style.stroke = "var(--color-ul)";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // إنهاء الفحص
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح. النتائج دقيقة هندسياً.";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        ui.status.innerText = "حدث خطأ في الشبكة.";
        ui.btn.innerText = "إعادة المحاولة";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- دوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.mainVal.style.color = "var(--text-dark)";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def; ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; ui.valUpload.innerHTML = def;
    setActiveBox(null);
}

function resetGauge() {
    gaugeMaxSpeed = 100;
    ui.mainVal.innerText = "0.00";
    ui.gaugeLine.style.strokeDashoffset = GAUGE_DASH;
}

function updateGauge(speed) {
    if (speed > gaugeMaxSpeed * 0.9) gaugeMaxSpeed = Math.ceil((speed + 50) / 100) * 100;
    ui.mainVal.innerText = speed.toFixed(2);
    let percent = Math.min(speed / gaugeMaxSpeed, 1);
    ui.gaugeLine.style.strokeDashoffset = GAUGE_DASH - (percent * GAUGE_DASH);
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

// --- محرك البنق الاحترافي (TTFB Extraction) ---
async function measureProPing() {
    let pings = [];
    
    // 1. التسخين (Warm-up): نفتح قناة اتصال TCP/TLS مع السيرفر ونبقيها مفتوحة
    try { await fetch(PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    // 2. القياس السريع عبر القناة المفتوحة
    for(let i=0; i<6; i++) {
        const testUrl = PING_URL + '?id=' + Math.random();
        try {
            await fetch(testUrl, { mode: 'no-cors', cache: 'no-store' });
            
            // قراءة الوقت الفعلي من كرت الشبكة وليس من معالج الجافاسكريبت
            const entries = performance.getEntriesByName(testUrl);
            if (entries.length > 0) {
                const timing = entries[0];
                // Time To First Byte: الفرق بين لحظة الإرسال ولحظة استلام أول إشارة
                const rtt = timing.responseStart - timing.requestStart;
                if (rtt > 0) pings.push(rtt);
            }
        } catch(e) {}
        await sleep(20);
    }
    
    if (pings.length > 1) {
        pings.shift(); // دائماً نستبعد أول نبضة لأنها الأبطأ
        const finalPing = Math.min(...pings); // نأخذ أسرع مسار فيزيائي
        return Math.round(finalPing);
    }
    return "--";
}

async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        const testUrl = PING_URL + '?load=' + Math.random();
        try {
            await fetch(testUrl, { mode: 'no-cors', cache: 'no-store' });
            const entries = performance.getEntriesByName(testUrl);
            if (entries.length > 0) {
                const rtt = entries[0].responseStart - entries[0].requestStart;
                if (rtt > 0) loadedPingsArray.push(Math.round(rtt));
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
                    updateGauge(finalSpeed);
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
            updateGauge(finalSpeed);
            
        } catch (e) {
            if (totalSent === 0) return "Error";
            break; 
        }
    }
    
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}
