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
const ENDPOINT_URL = "https://speed.cloudflare.com/__down?bytes=0"; // نقطة موحدة لمنطقية البنق

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل المنطقية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // مرحلة 1: البنق الأساسي (Unloaded)
        setActiveBox('unloaded');
        ui.mainUnit.innerText = "MS";
        ui.status.innerText = "جاري حساب استجابة الشبكة...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureOptimalPing();
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

// --- 4. محرك البنق (الأمثل للاستضافات المجانية) ---
async function measureOptimalPing() {
    let pings = [];
    // التسخين لتجاوز وقت الـ TLS
    try { await fetch(ENDPOINT_URL, { cache: 'no-store' }); } catch(e){}
    
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(ENDPOINT_URL + '&t=' + Math.random(), { cache: 'no-store' });
            let rtt = performance.now() - start;
            pings.push(rtt);
        } catch(e) {}
        await sleep(50);
    }
    
    if (pings.length > 0) {
        // نأخذ أقل رقم (أسرع نبضة) ونخصم 3 ملي ثانية لتعويض وقت معالجة المتصفح الداخلي
        let finalPing = Math.min(...pings) - 3;
        return finalPing > 1 ? Math.round(finalPing) : 1;
    }
    return "--";
}

// حلقة البنق المثقل (تعمل أثناء التحميل)
async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(ENDPOINT_URL + '&load=' + Math.random(), { cache: 'no-store' });
            let rtt = performance.now() - start;
            loadedPingsArray.push(Math.round(rtt));
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

        for (let i = 0; i < 4; i++) uploadWorker();
    });
}
