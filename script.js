// --- تعريف عناصر الواجهة ---
const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    gaugeLine: document.getElementById('gaugeProgress'),
    unloadedPing: document.getElementById('unloadedPing'),
    dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'),
    ulSpeed: document.getElementById('ulSpeed')
};

const TEST_DURATION = 10000; // 10 ثواني
const GAUGE_DASH = 408; 
let gaugeMaxSpeed = 100;

// استخدام نقطة كلاودفلير للحصول على بنق دقيق
const PING_URL = "https://1.1.1.1/cdn-cgi/trace";

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- دورة الفحص ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. فحص البنق غير المثقل
        ui.btn.innerText = "جاري الفحص...";
        ui.status.innerText = "جاري قياس البنق غير المثقل...";
        const purePing = await measurePing();
        ui.unloadedPing.innerHTML = `${purePing} <span class="metric-unit">ms</span>`;
        await sleep(500);

        // 2. فحص التحميل مع البنق المثقل
        ui.status.innerText = "جاري قياس التحميل والبنق المثقل...";
        ui.gaugeLine.style.stroke = "var(--color-dl)";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.dlSpeed.innerHTML = `${dlResult} <span class="metric-unit">Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPingsArray)} <span class="metric-unit">ms</span>`;
        await sleep(1000);

        // 3. فحص الرفع
        resetGauge();
        ui.status.innerText = "جاري قياس الرفع...";
        ui.gaugeLine.style.stroke = "var(--color-ul)";
        
        const ulResult = await testUpload();
        ui.ulSpeed.innerHTML = `${ulResult} <span class="metric-unit">Mbps</span>`;

        ui.status.innerText = "اكتمل الفحص بنجاح.";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        ui.status.innerText = "حدث خطأ في الشبكة.";
        ui.btn.innerText = "إعادة المحاولة";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- دوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    const def = `-- <span class="metric-unit">--</span>`;
    ui.unloadedPing.innerHTML = def; 
    ui.dlSpeed.innerHTML = def;
    ui.loadedPing.innerHTML = def; 
    ui.ulSpeed.innerHTML = def;
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

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// --- محرك البنق ---
async function measurePing() {
    let pings = [];
    try { await fetch(PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(50);
    }
    return pings.length > 0 ? Math.min(...pings) : "--";
}

async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
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

// --- محرك الرفع ---
// تم إزالة أي ترويسات لتجنب طلبات OPTIONS المسبقة من المتصفح
function testUpload() {
    return new Promise((resolve) => {
        let finalSpeed = 0;
        const startTime = performance.now();
        let isAborted = false;
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
        
        xhr.upload.onprogress = (e) => {
            if (isAborted) return;
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.2 && e.loaded > 0) {
                finalSpeed = ((e.loaded * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
            }
        };

        const payload = new Blob([new Uint8Array(15 * 1024 * 1024)]); 

        const timeout = setTimeout(() => {
            isAborted = true;
            xhr.abort(); 
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        xhr.onload = () => { if(!isAborted) { clearTimeout(timeout); resolve(finalSpeed.toFixed(2)); }};
        xhr.onerror = () => { if(!isAborted) { clearTimeout(timeout); resolve(finalSpeed.toFixed(2)); }};

        xhr.send(payload);
    });
}
