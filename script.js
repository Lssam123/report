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

// سيرفرات القياس المحلية والعالمية (KSA Sweep Targets)
const PING_TARGETS = [
    "https://speed.cloudflare.com/__down?bytes=0", // Cloudflare Edge (Riyadh/Jeddah)
    "https://www.stc.com.sa/favicon.ico",          // STC Servers
    "https://www.mobily.com.sa/favicon.ico"        // Mobily Servers
];

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل المنطقية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // مرحلة 1: البنق الأساسي (خوارزمية المسح المحلي للسعودية)
        setActiveBox('unloaded');
        ui.mainUnit.innerText = "MS";
        ui.status.innerText = "جاري الاتصال بأقرب خوادم محلية (STC/Mobily/Edge)...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureKSAPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        ui.mainVal.innerText = purePing;
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

        // مرحلة 3: الرفع
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
    
    // إرسال طلبات متوازية لكل السيرفرات لضمان التقاط أسرع استجابة
    for (const target of PING_TARGETS) {
        try { await fetch(target, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    }
    
    for(let i=0; i<4; i++) {
        for (const target of PING_TARGETS) {
            let start = performance.now();
            fetch(target + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' })
            .then(() => {
                let rtt = performance.now() - start;
                pings.push(rtt);
            }).catch(()=>{});
        }
        await sleep(100);
    }
    
    // انتظار بسيط لتجميع النتائج
    await sleep(300);
    
    if (pings.length > 0) {
        // نأخذ أقل رقم (أسرع سيرفر رد علينا) ونخصم 5 ملي ثانية كتعويض لوقت المتصفح
        let finalPing = Math.min(...pings) - 5;
        return finalPing > 1 ? Math.round(finalPing) : 1;
    }
    return "--";
}

// حلقة البنق المثقل (نقيس على سيرفر كلاودفلير المركزي أثناء التحميل)
async function startLoadedPingLoop() {
    const LOAD_URL = PING_TARGETS[0];
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(LOAD_URL + '&load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            let rtt = performance.now() - start;
            loadedPingsArray.push(Math.round(rtt));
        } catch(e) {}
        await sleep(400); 
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

// --- 6. محرك الرفع (تم الإصلاح: إزالة no-cors واستخدام Text Payload) ---
function testUpload() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        // إرسال البيانات كنص صريح (text/plain) يمنع المتصفح من حظرها أمنياً
        const CHUNK_SIZE = 1 * 1024 * 1024; 
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)], {type: 'text/plain'});

        const uiTimer = setInterval(() => {
            if (!isRunning) return;
            const duration = (performance.now() - globalStartTime) / 1000;
            if (duration > 0.5 && totalSentBytes > 0) {
                finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                updateMainValue(finalSpeed);
            }
        }, 250);

        setTimeout(() => {
            isRunning = false;
            clearInterval(uiTimer);
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        async function uploadWorker() {
            while (isRunning) {
                try {
                    // تم إزالة وضع no-cors الذي كان يسبب المشكلة
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: chunkData,
                        cache: 'no-store'
                    });
                    if (isRunning) totalSentBytes += CHUNK_SIZE;
                } catch(e) {
                    await sleep(50);
                }
            }
        }

        // تشغيل 4 مسارات متوازية لسحب السرعة
        for (let i = 0; i < 4; i++) uploadWorker();
    });
}
