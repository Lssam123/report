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

const TEST_DURATION = 10000; 
const GAUGE_CIRCUMFERENCE = 691; 
let gaugeMaxSpeed = 100; 

// نقطة الحافة (Edge Node) الخاصة بكلاودفلير لتعطي بنق الألعاب الحقيقي
const EDGE_PING_URL = "https://cp.cloudflare.com/generate_204";

let isTestingLoaded = false;
let loadedPings = [];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;
    ui.btn.innerText = "جاري القياس...";

    try {
        // 1. الاستجابة الأساسية (Ping الألعاب)
        ui.status.innerText = "جاري قياس استجابة خوادم الحافة (Gaming Ping)...";
        const basePing = await measureGamingPing();
        ui.idlePing.innerHTML = `${basePing}<span>ms</span>`;
        await sleep(500);

        // 2. التنزيل والبنق المثقل
        ui.status.innerText = "جاري قياس التنزيل وتأثير الاختناق (10 ثواني)...";
        ui.gaugeLine.style.stroke = "var(--accent-blue)";
        
        isTestingLoaded = true; loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false;
        ui.dlSpeed.innerHTML = `${dlSpeed}<span>Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPings)}<span>ms</span>`;
        await sleep(1000);

        // 3. الرفع (الخوارزمية الجديدة والمضمونة)
        resetGauge();
        ui.status.innerText = "جاري قياس الرفع (10 ثواني)...";
        ui.gaugeLine.style.stroke = "var(--accent-green)";
        
        const ulSpeed = await testUploadMighty();
        ui.ulSpeed.innerHTML = `${ulSpeed}<span>Mbps</span>`;

        ui.status.innerText = "اكتمل الاختبار بنجاح وتم تسجيل النتائج!";
        ui.status.style.color = "var(--accent-green)";

    } catch (err) {
        ui.status.innerText = "حدث خطأ. يرجى التأكد من اتصالك وإيقاف مانع الإعلانات.";
        ui.status.style.color = "var(--accent-orange)";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الاختبار الشامل";
        isTestingLoaded = false;
    }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.status.style.color = "var(--text-muted)";
    const def = `--<span>--</span>`;
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

// --- محرك البنق الحقيقي (Gaming Ping) ---
async function measureGamingPing() {
    let pings = [];
    // تسخين الاتصال لعدم حساب وقت التشفير
    try { await fetch(EDGE_PING_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    // إرسال 5 طلبات سريعة جداً وأخذ الأسرع
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
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
            await fetch(EDGE_PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(200);
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

// --- محرك الرفع القوي (The Mighty Upload Engine) ---
// استخدام XMLHttpRequest لمراقبة تدفق البيانات من "كرت الشبكة" لتجاوز قيود الرفع
function testUploadMighty() {
    return new Promise((resolve) => {
        let finalSpeed = 0;
        const startTime = performance.now();
        let isAborted = false;
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
        
        // تتبع حجم البيانات التي تخرج من جهازك
        xhr.upload.onprogress = (e) => {
            if (isAborted) return;
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.2 && e.loaded > 0) {
                finalSpeed = ((e.loaded * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
            }
        };

        // إنشاء حزمة بيانات كبيرة (30 ميجابايت) بدون تحديد نوعها لتخطي الـ CORS
        const payload = new Blob([new Uint8Array(30 * 1024 * 1024)]); 

        const timeout = setTimeout(() => {
            isAborted = true;
            xhr.abort(); // قطع الاتصال إجبارياً بعد 10 ثواني
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        xhr.onload = () => { if(!isAborted) { clearTimeout(timeout); resolve(finalSpeed.toFixed(2)); }};
        xhr.onerror = () => { if(!isAborted) { clearTimeout(timeout); resolve(finalSpeed.toFixed(2)); }};

        xhr.send(payload);
    });
}
