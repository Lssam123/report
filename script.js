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

const TEST_DURATION = 10000; 

const PING_TARGETS = [
    "https://speed.cloudflare.com/__down?bytes=0", 
    "https://www.stc.com.sa/favicon.ico",           
    "https://www.mobily.com.sa/favicon.ico",        
    "https://sa.zain.com/favicon.ico",             
    "https://salam.sa/favicon.ico",                 
    "https://www.jawwy.sa/favicon.ico",            
];

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // --- مرحلة 1: البنق الأساسي (محسّن ليكون أسرع) ---
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---";   
        ui.mainUnit.innerText = "PING"; 
        ui.status.innerText = "جاري فحص البنق السريع...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(300); // تقليل وقت الانتظار الانتقالي

        // --- مرحلة 2: التحميل والبنق المثقل ---
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.mainVal.innerText = "0.00"; 
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
        await sleep(500);

        // --- مرحلة 3: الرفع المباشر ---
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس قدرة الرفع...";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // --- إنهاء الفحص ---
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح.";
        ui.mainVal.innerText = "انتهى";
        ui.mainUnit.innerText = "DONE";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        console.error("Test Error:", err);
        ui.status.innerText = "حدث خطأ. يرجى التحقق من اتصال الإنترنت.";
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
    ui.mainUnit.innerText = "MBPS";
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

// --- 4. محرك البنق (تم التعديل للسرعة القصوى) ---
async function measureLocalPing() {
    let pings = [];
    
    // دالة داخلية لإرسال طلبات متوازية لجميع السيرفرات
    const sendBatch = () => {
        return PING_TARGETS.map(target => {
            const start = performance.now();
            return fetch(target + '?t=' + Math.random(), { 
                mode: 'no-cors', 
                cache: 'no-store',
                signal: AbortSignal.timeout(1500) // عدم انتظار السيرفرات الميتة
            }).then(() => {
                pings.push(performance.now() - start);
            }).catch(() => {});
        });
    };

    // تنفيذ موجتين متوازيتين بدلاً من الحلقات التقليدية
    await Promise.allSettled(sendBatch());
    await Promise.allSettled(sendBatch());
    
    if (pings.length > 0) {
        // نأخذ أسرع استجابة تم تسجيلها مع خصم بسيط لتعويض معالجة المتصفح
        let bestPing = Math.min(...pings) - 1.5;
        return bestPing > 1 ? Math.round(bestPing) : 1;
    }
    return "--";
}

// حلقة البنق المثقل (زيادة التردد لتحسين الدقة أثناء التحميل)
async function startLoadedPingLoop() {
    const LOAD_URL = PING_TARGETS[0]; 
    while (isTestingLoaded) {
        const start = performance.now();
        try {
            await fetch(LOAD_URL + '&load=' + Math.random(), { 
                mode: 'no-cors', 
                cache: 'no-store',
                signal: AbortSignal.timeout(2000)
            });
            loadedPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(150); // فحص كل 150ms بدلاً من 500ms لدقة أعلى
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

// --- 6. محرك الرفع ---
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
            updateMainValue(finalSpeed);
            
        } catch (e) {
            if (totalSent === 0) return "Error";
            break; 
        }
    }
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}
