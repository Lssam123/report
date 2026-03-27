// --- إعدادات الواجهة ---
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
const GAUGE_CIRCUMFERENCE = 942; // محيط العداد للتصميم الجديد
let gaugeMaxSpeed = 100;

// نقطة فحص البنق (كلاودفلير لتعطي بنق الألعاب الحقيقي)
const PING_URL = "https://1.1.1.1/cdn-cgi/trace";

let isTestingLoaded = false;
let loadedPings = [];

// --- دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;
    ui.btn.innerText = "TESTING...";

    try {
        // 1. البنق الصافي
        ui.status.innerText = "جاري حساب استجابة الشبكة (Ping)...";
        const rawPing = await measureGamingPing();
        ui.idlePing.innerText = rawPing;
        await sleep(500);

        // 2. التنزيل والبنق المثقل
        ui.status.innerText = "جاري قياس سرعة التنزيل والبنق المثقل (10 ثواني)...";
        
        // لون العداد سماوي للتنزيل
        ui.gaugeLine.style.stroke = "var(--accent-cyan)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 10px rgba(0, 229, 255, 0.4))";
        
        isTestingLoaded = true;
        loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false;
        ui.dlSpeed.innerText = dlSpeed;
        ui.loadedPing.innerText = calculateMedian(loadedPings);
        await sleep(1000);

        // 3. الرفع (باستخدام 4 مسارات لجيتهاب)
        resetGauge();
        ui.status.innerText = "جاري قياس سرعة الرفع (10 ثواني)...";
        
        // لون العداد بنفسجي للرفع
        ui.gaugeLine.style.stroke = "var(--accent-purple)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 10px rgba(189, 0, 255, 0.4))";
        
        const ulSpeed = await testUploadBulletproof();
        ui.ulSpeed.innerText = ulSpeed;

        ui.status.innerText = "اكتمل الفحص بنجاح. النتائج دقيقة وجاهزة للمقارنة.";
        ui.status.style.color = "var(--accent-cyan)";
        ui.btn.innerText = "AGAIN";

    } catch (err) {
        ui.status.innerText = "حدث خطأ. يرجى التأكد من الاتصال.";
        ui.status.style.color = "#ff4757";
        ui.btn.innerText = "RETRY";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.status.style.color = "var(--text-muted)";
    ui.idlePing.innerText = "--"; 
    ui.dlSpeed.innerText = "--";
    ui.loadedPing.innerText = "--";
    ui.ulSpeed.innerText = "--";
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

// --- محرك البنق (Gaming Ping) ---
async function measureGamingPing() {
    let pings = [];
    try { await fetch(PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(performance.now() - start);
        } catch(e) {}
        await sleep(50);
    }
    
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
            await fetch(PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
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

// --- محرك الرفع الغاشم (Bulletproof Upload) ---
function testUploadBulletproof() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2 ميجابايت للحزمة
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)]);

        const uiTimer = setInterval(() => {
            if (!isRunning) return;
            const duration = (performance.now() - globalStartTime) / 1000;
            if (duration > 0.5 && totalSentBytes > 0) {
                finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
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
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: chunkData,
                        mode: 'no-cors',
                        cache: 'no-store'
                    });
                    
                    if (isRunning) totalSentBytes += CHUNK_SIZE;
                } catch(e) {
                    await sleep(50);
                }
            }
        }

        // تشغيل 4 مسارات لضمان سحب أقصى سرعة
        for (let i = 0; i < 4; i++) {
            uploadWorker();
        }
    });
}
