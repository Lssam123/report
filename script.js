// --- 1. إعداد العداد الدائري (Gauge.js) ---
const canvas = document.getElementById('speedGauge');
const gaugeOptions = {
    angle: -0.2, lineWidth: 0.15, radiusScale: 1,
    pointer: { length: 0.55, strokeWidth: 0.035, color: '#e2e8f0' },
    limitMax: false, limitMin: true,
    colorStart: '#3b82f6', colorStop: '#10b981', strokeColor: '#1e293b',
    generateGradient: true, highDpiSupport: true
};
const gauge = new Gauge(canvas).setOptions(gaugeOptions);
gauge.maxValue = 100; // حد مبدئي، يتمدد برمجياً
gauge.setMinValue(0);
gauge.animationSpeed = 40;
gauge.set(0);

// --- 2. المتغيرات والروابط ---
const TEST_DURATION_MS = 10000; // 10 ثواني لكل فحص (تحميل/رفع)
const telecomServers = [
    "https://www.stc.com.sa/", 
    "https://www.mobily.com.sa/", 
    "https://sa.zain.com/", 
    "https://salam.sa/"
];

const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusInfo'),
    mainDisplay: document.getElementById('mainDisplay'),
    idlePing: document.getElementById('idlePing'),
    dlSpeed: document.getElementById('dlSpeed'),
    dlPing: document.getElementById('dlPing'),
    ulSpeed: document.getElementById('ulSpeed'),
    ulPing: document.getElementById('ulPing')
};

let bestPingUrl = "";

// --- 3. المنطق الأساسي للفحص ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // الخطوة 1: فحص البنق المخفي (تحديد الأسرع دون عرض اسمه)
        ui.status.innerText = "جاري تهيئة الاتصال وقياس الاستجابة الأساسية...";
        const idleResult = await getSecretBestPing();
        bestPingUrl = idleResult.url;
        ui.idlePing.innerHTML = `${idleResult.ping} <span>ms</span>`;
        await sleep(500);

        // الخطوة 2: فحص التحميل الزمني
        ui.status.innerText = "جاري قياس الداونلود والبنق المثقل (10 ثواني)...";
        const dlResult = await timeBasedDownload();
        ui.dlSpeed.innerHTML = `${dlResult.speed} <span>Mbps</span>`;
        ui.dlPing.innerHTML = `${dlResult.loadedPing} <span>ms</span>`;
        await sleep(1000);

        // الخطوة 3: فحص الرفع الزمني
        gauge.set(0); ui.mainDisplay.innerText = "0.00"; // تصفير العداد للرفع
        ui.status.innerText = "جاري قياس الابلود والبنق المثقل (10 ثواني)...";
        const ulResult = await timeBasedUpload();
        ui.ulSpeed.innerHTML = `${ulResult.speed} <span>Mbps</span>`;
        ui.ulPing.innerHTML = `${ulResult.loadedPing} <span>ms</span>`;

        ui.status.innerText = "اكتمل الفحص الاحترافي بنجاح.";
    } catch (e) {
        ui.status.innerText = "حدث خطأ في الشبكة. يرجى المحاولة لاحقاً.";
        console.error(e);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص";
    }
});

// --- 4. الدوال الاحترافية للقياس ---

function resetUI() {
    gauge.set(0); gauge.maxValue = 100;
    ui.mainDisplay.innerText = "0.00";
    const def = `-- <span>--</span>`;
    ui.idlePing.innerHTML = def; ui.dlSpeed.innerHTML = def; ui.dlPing.innerHTML = def;
    ui.ulSpeed.innerHTML = def; ui.ulPing.innerHTML = def;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// فحص مخفي لجميع السيرفرات وإرجاع الأفضل زمناً ورابطاً فقط
async function getSecretBestPing() {
    let minPing = Infinity;
    let bestUrl = null;
    for (let url of telecomServers) {
        let p = await pingSingle(url);
        if (p < minPing) { minPing = p; bestUrl = url; }
    }
    return minPing === Infinity ? { ping: "-", url: null } : { ping: minPing, url: bestUrl };
}

async function pingSingle(url) {
    const start = performance.now();
    try {
        await fetch(url + '?n=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
        return Math.round(performance.now() - start);
    } catch (e) { return Infinity; }
}

// دالة فحص التحميل الزمنية (باستخدام ReadableStream و AbortController)
async function timeBasedDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const signal = controller.signal;
        // نطلب ملفاً ضخماً جداً (500 ميجا) لنضمن أنه لن ينتهي قبل 10 ثواني
        const url = `https://speed.cloudflare.com/__down?bytes=500000000`;
        
        let loadedPings = [];
        let receivedBytes = 0;
        let finalSpeed = 0;

        // إيقاف الفحص إجبارياً بعد 10 ثواني
        const timeLimit = setTimeout(() => { controller.abort(); }, TEST_DURATION_MS);
        
        // مؤقت البنق المثقل
        const pingInt = setInterval(async () => {
            if(bestPingUrl) {
                let p = await pingSingle(bestPingUrl);
                if(p !== Infinity) loadedPings.push(p);
            }
        }, 500);

        const startTime = performance.now();

        try {
            const response = await fetch(url, { cache: 'no-store', signal });
            const reader = response.body.getReader();
            
            while(true) {
                const {done, value} = await reader.read();
                if (done) break;
                receivedBytes += value.length;
                
                // تحديث العداد اللحظي
                const now = performance.now();
                const duration = (now - startTime) / 1000;
                if (duration > 0.2) { // بعد أول 200 ملي ثانية لضمان دقة الحساب
                    let currentSpeed = ((receivedBytes * 8) / duration) / 1000000;
                    updateGaugeUI(currentSpeed);
                    finalSpeed = currentSpeed; // نحتفظ بآخر سرعة مسجلة
                }
            }
        } catch (err) {
            // سيتم اصطياد خطأ AbortError هنا عندما نوقف التحميل بعد 10 ثواني
            if (err.name !== 'AbortError') console.error(err);
        }

        clearInterval(pingInt);
        clearTimeout(timeLimit);
        
        const avgLoaded = loadedPings.length ? Math.round(loadedPings.reduce((a,b)=>a+b)/loadedPings.length) : "--";
        resolve({ speed: finalSpeed.toFixed(2), loadedPing: avgLoaded });
    });
}

// دالة فحص الرفع الزمنية (باستخدام XMLHttpRequest)
async function timeBasedUpload() {
    return new Promise((resolve) => {
        const uploadSize = 50000000; // 50 ميجا للرفع
        const payload = new Uint8Array(uploadSize);
        const url = "https://speed.cloudflare.com/__up";
        
        const xhr = new XMLHttpRequest();
        let loadedPings = [];
        let finalSpeed = 0;
        let startTime;

        const pingInt = setInterval(async () => {
            if(bestPingUrl) {
                let p = await pingSingle(bestPingUrl);
                if(p !== Infinity) loadedPings.push(p);
            }
        }, 500);

        // قطع الاتصال بعد 10 ثواني
        const timeLimit = setTimeout(() => { 
            xhr.abort(); 
            finishUpload();
        }, TEST_DURATION_MS);

        xhr.upload.onprogress = (event) => {
            const now = performance.now();
            const duration = (now - startTime) / 1000;
            if (duration > 0.2 && event.loaded > 0) {
                let currentSpeed = ((event.loaded * 8) / duration) / 1000000;
                updateGaugeUI(currentSpeed);
                finalSpeed = currentSpeed;
            }
        };

        xhr.onload = () => finishUpload(); // في حال انتهى الرفع قبل 10 ثواني (سرعة عالية جداً)
        
        function finishUpload() {
            clearInterval(pingInt);
            clearTimeout(timeLimit);
            const avgLoaded = loadedPings.length ? Math.round(loadedPings.reduce((a,b)=>a+b)/loadedPings.length) : "--";
            resolve({ speed: finalSpeed.toFixed(2), loadedPing: avgLoaded });
        }

        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        startTime = performance.now();
        xhr.send(payload);
    });
}

// دالة لتحديث العداد بسلاسة وضبط الحد الأقصى
function updateGaugeUI(speed) {
    if (speed > gauge.maxValue * 0.9) {
        gauge.maxValue = Math.ceil((speed + 50) / 100) * 100; // زيادة الحد الأقصى ديناميكياً
    }
    gauge.set(speed);
    ui.mainDisplay.innerText = speed.toFixed(2);
}
