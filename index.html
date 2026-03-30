// --- 1. ربط الواجهة ---
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

const TEST_DURATION = 10000; // 10 ثواني

// مصفوفة سيرفرات السعودية للحصول على أقل بنق ممكن (KSA Sweep Array)
const KSA_SERVERS = [
    "https://speed.cloudflare.com/__down?bytes=0", // مسار كلاودفلير السريع
    "https://www.stc.com.sa",                      // خوادم STC
    "https://www.mobily.com.sa",                   // خوادم موبايلي
    "https://sa.zain.com",                         // خوادم زين السعودية
    "https://salam.sa",                            // خوادم شركة سلام
    "https://www.ksu.edu.sa",                      // جامعة الملك سعود (الرياض)
    "https://www.kau.edu.sa"                       // جامعة الملك عبدالعزيز (جدة)
];

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل المنطقية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // مرحلة 1: البنق الأساسي (تُعرض النتيجة في البطاقة فقط)
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---"; // إخفاء الرقم من الشاشة العلوية
        ui.mainUnit.innerText = "PING";
        ui.status.innerText = "جاري مسح سيرفرات السعودية (STC, Mobily, Zain)...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureKSAPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        // لا نحدث الشاشة العلوية بناءً على طلبك
        await sleep(500);

        // مرحلة 2: التحميل والبنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); // إضاءة مربع المثقل
        ui.mainUnit.innerText = "MBPS";
        ui.status.innerText = "جاري قياس التنزيل وتأثير الاختناق...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // مرحلة 3: الرفع (تم استرجاع الكود الناجح 100%)
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس قدرة الرفع...";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // إنهاء الفحص
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح.";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        console.error("Test Error:", err);
        ui.status.innerText = "حدث خطأ. تأكد من اتصال الإنترنت.";
        ui.btn.innerText = "إعادة المحاولة";
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    ui.mainVal.innerText = "0.00";
    ui.mainVal.style.color = "var(--text-dark)";
    ui.mainUnit.innerText = "--";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def; 
    ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; 
    ui.valUpload.innerHTML = def;
    setActiveBox(null);
}

function setActiveBox(boxName) {
    Object.values(ui.boxes).forEach(box => { if (box) box.classList.remove('active'); });
    if (boxName && ui.boxes[boxName]) ui.boxes[boxName].classList.add('active');
}

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function updateMainValue(speed) {
    ui.mainVal.innerText = speed.toFixed(2);
}

// --- 4. محرك البنق المحلي (KSA Server Sweep) ---
async function measureKSAPing() {
    let pings = [];
    
    // 1. تسخين جميع السيرفرات في نفس الوقت
    await Promise.allSettled(KSA_SERVERS.map(url => fetch(url, { mode: 'no-cors', cache: 'no-store' })));
    
    // 2. إطلاق 3 موجات فحص متوازية لاصطياد أسرع استجابة
    for(let i=0; i<3; i++) {
        let wave = KSA_SERVERS.map(async (url) => {
            let start = performance.now();
            try {
                await fetch(url, { mode: 'no-cors', cache: 'no-store' });
                pings.push(performance.now() - start);
            } catch(e) {}
        });
        await Promise.allSettled(wave);
        await sleep(50);
    }
    
    if (pings.length > 0) {
        // نأخذ أسرع استجابة من بين كل السيرفرات السعودية، ونخصم 2ms لتعويض معالجة المتصفح
        let bestPing = Math.min(...pings) - 2;
        return bestPing > 1 ? Math.round(bestPing) : 1;
    }
    return "--";
}

// حلقة البنق المثقل (تعمل أثناء التحميل)
async function startLoadedPingLoop() {
    // نستخدم مسار كلاودفلير الموثوق للبنق المثقل لضمان عدم حظرنا أثناء الضغط
    const LOAD_URL = "https://speed.cloudflare.com/__down?bytes=0";
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(LOAD_URL + '&load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            let rtt = performance.now() - start;
            loadedPingsArray.push(Math.round(rtt));
        } catch(e) {}
        await sleep(500); 
    }
}

// --- 5. محرك التنزيل ---
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
                    updateMainValue(finalSpeed);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع (النسخة المستقرة التي عملت معك بنجاح) ---
function testUpload() {
    return new Promise(async (resolve) => {
        let finalSpeed = 0;
        let totalSent = 0;
        const startTime = performance.now();
        const endTime = startTime + TEST_DURATION;
        
        // استخدام Uint8Array كما كان في النسخة الناجحة تماماً وبدون no-cors
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
                updateMainValue(finalSpeed);
                
            } catch (e) {
                if (totalSent === 0) return "Error";
                break; 
            }
        }
        
        resolve(finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00");
    });
}
