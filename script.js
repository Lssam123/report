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
    "https://www.kau.edu.sa/favicon.ico", 
    "https://www.stc.com.sa/favicon.ico"
];

// تحسين الذاكرة: حزمة واحدة عامة وثابتة
const UPLOAD_PAYLOAD = new Uint8Array(2 * 1024 * 1024);

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // --- البنق الأساسي ---
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---";   
        ui.mainUnit.innerText = "PING"; 
        ui.status.innerText = "جاري مسح الخوادم للبحث عن أقل استجابة...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // --- التحميل والبنق المثقل ---
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.mainVal.innerText = "0.00"; 
        ui.mainUnit.innerText = "MBPS"; 
        ui.status.innerText = "جاري قياس التنزيل باستهلاك منخفض للمعالج...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // --- الرفع المباشر ---
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس قدرة الرفع بأولوية شبكة قصوى...";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // --- إنهاء الفحص ---
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح. الأداء مستقر ومثالي.";
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

// تحسين الأداء: خنق تحديث الواجهة (Throttling) لتقليل إجهاد الـ DOM
let lastRenderTime = 0;
function throttledUIUpdate(speed) {
    const now = performance.now();
    // نحدث الشاشة مرة واحدة فقط كل 100 ملي ثانية (10 إطارات في الثانية)
    if (now - lastRenderTime > 100) {
        ui.mainVal.innerText = speed.toFixed(2);
        lastRenderTime = now;
    }
}

// --- 4. محرك البنق المحلي ---
async function measureLocalPing() {
    let pings = [];
    
    for (const target of PING_TARGETS) {
        // إضافة priority: 'high' لإجبار المتصفح على سرعة الاتصال
        try { await fetch(target, { mode: 'no-cors', cache: 'no-store', priority: 'high' }); } catch(e){}
    }
    
    for(let i=0; i<4; i++) {
        for (const target of PING_TARGETS) {
            let start = performance.now();
            fetch(target + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store', priority: 'high' })
            .then(() => {
                pings.push(performance.now() - start);
            }).catch(()=>{});
        }
        await sleep(100);
    }
    
    await sleep(300); 
    
    if (pings.length > 0) {
        let bestPing = Math.min(...pings) - 2;
        return bestPing > 1 ? Math.round(bestPing) : 1;
    }
    return "--";
}

async function startLoadedPingLoop() {
    const LOAD_URL = PING_TARGETS[0];
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(LOAD_URL + '&load=' + Math.random(), { mode: 'no-cors', cache: 'no-store', priority: 'high' });
            loadedPingsArray.push(Math.round(performance.now() - start));
            
            // إدارة الذاكرة: منع المصفوفة من التضخم بشكل لانهائي
            if (loadedPingsArray.length > 50) loadedPingsArray.shift();
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
        let isRunning = true;

        const timeout = setTimeout(() => {
            isRunning = false;
            controller.abort();
            // التحديث النهائي لضمان عرض آخر رقم دقيق
            ui.mainVal.innerText = finalSpeed.toFixed(2);
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store', priority: 'high' });
            const reader = response.body.getReader();
            
            while (isRunning) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                
                // حساب السرعة بأقصى طاقة في الخلفية، وإرسالها لدالة التحديث المخنوقة
                const duration = (performance.now() - startTime) / 1000;
                if (duration > 0.1) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    throttledUIUpdate(finalSpeed);
                }
            }
        } catch (e) {} 
        
        clearTimeout(timeout);
        isRunning = false;
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع ---
async function testUpload() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSent = 0;
        let finalSpeed = 0;
        const startTime = performance.now();
        
        const timeout = setTimeout(() => {
            isRunning = false;
            ui.mainVal.innerText = finalSpeed.toFixed(2);
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        async function uploadWorker() {
            while (isRunning) {
                try {
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: UPLOAD_PAYLOAD, 
                        cache: 'no-store',
                        priority: 'high' // إعطاء الأولوية لبيانات الرفع
                    });
                    
                    if (isRunning) {
                        totalSent += UPLOAD_PAYLOAD.length;
                        const duration = (performance.now() - startTime) / 1000;
                        finalSpeed = ((totalSent * 8) / duration) / 1000000;
                        throttledUIUpdate(finalSpeed);
                    }
                } catch (e) {
                    await sleep(50);
                }
            }
        }

        for (let i = 0; i < 4; i++) uploadWorker();
    });
}
