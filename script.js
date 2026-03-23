// --- 1. إعداد واجهة المستخدم والعداد ---
const canvas = document.getElementById('speedGauge');
const gauge = new Gauge(canvas).setOptions({
    angle: -0.2, lineWidth: 0.15, radiusScale: 1, pointer: { length: 0.5, strokeWidth: 0.035, color: '#f8fafc' },
    limitMax: false, limitMin: true, colorStart: '#3b82f6', colorStop: '#10b981', strokeColor: '#334155', generateGradient: true
});
gauge.maxValue = 100; gauge.setMinValue(0); gauge.animationSpeed = 40; gauge.set(0);

const ui = {
    btn: document.getElementById('startBtn'), 
    status: document.getElementById('statusText'), 
    mainVal: document.getElementById('mainValue'),
    idlePing: document.getElementById('idlePing'), 
    dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'), 
    ulSpeed: document.getElementById('ulSpeed')
};

const TEST_DURATION = 10000; // 10 ثواني
const EDGE_URL = "https://cp.cloudflare.com/generate_204"; // أسرع نقطة استجابة لكلاودفلير

let isTestingLoaded = false;
let loadedPings = [];

// --- 2. دورة التشغيل وزر الإعادة ---
ui.btn.addEventListener('click', async () => {
    // تصفير الواجهة عند بدء أو إعادة الفحص
    resetUI();
    ui.btn.disabled = true;
    ui.btn.innerText = "جاري الفحص...";

    try {
        // 1. البنق الأساسي (مع تقنية التسخين)
        ui.status.innerText = "جاري قياس الاستجابة الصافية (Ping)...";
        const basePing = await measureUltraPing();
        ui.idlePing.innerHTML = `${basePing} <span>ms</span>`;
        await sleep(500);

        // 2. التحميل + البنق المثقل
        ui.status.innerText = "جاري فحص التحميل (10 ثواني)...";
        isTestingLoaded = true; loadedPings = [];
        startLoadedPingLoop(); 
        
        const dlResult = await measureDownload();
        
        isTestingLoaded = false; 
        ui.dlSpeed.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPings)} <span>ms</span>`;
        await sleep(1000);

        // 3. الرفع (بتقنية تجاوز الحظر)
        gauge.set(0); ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري فحص الرفع (10 ثواني)...";
        
        const ulResult = await measureUploadSafe();
        ui.ulSpeed.innerHTML = `${ulResult} <span>Mbps</span>`;

        ui.status.style.color = "#10b981";
        ui.status.innerText = "اكتمل الفحص. النتائج جاهزة للمصادقة.";
    } catch (e) {
        ui.status.style.color = "#ef4444";
        ui.status.innerText = "حدث خطأ. تأكد من إيقاف مانع الإعلانات أو الـ VPN.";
        console.error("Test Error:", e);
    } finally {
        // تحويل الزر إلى "إعادة الفحص" ليعمل مجدداً
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص";
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    gauge.set(0); gauge.maxValue = 100; ui.mainVal.innerText = "0.00";
    ui.status.style.color = "#3b82f6";
    const def = `-- <span>--</span>`;
    ui.idlePing.innerHTML = def; ui.dlSpeed.innerHTML = def; 
    ui.loadedPing.innerHTML = def; ui.ulSpeed.innerHTML = def;
}

function updateUI(speed) {
    if (speed > gauge.maxValue * 0.9) gauge.maxValue = Math.ceil((speed + 50) / 100) * 100;
    gauge.set(speed);
    ui.mainVal.innerText = speed.toFixed(2);
}

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]; // أخذ الرقم الأوسط بدقة
}

// --- 4. دالة البنق المحسنة (تقنية التسخين) ---
async function measureUltraPing() {
    // 1. التسخين (فتح قناة الاتصال دون حساب الوقت)
    try { await fetch(EDGE_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e) {}
    
    // 2. القياس الفعلي السريع
    let pings = [];
    for (let i = 0; i < 5; i++) {
        let start = performance.now();
        try {
            await fetch(EDGE_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(50);
    }
    return pings.length > 0 ? Math.min(...pings) : "--"; // أخذ أقل رقم (الأسرع) تماماً كسبيد تست
}

async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(EDGE_URL + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(200);
    }
}

// --- 5. دالة التحميل ---
function measureDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=100000000"; // 100MB
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
                if (duration > 0.3) { // تحديث بعد 300 ملي ثانية لضمان استقرار الرقم
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateUI(finalSpeed);
                }
            }
        } catch (e) {}
        
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. دالة الرفع الآمنة (تجاوز حظر المتصفحات) ---
function measureUploadSafe() {
    return new Promise((resolve) => {
        let finalSpeed = 0;
        let totalBytes = 0;
        const startTime = performance.now();
        let isAborted = false;
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
        
        // الملاحظة الأهم: لا نستخدم setRequestHeader أبداً لتجنب فحص CORS (OPTIONS)
        
        xhr.upload.onprogress = (e) => {
            if (isAborted) return;
            totalBytes = e.loaded;
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.3 && totalBytes > 0) {
                finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                updateUI(finalSpeed);
            }
        };

        // إنشاء كتلة بيانات خام (Blob) بحجم 25 ميجابايت لتشبع الخط
        // إرسالها ككتلة خام يمنع المتصفح من الشك في نوع البيانات
        const payload = new Blob([new ArrayBuffer(25 * 1024 * 1024)]); 

        const timeout = setTimeout(() => {
            isAborted = true;
            xhr.abort();
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        xhr.onload = () => {
            if (!isAborted) {
                clearTimeout(timeout);
                resolve(finalSpeed.toFixed(2));
            }
        };

        xhr.send(payload);
    });
}
