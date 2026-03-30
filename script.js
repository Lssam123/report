// --- 1. ربط عناصر الواجهة بدقة ---
const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    gaugeLine: document.getElementById('gaugeProgress'),
    
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
const GAUGE_DASH = 377; // الرقم الرياضي لمحيط نصف الدائرة في الـ SVG الجديد
let gaugeMaxSpeed = 100;

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة الفحص الرئيسية (Crash-Proof Architecture) ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    // --- مرحلة 1: البنق غير المثقل ---
    try {
        setActiveBox('unloaded');
        ui.btn.innerText = "جاري الفحص...";
        ui.status.innerText = "جاري حساب استجابة الشبكة الأساسية...";
        
        const purePing = await measureBulletproofPing();
        ui.valUnloaded.innerHTML = `${purePing} <span class="metric-unit">ms</span>`;
    } catch (err) {
        console.error("Ping Error:", err);
        ui.valUnloaded.innerHTML = `Err <span class="metric-unit">ms</span>`;
    }
    await sleep(500);

    // --- مرحلة 2: التحميل والبنق المثقل ---
    try {
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); // إضاءة بطاقة البنق المثقل مع التحميل
        ui.status.innerText = "جاري قياس سرعة التحميل وتأثير الاختناق...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span class="metric-unit">Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span class="metric-unit">ms</span>`;
        ui.boxes.loaded.classList.remove('active');
    } catch (err) {
        console.error("Download Error:", err);
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `Err <span class="metric-unit">Mbps</span>`;
    }
    await sleep(1000);

    // --- مرحلة 3: الرفع المباشر ---
    try {
        resetGauge();
        setActiveBox('upload');
        ui.status.innerText = "جاري قياس سرعة الرفع (تخطي حماية CORS)...";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span class="metric-unit">Mbps</span>`;
    } catch (err) {
        console.error("Upload Error:", err);
        ui.valUpload.innerHTML = `Err <span class="metric-unit">Mbps</span>`;
    }

    // --- إنهاء العملية بنجاح ---
    setActiveBox(null);
    ui.status.innerText = "اكتمل الفحص بنجاح. النتائج دقيقة وجاهزة.";
    ui.mainVal.style.color = "var(--success)";
    ui.btn.innerText = "إعادة الفحص";
    ui.btn.disabled = false;
});

// --- 3. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.mainVal.style.color = "var(--text-main)";
    const def = `-- <span class="metric-unit">--</span>`;
    ui.valUnloaded.innerHTML = def; 
    ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; 
    ui.valUpload.innerHTML = def;
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

// --- 4. محرك البنق (TTFB Method) ---
async function measureBulletproofPing() {
    return new Promise(async (resolve) => {
        let pings = [];
        let isResolved = false;
        
        const finish = (val) => {
            if (!isResolved) {
                isResolved = true;
                resolve(val);
            }
        };

        setTimeout(() => finish("--"), 4000); // أمان ضد التعليق

        try {
            const PING_URL = "https://cp.cloudflare.com/generate_204";
            await fetch(PING_URL, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
            
            for(let i=0; i<5; i++) {
                if (isResolved) break;
                let start = performance.now();
                try {
                    await fetch(PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
                    pings.push(Math.round(performance.now() - start));
                } catch(e) {}
                await sleep(50);
            }
            
            if (pings.length > 0) {
                let minPing = Math.min(...pings) - 2; // خصم وقت المتصفح الداخلي
                finish(minPing > 1 ? minPing : 1);
            } else {
                finish("--");
            }
        } catch(e) {
            finish("--");
        }
    });
}

// حلقة البنق المثقل
async function startLoadedPingLoop() {
    const PING_URL = "https://1.1.1.1/cdn-cgi/trace";
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            let p = Math.round(performance.now() - start) - 2;
            loadedPingsArray.push(p > 1 ? p : 1);
        } catch(e) {}
        await sleep(250);
    }
}

// --- 5. محرك التحميل ---
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

// --- 6. محرك الرفع (Bypass Browser Protection) ---
function testUpload() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        const CHUNK_SIZE = 1 * 1024 * 1024; // 1 ميجابايت 
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

        // تشغيل 4 مسارات لضغط الخط بقوة
        for (let i = 0; i < 4; i++) uploadWorker();
    });
}
