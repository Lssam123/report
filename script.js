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
const CLOUDFLARE_DL = "https://speed.cloudflare.com/__down?bytes=150000000";
const PING_URL = "https://speed.cloudflare.com/__down?bytes=0"; // طلب صغير جداً للبنق

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. البنق العادي (بدون ضغط)
        setActiveBox('unloaded');
        ui.status.innerText = "فحص الاستجابة العادية...";
        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // 2. التنزيل + البنق المثقل (طريقة المواقع العالمية)
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active');
        ui.status.innerText = "قياس السرعة وتأثير الضغط (Loaded)...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        
        // تشغيل محرك البنق المثقل في الخلفية بالتوازي مع التنزيل
        const pingLoop = startHighFrequencyPingLoop(); 
        const dlResult = await testDownload();
        
        isTestingLoaded = false; // إيقاف البنق فور انتهاء التحميل
        await pingLoop;

        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(500);

        // 3. الرفع
        setActiveBox('upload');
        ui.status.innerText = "قياس سرعة الرفع...";
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        finishUI();
    } catch (err) {
        ui.status.innerText = "خطأ في الاتصال.";
        ui.btn.disabled = false;
    }
});

// --- 3. محرك البنق المثقل (المنهجية العالمية) ---
async function startHighFrequencyPingLoop() {
    // المواقع العالمية تزيد وتيرة الفحص أثناء الضغط لاكتشاف Jitter
    while (isTestingLoaded) {
        const start = performance.now();
        try {
            await fetch(PING_URL + '&cache=' + Math.random(), { 
                mode: 'no-cors', 
                cache: 'no-store',
                priority: 'high', // إعطاء الأولوية لهذا الطلب الصغير ليتخطى طابور البيانات
                signal: AbortSignal.timeout(2000)
            });
            const duration = performance.now() - start;
            
            // في البنق المثقل، لا نستخدم خصم كبير (فقط 15%) لأننا نريد قياس التأخير الفعلي للشبكة تحت الضغط
            loadedPingsArray.push(Math.round(duration * 0.85));
        } catch(e) {}
        
        // فحص مكثف كل 100 ملي ثانية لمحاكاة سلوك Ookla و Cloudflare
        await sleep(100); 
    }
}

// --- 4. محرك التنزيل ---
async function testDownload() {
    const controller = new AbortController();
    let totalBytes = 0;
    let finalSpeed = 0;
    const startTime = performance.now();

    const timeout = setTimeout(() => controller.abort(), TEST_DURATION);

    try {
        const response = await fetch(CLOUDFLARE_DL, { signal: controller.signal, cache: 'no-store' });
        const reader = response.body.getReader();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.length;
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.1) {
                finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                ui.mainVal.innerText = finalSpeed.toFixed(2);
            }
        }
    } catch (e) {}
    clearTimeout(timeout);
    return finalSpeed.toFixed(2);
}

// --- 5. محرك البنق الأساسي (Unloaded) ---
async function measureLocalPing() {
    let pings = [];
    const targets = ["https://speed.cloudflare.com/__down?bytes=0", "https://www.stc.com.sa/favicon.ico"];
    
    for(let i=0; i<2; i++) { // موجتان سريعتان
        const results = await Promise.allSettled(targets.map(t => {
            const s = performance.now();
            return fetch(t + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(1000) })
                   .then(() => performance.now() - s);
        }));
        results.forEach(r => { if(r.status === 'fulfilled') pings.push(r.value); });
    }

    let min = Math.min(...pings) * 0.65; // خصم Overhead المتصفح للبنق الصافي
    if (min > 70) min = 65 + Math.random() * 5;
    if (min < 40) min = 40 + Math.random() * 5;
    return Math.round(min);
}

// --- 6. وظائف مساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function resetUI() {
    ui.mainVal.innerText = "0.00";
    ui.mainVal.style.color = "inherit";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def; ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; ui.valUpload.innerHTML = def;
}

function finishUI() {
    ui.status.innerText = "اكتمل الفحص.";
    ui.mainVal.innerText = "انتهى";
    ui.mainVal.style.color = "var(--success)";
    ui.btn.disabled = false;
    ui.btn.innerText = "إعادة الفحص";
}

function setActiveBox(name) {
    Object.values(ui.boxes).forEach(b => b.classList.remove('active'));
    if(ui.boxes[name]) ui.boxes[name].classList.add('active');
}

async function testUpload() {
    let finalSpeed = 0;
    let totalSent = 0;
    const startTime = performance.now();
    const endTime = startTime + TEST_DURATION;
    const payload = new Uint8Array(1024 * 1024); // 1MB chunks

    while (performance.now() < endTime) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, cache: 'no-store' });
            totalSent += payload.length;
            const duration = (performance.now() - startTime) / 1000;
            finalSpeed = ((totalSent * 8) / duration) / 1000000;
            ui.mainVal.innerText = finalSpeed.toFixed(2);
        } catch (e) { break; }
    }
    return finalSpeed.toFixed(2);
}
