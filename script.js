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
const EDGE_URL = "https://1.1.1.1/cdn-cgi/trace";

let isTestingLoaded = false;
let loadedPings = [];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. فحص البنق غير المثقل
        setActiveBox('unloaded');
        ui.status.innerText = "جاري قياس البنق غير المثقل...";
        const unloadedPing = await measurePing();
        ui.valUnloaded.innerHTML = `${unloadedPing} <span>ms</span>`;
        await sleep(500);

        // 2. فحص التنزيل والبنق المثقل معاً
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); // إضاءة مربع البنق المثقل أيضاً
        ui.status.innerText = "جاري قياس التنزيل وتأثير الاختناق...";
        
        isTestingLoaded = true;
        loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlSpeed = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlSpeed} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPings)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // 3. فحص الرفع
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس الرفع (مرحلة تجاوز حماية المتصفح)...";
        
        const ulSpeed = await testUpload();
        ui.valUpload.innerHTML = `${ulSpeed} <span>Mbps</span>`;

        // إنهاء
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح.";
        ui.mainVal.style.color = "var(--success)";

    } catch (err) {
        ui.status.innerText = "حدث خطأ في الاتصال. راجع إعدادات الشبكة.";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص";
        isTestingLoaded = false;
    }
});

// --- الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    ui.mainVal.innerText = "0.00";
    ui.mainVal.style.color = "var(--text-dark)";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def; ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; ui.valUpload.innerHTML = def;
    setActiveBox(null);
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

// --- محرك البنق ---
async function measurePing() {
    let pings = [];
    try { await fetch(EDGE_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
    
    for(let i=0; i<5; i++) {
        let start = performance.now();
        try {
            await fetch(EDGE_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
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
            await fetch(EDGE_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPings.push(Math.round(performance.now() - start));
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
                    ui.mainVal.innerText = finalSpeed.toFixed(2);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- محرك الرفع ---
// لتجنب خطأ الـ CORS، نرسل البيانات ككتلة عشوائية عبر Fetch مباشرة.
async function testUpload() {
    let finalSpeed = 0;
    let totalSent = 0;
    const startTime = performance.now();
    const endTime = startTime + TEST_DURATION;
    
    // إنشاء حزمة بيانات عشوائية بحجم 2 ميجابايت
    const payload = new Uint8Array(2 * 1024 * 1024);

    while (performance.now() < endTime) {
        try {
            // نستخدم POST بدون إعداد أي Headers مخصصة لكي يصنف كـ Simple Request
            await fetch('https://speed.cloudflare.com/__up', {
                method: 'POST',
                body: payload,
                cache: 'no-store'
            });
            
            totalSent += payload.length;
            const duration = (performance.now() - startTime) / 1000;
            finalSpeed = ((totalSent * 8) / duration) / 1000000;
            ui.mainVal.innerText = finalSpeed.toFixed(2);
            
        } catch (e) {
            // إذا حظر المتصفح العملية، نتوقف ونعرض ما تم حسابه (أو خطأ)
            console.error("Upload blocked by browser CORS policy:", e);
            if (totalSent === 0) return "Error";
            break; 
        }
    }
    
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}
