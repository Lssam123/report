// --- 1. إعداد العداد ---
const canvas = document.getElementById('speedGauge');
const gauge = new Gauge(canvas).setOptions({
    angle: -0.2, lineWidth: 0.15, radiusScale: 1, pointer: { length: 0.5, strokeWidth: 0.035, color: '#f8fafc' },
    limitMax: false, limitMin: true, colorStart: '#3b82f6', colorStop: '#10b981', strokeColor: '#334155', generateGradient: true
});
gauge.maxValue = 100; gauge.setMinValue(0); gauge.animationSpeed = 40; gauge.set(0);

const ui = {
    btn: document.getElementById('startBtn'), status: document.getElementById('statusText'), mainVal: document.getElementById('mainValue'),
    idlePing: document.getElementById('idlePing'), dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'), ulSpeed: document.getElementById('ulSpeed')
};

// إعدادات الفحص
const TEST_DURATION = 10000; // 10 ثواني دقيقة
const PING_URL = "https://speed.cloudflare.com/__down?bytes=0"; // رد سريع جداً بـ 0 بايت

let isTestingLoaded = false;
let loadedPings = [];

// --- 2. دورة التشغيل الأساسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. فحص البنق الأساسي
        ui.status.innerText = "جاري قياس الاستجابة الأساسية (Ping)...";
        const basePing = await measureRawPing();
        ui.idlePing.innerHTML = `${basePing} <span>ms</span>`;
        await sleep(500);

        // 2. فحص التحميل + البنق المثقل
        ui.status.innerText = "جاري قياس التحميل والبنق المثقل (10 ثواني)...";
        isTestingLoaded = true; loadedPings = [];
        startLoadedPingLoop(); // تشغيل البنق المثقل
        
        const dlResult = await measureDownload();
        
        isTestingLoaded = false; // إيقاف البنق المثقل
        ui.dlSpeed.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedianPing(loadedPings)} <span>ms</span>`;
        await sleep(1000);

        // 3. فحص الرفع
        gauge.set(0); ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس الرفع (10 ثواني)...";
        
        const ulResult = await measureUpload();
        ui.ulSpeed.innerHTML = `${ulResult} <span>Mbps</span>`;

        ui.status.style.color = "#10b981";
        ui.status.innerText = "تم إنجاز الفحص بنجاح. الأرقام جاهزة للمقارنة.";
    } catch (e) {
        ui.status.style.color = "#ef4444";
        ui.status.innerText = "حدث خطأ. يرجى التأكد من الاتصال.";
        console.error(e);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الاختبار";
        isTestingLoaded = false;
    }
});

// --- 3. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    gauge.set(0); gauge.maxValue = 100; ui.mainVal.innerText = "0.00";
    ui.status.style.color = "#3b82f6";
    const def = `-- <span>--</span>`;
    ui.idlePing.innerHTML=def; ui.dlSpeed.innerHTML=def; ui.loadedPing.innerHTML=def; ui.ulSpeed.innerHTML=def;
}

function updateUI(speed) {
    if (speed > gauge.maxValue * 0.9) gauge.maxValue = Math.ceil((speed + 50) / 100) * 100;
    gauge.set(speed);
    ui.mainVal.innerText = speed.toFixed(2);
}

// حساب الوسيط لاستبعاد أي قراءات وهمية
function calculateMedianPing(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// --- 4. دالة البنق الأساسي ---
async function measureRawPing() {
    let pings = [];
    // نرسل 5 طلبات ونأخذ الأسرع، لأن أسرع طلب يمثل قدرة الخط الحقيقية بعيداً عن تباطؤ المتصفح
    for (let i = 0; i < 5; i++) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '&t=' + Math.random(), { cache: 'no-store' });
            pings.push(Math.round(performance.now() - start));
        } catch(e) {}
    }
    return pings.length > 0 ? Math.min(...pings) : "--";
}

// البنق المثقل يعمل في الخلفية أثناء التحميل
async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '&t=' + Math.random(), { cache: 'no-store' });
            loadedPings.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(200);
    }
}

// --- 5. دالة التحميل (الدقة المطلقة عبر ReadableStream) ---
function measureDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=100000000"; // طلب 100 ميجا
        let totalBytes = 0;
        let finalSpeed = 0;
        const startTime = performance.now();

        // قاطع الاتصال بعد 10 ثواني
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
                totalBytes += value.length; // حساب دقيق جداً لكل بايت
                
                const duration = (performance.now() - startTime) / 1000;
                if (duration > 0.2) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateUI(finalSpeed);
                }
            }
        } catch (e) {
            // تجاهل خطأ التوقف المتعمد بعد 10 ثواني
        }
        
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. دالة الرفع (الخوارزمية المعتمدة للمتصفحات) ---
function measureUpload() {
    return new Promise((resolve) => {
        const numWorkers = 2; // مسارين متوازيين لضمان تشبع الخط وتجاوز حظر المتصفح
        let xhrs = [];
        let loadedBytesArray = new Array(numWorkers).fill(0);
        let finalSpeed = 0;
        const startTime = performance.now();

        // قاطع الاتصال بعد 10 ثواني
        const timeout = setTimeout(() => {
            xhrs.forEach(xhr => xhr.abort());
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        for (let i = 0; i < numWorkers; i++) {
            let xhr = new XMLHttpRequest();
            xhrs.push(xhr);
            xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            
            // تتبع ما تم رفعه من هذا المسار فقط
            xhr.upload.onprogress = (e) => {
                loadedBytesArray[i] = e.loaded;
                // جمع ما تم رفعه من كلا المسارين
                let totalBytes = loadedBytesArray.reduce((a, b) => a + b, 0);
                const duration = (performance.now() - startTime) / 1000;
                
                if (duration > 0.2) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateUI(finalSpeed);
                }
            };

            // إنشاء ملف وهمي بحجم 20 ميجا لكل مسار
            const payload = new Uint8Array(20 * 1024 * 1024);
            xhr.send(payload);
        }
    });
}
