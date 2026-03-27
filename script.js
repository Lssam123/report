// --- 1. إعدادات الواجهة ---
const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    gaugeLine: document.getElementById('gaugeProgress'),
    consoleRing: document.getElementById('consoleRing'),
    idlePing: document.getElementById('idlePing'),
    dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'),
    ulSpeed: document.getElementById('ulSpeed')
};

// إعدادات الرسم البياني المباشر (Canvas)
const canvas = document.getElementById('liveChart');
const ctx = canvas.getContext('2d');
let chartData = [];

function drawChart(color) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (chartData.length < 2) return;

    ctx.beginPath();
    const step = canvas.width / 40; // 40 نقطة كحد أقصى
    const maxVal = Math.max(...chartData, 10);

    for (let i = 0; i < chartData.length; i++) {
        let x = i * step;
        let y = canvas.height - ((chartData[i] / maxVal) * canvas.height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function updateChart(val, color) {
    chartData.push(val);
    if (chartData.length > 40) chartData.shift();
    drawChart(color);
}

// ثوابت الفحص
const TEST_DURATION = 10000; // 10 ثواني
const GAUGE_CIRCUMFERENCE = 880; // محيط الدائرة (2 * PI * 140)
let gaugeMaxSpeed = 100;

// نقطة البنق (Edge Node) الأسرع والأدق لمحاكاة الألعاب
const EDGE_PING_URL = "https://cp.cloudflare.com/generate_204";

let isTestingLoaded = false;
let loadedPings = [];

// --- 2. دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. البنق الصافي
        setPhaseColor('var(--color-ping)');
        ui.btn.innerText = "PINGING...";
        ui.status.innerText = "ANALYZING RAW LATENCY...";
        const rawPing = await measureGamingPing();
        ui.idlePing.innerHTML = `${rawPing} <span class="panel-unit">ms</span>`;
        await sleep(500);

        // 2. التنزيل والبنق المثقل
        setPhaseColor('var(--color-dl)');
        ui.btn.innerText = "DOWNLOADING...";
        ui.status.innerText = "MEASURING DOWNLOAD & LOADED PING...";
        
        isTestingLoaded = true; loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false;
        ui.dlSpeed.innerHTML = `${dlSpeed} <span class="panel-unit">Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPings)} <span class="panel-unit">ms</span>`;
        await sleep(1000);

        // 3. الرفع (الخوارزمية الفعالة 100%)
        resetGauge();
        setPhaseColor('var(--color-ul)');
        ui.btn.innerText = "UPLOADING...";
        ui.status.innerText = "MEASURING UPLOAD THROUGHPUT...";
        
        const ulSpeed = await testUploadMighty();
        ui.ulSpeed.innerHTML = `${ulSpeed} <span class="panel-unit">Mbps</span>`;

        // إنهاء الفحص
        setPhaseColor('var(--color-dl)');
        ui.status.innerText = "DIAGNOSTICS COMPLETE.";
        ui.btn.innerText = "RE-INITIATE";

    } catch (err) {
        ui.status.innerText = "NETWORK ERROR DETECTED.";
        setPhaseColor('var(--color-ping)');
        ui.btn.innerText = "RETRY";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setPhaseColor(color) {
    document.documentElement.style.setProperty('--active-color', color);
    ui.consoleRing.style.boxShadow = `0 0 50px rgba(0,0,0,0.8), inset 0 0 20px ${color}`;
}

function resetUI() {
    resetGauge();
    chartData = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const def = `-- <span class="panel-unit">--</span>`;
    ui.idlePing.innerHTML = def; ui.dlSpeed.innerHTML = def;
    ui.loadedPing.innerHTML = def; ui.ulSpeed.innerHTML = def;
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

// --- 4. محرك البنق (Gaming Raw Ping) ---
async function measureGamingPing() {
    let pings = [];
    // تسخين الاتصال
    try { await fetch(EDGE_PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(performance.now() - start);
        } catch(e) {}
        await sleep(50);
    }
    
    if (pings.length > 0) {
        let rawPing = Math.min(...pings) - 2; // خصم وقت المتصفح الداخلي
        return rawPing > 1 ? Math.round(rawPing) : 1; 
    }
    return "--";
}

async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            let p = (performance.now() - start) - 2;
            loadedPings.push(Math.round(p > 1 ? p : 1));
        } catch(e) {}
        await sleep(250);
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
                    updateChart(finalSpeed, 'var(--color-dl)'); // تحديث الرسم البياني
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع الغاشم (The Ultimate Upload Fix) ---
// الخدعة: إرسال بيانات بصيغة 'text/plain'. المتصفح سيعتبره "طلب بسيط" ولن يحظره (No CORS Blocks).
function testUploadMighty() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        // حزمة 1 ميجا بصيغة نصية (Simple Request Payload)
        const CHUNK_SIZE = 1048576; 
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)], { type: 'text/plain' });

        const uiTimer = setInterval(() => {
            if (!isRunning) return;
            const duration = (performance.now() - globalStartTime) / 1000;
            if (duration > 0.5 && totalSentBytes > 0) {
                finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
                updateChart(finalSpeed, 'var(--color-ul)'); // تحديث الرسم البياني
            }
        }, 250);

        setTimeout(() => {
            isRunning = false;
            clearInterval(uiTimer);
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        // وظيفة إرسال الحزم المستمرة
        async function uploadWorker() {
            while (isRunning) {
                try {
                    // استخدام fetch قياسي. بما أن الملف text/plain لن يتدخل نظام الحماية
                    await fetch('https://speed.cloudflare.com/__up', {
                        method: 'POST',
                        body: chunkData,
                        cache: 'no-store'
                    });
                    
                    // إذا نجح الإرسال، نحتسب الحجم
                    if (isRunning) totalSentBytes += CHUNK_SIZE;
                } catch(e) {
                    await sleep(50);
                }
            }
        }

        // تشغيل 4 مسارات لضغط الخط بالكامل
        for (let i = 0; i < 4; i++) {
            uploadWorker();
        }
    });
}
