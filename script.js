// --- 1. ربط واجهة المستخدم (UI Bindings) ---
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

const TEST_DURATION = 10000; // مدة الفحص 10 ثواني

// عقد فحص الـ Anycast القريبة جداً من البنية التحتية للمملكة
const PING_TARGETS = [
    "https://1.1.1.1/favicon.ico",
    "https://8.8.8.8/favicon.ico",
    "https://www.google.com/images/phd/px.gif"
];

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // المرحلة 1: البنق الأساسي (Idle Latency)
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---";
        ui.mainUnit.innerText = "PING"; 
        ui.status.innerText = "استخدام تقنية Image-Ping لانتزاع السرعة الفيزيائية...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // المرحلة 2: التنزيل والبنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.mainVal.innerText = "0.00"; 
        ui.mainUnit.innerText = "MBPS"; 
        ui.status.innerText = "قياس التنزيل واختبار استقرار الراوتر (Bufferbloat)...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // المرحلة 3: الرفع
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "قياس سرعة الرفع عبر حزم البيانات الخام...";
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // إنهاء الفحص
        setActiveBox(null);
        ui.status.innerText = "تم الفحص بنجاح. النتائج تعكس أداء المتصفح الفعلي.";
        ui.mainVal.innerText = "انتهى";
        ui.mainUnit.innerText = "DONE";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        ui.status.innerText = "حدث خطأ في الشبكة.";
        ui.btn.innerText = "إعادة المحاولة";
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- 3. محرك البنق المطور (The Stealth Image-Ping Engine) ---
async function measureLocalPing() {
    let results = [];
    
    // وظيفة القياس باستخدام كائن الصورة (تتخطى معالجة النصوص الثقيلة)
    const pingNode = (url) => {
        return new Promise((resolve) => {
            const img = new Image();
            const start = performance.now();
            // نعتبر الطلب انتهى بمجرد وصول أي رد من السيرفر (حتى لو خطأ)
            img.onload = () => resolve(performance.now() - start);
            img.onerror = () => resolve(performance.now() - start);
            img.src = url + "?t=" + Math.random();
        });
    };

    // مرحلة التسخين (Warm-up) لفتح قنوات الاتصال
    await pingNode(PING_TARGETS[0]);
    await pingNode(PING_TARGETS[1]);

    // القياس الفعلي عبر 12 محاولة مكثفة
    for (let i = 0; i < 12; i++) {
        const d = await pingNode(PING_TARGETS[i % PING_TARGETS.length]);
        if (d > 2) results.push(d); // استبعاد القراءات الصفرية المستحيلة
        await sleep(20); 
    }

    if (results.length > 0) {
        // نأخذ أقل قيمة سجلها الكرت (الزمن الفيزيائي الصافي للوصول)
        const sorted = results.sort((a, b) => a - b);
        return Math.round(sorted[0]); 
    }
    return "--";
}

// --- 4. بقية محركات الفحص (التنزيل والرفع) ---
async function startLoadedPingLoop() {
    const LOAD_URL = PING_TARGETS[0]; 
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(LOAD_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(400); 
    }
}

function testDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=120000000"; 
        let totalBytes = 0; let finalSpeed = 0; const startTime = performance.now();
        const timeout = setTimeout(() => { controller.abort(); resolve(finalSpeed.toFixed(2)); }, TEST_DURATION);
        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                const duration = (performance.now() - startTime) / 1000;
                if (duration > 0.1) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateMainValue(finalSpeed);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout); resolve(finalSpeed.toFixed(2));
    });
}

async function testUpload() {
    let finalSpeed = 0; let totalSent = 0; const startTime = performance.now(); const endTime = startTime + TEST_DURATION;
    const payload = new Uint8Array(2 * 1024 * 1024);
    while (performance.now() < endTime) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, cache: 'no-store', mode: 'no-cors' });
            totalSent += payload.length;
            const duration = (performance.now() - startTime) / 1000;
            finalSpeed = ((totalSent * 8) / duration) / 1000000;
            updateMainValue(finalSpeed);
        } catch (e) { break; }
    }
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}

// --- 5. وظائف مساعدة إضافية ---
const sleep = ms => new Promise(r => setTimeout(r, ms));
function resetUI() { ui.mainVal.innerText = "0.00"; ui.mainVal.style.color = "var(--text-dark)"; ui.mainUnit.innerText = "MBPS"; const def = `-- <span>--</span>`; ui.valUnloaded.innerHTML = def; ui.valDownload.innerHTML = def; ui.valLoaded.innerHTML = def; ui.valUpload.innerHTML = def; setActiveBox(null); }
function setActiveBox(boxName) { Object.values(ui.boxes).forEach(box => { if (box) box.classList.remove('active'); }); if (boxName && ui.boxes[boxName]) ui.boxes[boxName].classList.add('active'); }
function calculateMedian(arr) { if (arr.length === 0) return "--"; const sorted = [...arr].sort((a, b) => a - b); return Math.round(sorted[Math.floor(sorted.length / 2)]); }
function updateMainValue(speed) { ui.mainVal.innerText = speed.toFixed(2); }
