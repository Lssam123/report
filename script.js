// --- 1. ربط الواجهة ---
const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    gaugeLine: document.getElementById('gaugeProgress'),
    idlePing: document.getElementById('idlePing'),
    dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'),
    ulSpeed: document.getElementById('ulSpeed'),
    boxes: {
        unloaded: document.getElementById('boxUnloaded'),
        download: document.getElementById('boxDownload'),
        loaded: document.getElementById('boxLoaded'),
        upload: document.getElementById('boxUpload')
    }
};

const TEST_DURATION = 10000; // 10 ثواني
const GAUGE_DASH = 942; // محيط الدائرة (2 * PI * 150)
let gaugeMaxSpeed = 100;

// توحيد نقطة الفحص لضمان تناسق منطق البنق (Warm-up & Bufferbloat)
const CORE_SERVER_URL = "https://speed.cloudflare.com/__down?bytes=0";

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل المنطقية والآمنة ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;
    ui.btn.innerText = "TESTING...";

    try {
        // مرحلة 1: البنق غير المثقل (Unloaded)
        setActiveBox('unloaded');
        ui.status.innerText = "جاري حساب الاستجابة الأساسية (Unloaded Ping)...";
        const purePing = await measureAccuratePing();
        ui.idlePing.innerText = purePing;
        await sleep(500);

        // مرحلة 2: التحميل والبنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); // إضاءة المربعين معاً
        ui.status.innerText = "جاري قياس التحميل وتأثير الاختناق على البنق...";
        
        ui.gaugeLine.style.stroke = "var(--accent-cyan)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 8px rgba(0, 229, 255, 0.4))";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.dlSpeed.innerText = dlResult;
        ui.loadedPing.innerText = calculateMedian(loadedPingsArray);
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // مرحلة 3: الرفع المباشر
        resetGauge();
        setActiveBox('upload');
        ui.status.innerText = "جاري قياس مسار الرفع (Upload)...";
        
        ui.gaugeLine.style.stroke = "var(--accent-purple)";
        ui.gaugeLine.style.filter = "drop-shadow(0 0 8px rgba(189, 0, 255, 0.4))";
        
        const ulResult = await testUpload();
        ui.ulSpeed.innerText = ulResult;

        // إنهاء الفحص
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح. النتائج دقيقة ومنطقية.";
        ui.mainVal.style.color = "var(--accent-cyan)";
        ui.btn.innerText = "AGAIN";

    } catch (err) {
        console.error("Test Error:", err);
        ui.status.innerText = "حدث خطأ في الشبكة.";
        ui.btn.innerText = "RETRY";
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.mainVal.style.color = "var(--text-main)";
    const def = `--`;
    ui.idlePing.innerText = def; 
    ui.dlSpeed.innerText = def;
    ui.loadedPing.innerText = def; 
    ui.ulSpeed.innerText = def;
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
    Object.values(ui.boxes).forEach(box => { if (box) box.classList.remove('active'); });
    if (boxName && ui.boxes[boxName]) ui.boxes[boxName].classList.add('active');
}

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// --- 4. محرك البنق (تم توحيد الرابط لضمان المنطق الرياضي) ---
async function measureAccuratePing() {
    let pings = [];
    // 1. التسخين (لفتح قناة الاتصال قبل بدء الحساب)
    try { await fetch(CORE_SERVER_URL, { cache: 'no-store' }); } catch(e){}
    
    // 2. القياس الدقيق
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(CORE_SERVER_URL + '&t=' + Math.random(), { cache: 'no-store' });
            pings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(50);
    }
    
    // نأخذ أقل قيمة ممكنة كمعيار للبنق الأساسي
    return pings.length > 0 ? Math.min(...pings) : "--";
}

// حلقة البنق المثقل (تحدث أثناء ضغط التحميل)
async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(CORE_SERVER_URL + '&load=' + Math.random(), { cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        // ننتظر نصف ثانية بين كل نبضة لتجنب إيقاف التحميل الرئيسي
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
                    updateGauge(finalSpeed);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع ---
function testUpload() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        const CHUNK_SIZE = 1 * 1024 * 1024; // 1 ميجا
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

        // 4 مسارات متوازية للرفع
        for (let i = 0; i < 4; i++) uploadWorker();
    });
}
