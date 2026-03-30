// --- تعريف عناصر الواجهة ---
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

const TEST_DURATION = 10000; // 10 ثواني لكل فحص
const GAUGE_DASH = 408; 
let gaugeMaxSpeed = 100;

let isTestingLoaded = false;
let loadedPingsArray = [];

// --- دورة الفحص الرئيسية ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // 1. فحص البنق غير المثقل (المعيار العالمي WebSockets)
        setActiveBox('unloaded');
        ui.btn.innerText = "جاري الفحص...";
        ui.status.innerText = "جاري قياس البنق عبر قنوات WebSockets العالمية...";
        const purePing = await measureGlobalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // 2. فحص التحميل مع البنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        ui.status.innerText = "جاري قياس التحميل والبنق المثقل (10 ثواني)...";
        ui.gaugeLine.style.stroke = "var(--color-dl)";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop(); 
        
        const dlResult = await testDownload();
        
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // 3. فحص الرفع
        resetGauge();
        setActiveBox('upload');
        ui.status.innerText = "جاري قياس الرفع المباشر (10 ثواني)...";
        ui.gaugeLine.style.stroke = "var(--color-ul)";
        
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // إنهاء الفحص
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح. النظام يعكس المعايير الهندسية بدقة.";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        ui.status.innerText = "حدث خطأ في الاتصال. يرجى التأكد من استقرار الشبكة.";
        ui.btn.innerText = "إعادة المحاولة";
        console.error(err);
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- دوال المساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    resetGauge();
    ui.mainVal.style.color = "var(--text-dark)";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def; ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def; ui.valUpload.innerHTML = def;
    setActiveBox(null);
}

function resetGauge() {
    gaugeMaxSpeed = 100;
    ui.mainVal.innerText = "0.00";
    ui.gaugeLine.style.strokeDashoffset = GAUGE_DASH;
}

function updateGauge(speed) {
    if (speed > gaugeMaxSpeed * 0.9) gaugeMaxSpeed = Math.ceil((speed + 50) / 100) * 100;
    ui.mainVal.innerText = speed.toFixed(2);
    let percent = Math.min(speed / gaugeMaxSpeed, 1);
    ui.gaugeLine.style.strokeDashoffset = GAUGE_DASH - (percent * GAUGE_DASH);
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

// --- محرك البنق العالمي (WebSocket Engine) ---
// يعتمد على فتح قناة اتصال حية لضمان حساب زمن الرحلة (RTT) بدون تأخير المتصفح
function measureGlobalPing() {
    return new Promise((resolve) => {
        // نستخدم سيرفر صدى عام ومفتوح المصدر
        const ws = new WebSocket('wss://echo.websocket.events');
        let pings = [];
        let pingCount = 0;
        const maxPings = 5;
        let isResolved = false;

        const finish = (val) => {
            if (!isResolved) {
                isResolved = true;
                if(ws.readyState === WebSocket.OPEN) ws.close();
                resolve(val);
            }
        };

        // عند فتح الاتصال، نبدأ إرسال النبضات
        ws.onopen = () => {
            sendNextPing();
        };

        function sendNextPing() {
            if (pingCount >= maxPings) {
                finish(pings.length > 0 ? Math.round(Math.min(...pings)) : "--");
                return;
            }
            // إرسال الختم الزمني الحالي
            ws.send(performance.now().toString());
        }

        // عند عودة النبضة من السيرفر
        ws.onmessage = (e) => {
            const sentTime = parseFloat(e.data);
            const rtt = performance.now() - sentTime; // حساب الوقت الصافي
            pings.push(rtt);
            pingCount++;
            setTimeout(sendNextPing, 50); // إرسال النبضة التالية بعد 50 ملي ثانية
        };

        ws.onerror = () => finish("--");
        
        // قاطع زمني لضمان عدم تعليق الفحص إذا كان السيرفر محجوباً
        setTimeout(() => finish(pings.length > 0 ? Math.round(Math.min(...pings)) : "--"), 4000);
    });
}

// حلقة البنق المثقل (تستخدم Cloudflare Edge لضمان عدم حظرها بسبب كثرة الطلبات)
async function startLoadedPingLoop() {
    const PING_URL = "https://1.1.1.1/cdn-cgi/trace";
    while (isTestingLoaded) {
        let start = performance.now();
        try {
            await fetch(PING_URL + '?load=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            loadedPingsArray.push(Math.round(performance.now() - start));
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
                    updateGauge(finalSpeed);
                }
            }
        } catch (e) {} 
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- محرك الرفع ---
// إرسال بيانات كتلية صامتة (no-cors) لتجاوز حماية GitHub Pages والمتصفحات
function testUpload() {
    return new Promise((resolve) => {
        let isRunning = true;
        let totalSentBytes = 0;
        let finalSpeed = 0;
        const globalStartTime = performance.now();
        
        const CHUNK_SIZE = 1 * 1024 * 1024; // حزم بحجم 1 ميجابايت
        const chunkData = new Blob([new Uint8Array(CHUNK_SIZE)]);

        // تحديث الواجهة اللحظي
        const uiTimer = setInterval(() => {
            if (!isRunning) return;
            const duration = (performance.now() - globalStartTime) / 1000;
            if (duration > 0.5 && totalSentBytes > 0) {
                finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
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

        // تشغيل 4 مسارات لضمان سحب أقصى سرعة
        for (let i = 0; i < 4; i++) {
            uploadWorker();
        }
    });
}
