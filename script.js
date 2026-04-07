// --- 1. ربط الواجهة (UI Bindings) ---
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

const TEST_DURATION = 10000; // 10 ثواني لكل مرحلة فحص

// مصفوفة السيرفرات المحلية (KSA Edge Nodes)
const PING_TARGETS = [
    "https://speed.cloudflare.com/__down?bytes=0", 
    "https://www.stc.com.sa/favicon.ico",          
    "https://www.mobily.com.sa/favicon.ico",       
    "https://sa.zain.com/favicon.ico",             
    "https://salam.sa/favicon.ico",                
    "https://www.jawwy.sa/favicon.ico",            
    "https://www.kau.edu.sa/favicon.ico"           
];

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل الرئيسية (Execution Loop) ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // --- المرحلة 1: البنق الأساسي (Idle Latency) ---
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---";
        ui.mainUnit.innerText = "PING"; 
        ui.status.innerText = "جاري مسح الخوادم المحلية واصطياد أسرع مسار...";
        ui.btn.innerText = "جاري الفحص...";
        
        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // --- المرحلة 2: التنزيل والبنق المثقل (Bufferbloat Test) ---
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.mainVal.innerText = "0.00"; 
        ui.mainUnit.innerText = "MBPS"; 
        ui.status.innerText = "جاري قياس التنزيل وتأثير ضغط البيانات...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // --- المرحلة 3: الرفع (Upload Test) ---
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس قدرة الرفع عبر حزم البيانات الخام...";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // --- إنهاء الفحص (Finalization) ---
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح وفق المعايير الهندسية.";
        ui.mainVal.innerText = "انتهى";
        ui.mainUnit.innerText = "DONE";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        console.error("Test Error:", err);
        ui.status.innerText = "حدث خطأ. تحقق من استقرار الشبكة.";
        ui.btn.innerText = "إعادة المحاولة";
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة (Helper Functions) ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    ui.mainVal.innerText = "0.00";
    ui.mainVal.style.color = "var(--text-dark)";
    ui.mainUnit.innerText = "MBPS";
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
    return sorted[Math.floor(sorted.length * 2 / 3)]; // نأخذ شريحة متقدمة لضمان استقرار الرقم تحت الضغط
}

function updateMainValue(speed) {
    ui.mainVal.innerText = speed.toFixed(2);
}

// --- 4. محرك البنق المطور (Advanced Latency Engine) ---
async function measureLocalPing() {
    let pings = [];
    
    // أ- مرحلة التسخين (Handshake Warm-up) لفتح قنوات SSL/TCP
    for (const target of PING_TARGETS) {
        try { await fetch(target, { mode: 'no-cors', cache: 'no-store', priority: 'high' }); } catch(e){}
    }
    
    // ب- مرحلة القياس المكثف (Burst Mode)
    for(let i=0; i<6; i++) {
        const wavePromises = PING_TARGETS.map(target => {
            let start = performance.now();
            return fetch(target + '?t=' + Math.random(), { 
                mode: 'no-cors', 
                cache: 'no-store',
                priority: 'high' 
            }).then(() => {
                pings.push(performance.now() - start);
            }).catch(()=>{});
        });
        await Promise.all(wavePromises);
        await sleep(40); 
    }
    
    if (pings.length > 0) {
        // ج- الفلترة الإحصائية: نأخذ أقل رقم (Best Sample) لتمثيل سرعة الكيبل الصافية
        const sorted = pings.sort((a, b) => a - b);
        let bestPurePing = sorted[0]; 
        return Math.round(bestPurePing); 
    }
    return "--";
}

// حلقة البنق أثناء التحميل
async function startLoadedPingLoop() {
    const LOAD_URL = PING_TARGETS[0]; 
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(LOAD_URL + '&load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(400); 
    }
}

// --- 5. محرك التنزيل (Download Engine) ---
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
                if (duration > 0.1) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateMainValue(finalSpeed);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. محرك الرفع المستقر (Stable Upload Engine) ---
async function testUpload() {
    let finalSpeed = 0;
    let totalSent = 0;
    const startTime = performance.now();
    const endTime = startTime + TEST_DURATION;
    
    const payload = new Uint8Array(2 * 1024 * 1024);

    while (performance.now() < endTime) {
        try {
            await fetch('https://speed.cloudflare.com/__up', {
                method: 'POST',
                body: payload,
                cache: 'no-store',
                mode: 'no-cors'
            });
            
            totalSent += payload.length;
            const duration = (performance.now() - startTime) / 1000;
            finalSpeed = ((totalSent * 8) / duration) / 1000000;
            updateMainValue(finalSpeed);
            
        } catch (e) {
            if (totalSent === 0) return "Error";
            break; 
        }
    }
    
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}
