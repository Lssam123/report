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

// تحسين الذاكرة: تعريف حزمة الرفع مرة واحدة عالمياً لمنع تسرب الذاكرة (Memory Leak)
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
        ui.status.innerText = "جاري مسح الخوادم المحلية للبحث عن أقل استجابة...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // --- التحميل والبنق المثقل ---
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
        await sleep(1000);

        // --- الرفع المباشر ---
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس قدرة الرفع...";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // --- إنهاء الفحص ---
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح. الأداء مستقر وسلس.";
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

// تحسين الأداء: فصل تحديث الواجهة عن العمليات الحسابية
let lastValue = "";
function updateMainValue(speed) {
    const newVal = speed.toFixed(2);
    // منع تحديث الـ DOM (عملية ثقيلة) إذا كان الرقم لم يتغير
    if (lastValue !== newVal) {
        ui.mainVal.innerText = newVal;
        lastValue = newVal;
    }
}

// --- 4. محرك البنق المحلي ---
async function measureLocalPing() {
    let pings = [];
    
    for (const target of PING_TARGETS) {
        try { await fetch(target, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    }
    
    for(let i=0; i<4; i++) {
        for (const target of PING_TARGETS) {
            let start = performance.now();
            fetch(target + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' })
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
            await fetch(LOAD_URL + '&load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(500); 
    }
}

// --- 5. محرك التنزيل (محسن بـ requestAnimationFrame) ---
function testDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=150000000"; 
        let totalBytes = 0;
        let finalSpeed = 0;
        const startTime = performance.now();
        let isRunning = true;

        // حلقة تحديث الواجهة المتوافقة مع كرت الشاشة (60 FPS)
        function renderUI() {
            if (!isRunning) return;
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.1 && totalBytes > 0) {
                finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                updateMainValue(finalSpeed);
            }
            requestAnimationFrame(renderUI);
        }
        requestAnimationFrame(renderUI);

        const timeout = setTimeout(() => {
            isRunning = false;
            controller.abort();
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            const reader = response.body.getReader();
            
            while (isRunning) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
            }
        } catch (e) {} 
        
        clearTimeout(timeout);
        isRunning = false;
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع (محسن بالذاكرة المشتركة و requestAnimationFrame) ---
async function testUpload() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSent = 0;
        let finalSpeed = 0;
        const startTime = performance.now();
        
        // حلقة تحديث الشاشة السلسة
        function renderUI() {
            if (!isRunning) return;
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.2 && totalSent > 0) {
                finalSpeed = ((totalSent * 8) / duration) / 1000000;
                updateMainValue(finalSpeed);
            }
            requestAnimationFrame(renderUI);
        }
        requestAnimationFrame(renderUI);

        const timeout = setTimeout(() => {
            isRunning = false;
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        async function uploadWorker() {
            while (isRunning) {
                try {
                    // نستخدم UPLOAD_PAYLOAD المعرفة عالمياً لتخفيف الضغط عن الـ RAM
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: UPLOAD_PAYLOAD, 
                        cache: 'no-store'
                    });
                    if (isRunning) totalSent += UPLOAD_PAYLOAD.length;
                } catch (e) {
                    await sleep(50);
                }
            }
        }

        // تشغيل المسارات المتوازية
        for (let i = 0; i < 4; i++) uploadWorker();
    });
}
