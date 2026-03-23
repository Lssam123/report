// --- 1. إعداد واجهة المستخدم والعداد ---
const canvas = document.getElementById('speedGauge');
const gauge = new Gauge(canvas).setOptions({
    angle: -0.2, lineWidth: 0.15, radiusScale: 1, pointer: { length: 0.55, strokeWidth: 0.035, color: '#f3f4f6' },
    limitMax: false, limitMin: true, colorStart: '#0ea5e9', colorStop: '#10b981', strokeColor: '#1f2937', generateGradient: true
});
gauge.maxValue = 100; gauge.setMinValue(0); gauge.animationSpeed = 50; gauge.set(0);

const ui = {
    btn: document.getElementById('startBtn'), status: document.getElementById('statusInfo'), main: document.getElementById('mainDisplay'),
    idlePing: document.getElementById('idlePing'), dlSpeed: document.getElementById('dlSpeed'), dlPing: document.getElementById('dlPing'),
    ulSpeed: document.getElementById('ulSpeed'), ulPing: document.getElementById('ulPing')
};

// --- 2. إعدادات الشبكة والسيرفرات المخفية ---
const TEST_DURATION = 10000; // 10 ثواني بالضبط لكل عملية قياس
const telecomServers = [
    "https://www.stc.com.sa/", "https://www.mobily.com.sa/", 
    "https://sa.zain.com/", "https://salam.sa/", "https://www.go.com.sa/"
];

let bestPingUrl = "";
let isTestingPing = false; // القفل الذي يزامن البنق مع السرعة
let currentPingsArray = [];

// --- 3. دورة الاختبار الشاملة ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // الخطوة 1: اختيار أفضل سيرفر مخفي وقياس البنق الأساسي (لمدة ثانيتين لضمان دقة القراءة)
        ui.status.innerText = "جاري تهيئة الاتصال وتحديد أسرع مسار للألعاب...";
        bestPingUrl = await findBestServer();
        
        isTestingPing = true; currentPingsArray = [];
        startGamingPingLoop(); // تشغيل البنق
        await sleep(2000); // قياس لمدة ثانيتين
        isTestingPing = false; // إيقاف البنق
        ui.idlePing.innerHTML = `${calculateAveragePing()} <span>ms</span>`;
        await sleep(500);

        // الخطوة 2: التحميل والبنق المثقل (مزامنة تامة لمدة 10 ثواني)
        ui.status.innerText = "جاري قياس التحميل وتأثير الاختناق (10 ثواني)...";
        isTestingPing = true; currentPingsArray = [];
        startGamingPingLoop(); // البنق يبدأ مع التحميل
        const dlResult = await measureSpeedXHR('download');
        isTestingPing = false; // البنق يتوقف فور انتهاء التحميل
        
        ui.dlSpeed.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.dlPing.innerHTML = `${calculateAveragePing()} <span>ms</span>`;
        await sleep(1000);

        // الخطوة 3: الرفع والبنق المثقل (مزامنة تامة لمدة 10 ثواني)
        gauge.set(0); ui.main.innerText = "0.00";
        ui.status.innerText = "جاري قياس الرفع وتأثير الاختناق (10 ثواني)...";
        isTestingPing = true; currentPingsArray = [];
        startGamingPingLoop(); // البنق يبدأ مع الرفع
        const ulResult = await measureSpeedXHR('upload');
        isTestingPing = false; // البنق يتوقف فور انتهاء الرفع

        ui.ulSpeed.innerHTML = `${ulResult} <span>Mbps</span>`;
        ui.ulPing.innerHTML = `${calculateAveragePing()} <span>ms</span>`;

        ui.status.innerText = "تم الفحص بدقة احترافية عالية.";
    } catch (e) {
        ui.status.innerText = "حدث خطأ في تقييم الشبكة.";
        console.error(e);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص المتقدم";
        isTestingPing = false; // ضمان إيقاف أي عمليات في الخلفية
    }
});

// --- 4. العمليات المساعدة (Utility Functions) ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    gauge.set(0); gauge.maxValue = 100; ui.main.innerText = "0.00";
    const def = `-- <span>--</span>`;
    ui.idlePing.innerHTML=def; ui.dlSpeed.innerHTML=def; ui.dlPing.innerHTML=def; ui.ulSpeed.innerHTML=def; ui.ulPing.innerHTML=def;
}

function updateGauge(speed) {
    if (speed > gauge.maxValue * 0.9) gauge.maxValue = Math.ceil((speed + 50) / 100) * 100;
    gauge.set(speed);
    ui.main.innerText = speed.toFixed(2);
}

// --- 5. هندسة استجابة الألعاب (Gaming Ping Engine) ---
async function findBestServer() {
    let bestUrl = telecomServers[0];
    let minPing = Infinity;
    for (let url of telecomServers) {
        let start = performance.now();
        try {
            await fetch(url + '?_t=' + Date.now(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            let p = performance.now() - start;
            if (p < minPing) { minPing = p; bestUrl = url; }
        } catch(e) {}
    }
    return bestUrl;
}

// حلقة البنق المستمرة (Game Tick Simulator)
async function startGamingPingLoop() {
    while (isTestingPing && bestPingUrl) {
        let start = performance.now();
        try {
            await fetch(bestPingUrl + '?_t=' + Date.now(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            currentPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        // الانتظار 100 ملي ثانية لمحاكاة تحديث سيرفرات الألعاب
        await sleep(100); 
    }
}

function calculateAveragePing() {
    if (currentPingsArray.length === 0) return "--";
    const sum = currentPingsArray.reduce((a, b) => a + b, 0);
    return Math.round(sum / currentPingsArray.length);
}

// --- 6. هندسة السرعة المتقدمة (XHR Chunking System) ---
// هذه الدالة تضمن استمرار الفحص لمدة 10 ثواني بالضبط عبر استدعاء حزم متتالية
function measureSpeedXHR(type) {
    return new Promise((resolve) => {
        let totalProcessedBytes = 0;
        let finalSpeed = 0;
        let startTime = performance.now();
        let isAborted = false;
        let activeXHR = null;

        // إعداد بيانات الرفع (توليد 20 ميجابايت من البيانات الوهمية للحزمة الواحدة)
        const uploadPayload = type === 'upload' ? new Uint8Array(20 * 1024 * 1024) : null;

        // دالة تقوم بفتح اتصال وتحميل/رفع حزمة، وعند الانتهاء تطلب حزمة أخرى
        function startChunk() {
            if (isAborted) return;
            activeXHR = new XMLHttpRequest();
            
            const url = type === 'download' 
                ? "https://speed.cloudflare.com/__down?bytes=50000000" // حزمة تحميل 50 ميجا
                : "https://speed.cloudflare.com/__up";                 // مسار الرفع

            activeXHR.open(type === 'download' ? 'GET' : 'POST', url, true);

            // تتبع التدفق اللحظي للبيانات وحساب السرعة
            const progressHandler = (e) => {
                if (isAborted) return;
                const now = performance.now();
                const durationInSeconds = (now - startTime) / 1000;
                
                // حساب السرعة الإجمالية (الحزم السابقة + ما تم إنجازه من الحزمة الحالية)
                if (durationInSeconds > 0.1 && e.loaded > 0) {
                    finalSpeed = (((totalProcessedBytes + e.loaded) * 8) / durationInSeconds) / 1000000;
                    updateGauge(finalSpeed);
                }
            };

            if (type === 'download') activeXHR.onprogress = progressHandler;
            else activeXHR.upload.onprogress = progressHandler;

            // عند نجاح الحزمة، نضيف حجمها للرصيد ونبدأ حزمة جديدة فوراً
            activeXHR.onload = () => {
                if (!isAborted) {
                    totalProcessedBytes += type === 'download' ? 50000000 : uploadPayload.length;
                    startChunk(); // الاستمرار في ضغط الشبكة (Loop)
                }
            };

            // إرسال الطلب
            if (type === 'upload') {
                activeXHR.setRequestHeader("Content-Type", "application/octet-stream");
                activeXHR.send(uploadPayload);
            } else {
                activeXHR.send();
            }
        }

        // بدء أول حزمة
        startChunk();

        // قاطع الاتصال الصارم (يقطع العملية بالملي ثانية بعد 10 ثواني)
        setTimeout(() => {
            isAborted = true;
            if (activeXHR) activeXHR.abort(); // قطع الاتصال الحالي فوراً
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);
    });
}
