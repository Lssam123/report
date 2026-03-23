// --- 1. إعداد العداد الدائري ---
const canvas = document.getElementById('speedGauge');
const gauge = new Gauge(canvas).setOptions({
    angle: -0.2, lineWidth: 0.12, radiusScale: 1, pointer: { length: 0.5, strokeWidth: 0.035, color: '#ffffff' },
    limitMax: false, limitMin: true, colorStart: '#3b82f6', colorStop: '#10b981', strokeColor: '#1e293b', generateGradient: true
});
gauge.maxValue = 100; gauge.setMinValue(0); gauge.animationSpeed = 45; gauge.set(0);

const ui = {
    btn: document.getElementById('startBtn'), status: document.getElementById('statusText'), mainVal: document.getElementById('mainValue'),
    idlePing: document.getElementById('idlePing'), dlSpeed: document.getElementById('dlSpeed'),
    loadedPing: document.getElementById('loadedPing'), ulSpeed: document.getElementById('ulSpeed')
};

// --- 2. إعدادات الفحص الأساسية ---
const TEST_DURATION_MS = 10000; // 10 ثواني بالضبط لكل مرحلة
// رابط فحص البنق (رد فارغ 204 من أقرب نقطة كلاودفلير محلية - الأسرع على الإطلاق)
const EDGE_PING_URL = "https://cp.cloudflare.com/generate_204"; 

let isTestingLoadedPing = false;
let loadedPingsArray = [];

// --- 3. دورة الفحص الشاملة ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // المرحلة 1: قياس البنق الأساسي (بدقة Speedtest)
        ui.status.innerText = "جاري قياس استجابة الشبكة (Latency)...";
        const basePing = await measureAccuratePing();
        ui.idlePing.innerHTML = `${basePing} <span>ms</span>`;
        await sleep(500);

        // المرحلة 2: التحميل والبنق المثقل معاً
        ui.status.innerText = "جاري قياس التحميل والبنق المثقل (10 ثواني)...";
        isTestingLoadedPing = true; loadedPingsArray = [];
        startLoadedPingLoop(); // تشغيل حلقة البنق المثقل
        
        const dlResult = await measureBandwidth('download');
        
        isTestingLoadedPing = false; // إيقاف البنق المثقل فور انتهاء التحميل
        ui.dlSpeed.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.loadedPing.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        await sleep(1000);

        // المرحلة 3: الرفع (بدون بنق مثقل كما طلبت)
        gauge.set(0); ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس الرفع (10 ثواني)...";
        
        const ulResult = await measureBandwidth('upload');
        ui.ulSpeed.innerHTML = `${ulResult} <span>Mbps</span>`;

        ui.status.style.color = "#10b981";
        ui.status.innerText = "تم الفحص بنجاح. النتائج جاهزة للمقارنة.";
    } catch (error) {
        ui.status.style.color = "#ef4444";
        ui.status.innerText = "حدث خطأ غير متوقع. يرجى التحقق من الاتصال.";
        console.error(error);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الاختبار";
        isTestingLoadedPing = false;
    }
});

// --- 4. الدوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    gauge.set(0); gauge.maxValue = 100; ui.mainVal.innerText = "0.00";
    ui.status.style.color = "#3b82f6";
    const def = `-- <span>--</span>`;
    ui.idlePing.innerHTML=def; ui.dlSpeed.innerHTML=def; ui.loadedPing.innerHTML=def; ui.ulSpeed.innerHTML=def;
}

function updateGauge(speed) {
    if (speed > gauge.maxValue * 0.9) gauge.maxValue = Math.ceil((speed + 50) / 100) * 100;
    gauge.set(speed);
    ui.mainVal.innerText = speed.toFixed(2);
}

// دالة لحساب "الوسيط" (Median) بدلاً من المتوسط لضمان استبعاد القراءات الشاذة مثلما يفعل Speedtest
function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// --- 5. هندسة استجابة الشبكة (Ping Engine) ---
// نرسل 6 طلبات متتالية سريعة، نتجاهل الأول (غالباً يكون بطيئاً بسبب الـ DNS) ونأخذ وسيط البقية
async function measureAccuratePing() {
    let pings = [];
    for (let i = 0; i < 6; i++) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?t=' + Math.random(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            if (i > 0) pings.push(Math.round(performance.now() - start)); // تجاهل الطلب الأول
        } catch(e) {}
        await sleep(50);
    }
    return calculateMedian(pings);
}

// حلقة البنق المثقل التي تعمل أثناء التحميل فقط
async function startLoadedPingLoop() {
    while (isTestingLoadedPing) {
        let start = performance.now();
        try {
            await fetch(EDGE_PING_URL + '?t=' + Math.random(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
        } catch(e) {}
        await sleep(150); // قياس كل 150 ملي ثانية
    }
}

// --- 6. هندسة قياس السرعة (Multi-threaded Bandwidth Engine) ---
// هذه الدالة تفتح 4 مسارات (Workers) في نفس الوقت لضمان سحب كامل سرعة الخط تماماً مثل Speedtest
function measureBandwidth(type) {
    return new Promise((resolve) => {
        let totalProcessedBytes = 0;
        let finalSpeed = 0;
        let startTime = performance.now();
        let isAborted = false;
        
        const concurrentConnections = 4; // عدد الاتصالات المتزامنة لضغط الخط
        let activeRequests = [];

        // تحديث العداد اللحظي كل 200 ملي ثانية
        const uiInterval = setInterval(() => {
            if (isAborted) return;
            const durationInSeconds = (performance.now() - startTime) / 1000;
            if (durationInSeconds > 0.2 && totalProcessedBytes > 0) {
                finalSpeed = ((totalProcessedBytes * 8) / durationInSeconds) / 1000000;
                updateGauge(finalSpeed);
            }
        }, 200);

        // دالة إنشاء اتصال واحد (Worker)
        function createWorker() {
            if (isAborted) return;
            const xhr = new XMLHttpRequest();
            activeRequests.push(xhr);
            
            // في التحميل نطلب 25 ميجا، وفي الرفع نرسل 10 ميجا لتجنب إغلاق المتصفح للعملية
            const url = type === 'download' 
                ? "https://speed.cloudflare.com/__down?bytes=25000000" 
                : "https://speed.cloudflare.com/__up";

            xhr.open(type === 'download' ? 'GET' : 'POST', url, true);

            // تتبع البيانات
            let lastLoaded = 0;
            const progressHandler = (e) => {
                if (isAborted) return;
                const chunk = e.loaded - lastLoaded;
                totalProcessedBytes += chunk;
                lastLoaded = e.loaded;
            };

            if (type === 'download') xhr.onprogress = progressHandler;
            else xhr.upload.onprogress = progressHandler;

            // عند انتهاء الحزمة، نفتح واحدة جديدة فوراً (Loop) لإبقاء الخط مشبعاً
            xhr.onload = () => {
                if (!isAborted) createWorker();
            };

            if (type === 'upload') {
                const payload = new Uint8Array(10 * 1024 * 1024); // 10MB
                xhr.setRequestHeader("Content-Type", "application/octet-stream");
                xhr.send(payload);
            } else {
                xhr.send();
            }
        }

        // تشغيل المسارات الـ 4 في نفس الوقت
        for (let i = 0; i < concurrentConnections; i++) {
            createWorker();
        }

        // إيقاف الفحص بدقة بعد 10 ثواني (المدة القياسية لـ Speedtest)
        setTimeout(() => {
            isAborted = true;
            clearInterval(uiInterval);
            // إغلاق جميع الاتصالات النشطة
            activeRequests.forEach(req => req.abort());
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION_MS);
    });
}
