// --- 1. إعداد العداد ---
const canvas = document.getElementById('speedGauge');
const gauge = new Gauge(canvas).setOptions({
    angle: -0.2, lineWidth: 0.15, radiusScale: 1, pointer: { length: 0.55, strokeWidth: 0.035, color: '#e2e8f0' },
    limitMax: false, limitMin: true, colorStart: '#3b82f6', colorStop: '#10b981', strokeColor: '#1e293b', generateGradient: true
});
gauge.maxValue = 100; gauge.setMinValue(0); gauge.animationSpeed = 40; gauge.set(0);

// --- 2. المتغيرات والسيرفرات المخفية ---
const TEST_DURATION_MS = 10000; // 10 ثواني دقيقة
// تم إضافة جميع الشركات المطلوبة
const telecomServers = [
    "https://www.stc.com.sa/", 
    "https://www.mobily.com.sa/", 
    "https://sa.zain.com/", 
    "https://salam.sa/",
    "https://www.go.com.sa/"
];

const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusInfo'),
    main: document.getElementById('mainDisplay'),
    idlePing: document.getElementById('idlePing'),
    dlSpeed: document.getElementById('dlSpeed'),
    dlPing: document.getElementById('dlPing'),
    ulSpeed: document.getElementById('ulSpeed'),
    ulPing: document.getElementById('ulPing')
};

let bestServerUrl = "";

// --- 3. دورة الفحص ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // الخطوة 1: فحص البنق الأولي (محاكاة الألعاب)
        ui.status.innerText = "جاري تهيئة مسارات الألعاب وتحديد أفضل استجابة...";
        const idle = await getSecretBestPing();
        bestServerUrl = idle.url;
        ui.idlePing.innerHTML = `${idle.ping} <span>ms</span>`;
        await sleep(500);

        // الخطوة 2: التحميل مع مزامنة البنق
        ui.status.innerText = "جاري فحص التحميل وتأثير الاختناق (10 ثواني)...";
        const dlResult = await runPhase('download');
        ui.dlSpeed.innerHTML = `${dlResult.speed} <span>Mbps</span>`;
        ui.dlPing.innerHTML = `${dlResult.ping} <span>ms</span>`;
        await sleep(1000);

        // الخطوة 3: الرفع الموازي مع مزامنة البنق
        gauge.set(0); ui.main.innerText = "0.00";
        ui.status.innerText = "جاري فحص الرفع وتأثير الاختناق (10 ثواني)...";
        const ulResult = await runPhase('upload');
        ui.ulSpeed.innerHTML = `${ulResult.speed} <span>Mbps</span>`;
        ui.ulPing.innerHTML = `${ulResult.ping} <span>ms</span>`;

        ui.status.innerText = "تم الفحص بنجاح. بيانات دقيقة جاهزة.";
    } catch (e) {
        ui.status.innerText = "حدث خطأ في تقييم الشبكة.";
        console.error(e);
    } finally {
        ui.btn.disabled = false;
        ui.btn.innerText = "إعادة الفحص المتقدم";
    }
});

// --- 4. العمليات الأساسية ---
const sleep = ms => new Promise(r => setTimeout(r, ms));
function resetUI() {
    gauge.set(0); gauge.maxValue = 100; ui.main.innerText = "0.00";
    const def = `-- <span>--</span>`;
    ui.idlePing.innerHTML=def; ui.dlSpeed.innerHTML=def; ui.dlPing.innerHTML=def; ui.ulSpeed.innerHTML=def; ui.ulPing.innerHTML=def;
}

// العثور على أسرع سيرفر للبنق دون إظهار اسمه
async function getSecretBestPing() {
    let best = { ping: Infinity, url: null };
    for (let url of telecomServers) {
        let p = await pingSingle(url, new AbortController().signal);
        if (p < best.ping) best = { ping: p, url: url };
    }
    return best.ping === Infinity ? { ping: "-", url: null } : best;
}

// طلب بنق واحد
async function pingSingle(url, signal) {
    const start = performance.now();
    try {
        // نطلب ترويسة فقط لتكون سريعة جداً مثل حزم الألعاب
        await fetch(url + '?_t=' + Math.random(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal });
        return Math.round(performance.now() - start);
    } catch (e) { return Infinity; }
}

// حلقة محاكاة بنق الألعاب (تعمل بشكل متزامن تماماً مع مدة الاختبار)
async function runGamingPingLoop(url, array, signal) {
    while (!signal.aborted) {
        let p = await pingSingle(url, signal);
        if (p !== Infinity) array.push(p);
        // تأخير 100ms يحاكي معدل التحديث السريع (Tick Rate) لسيرفرات الألعاب
        if (!signal.aborted) await sleep(100); 
    }
}

function updateGauge(speed) {
    if (speed > gauge.maxValue * 0.9) gauge.maxValue = Math.ceil((speed + 50) / 100) * 100;
    gauge.set(speed);
    ui.main.innerText = speed.toFixed(2);
}

// --- 5. هندسة الفحص المتقدم (التحميل والرفع) ---
async function runPhase(type) {
    return new Promise(async (resolve) => {
        const controller = new AbortController(); // المتحكم المشترك للبنق والسرعة
        const signal = controller.signal;
        
        let loadedPings = [];
        let finalSpeed = 0;
        let processedBytes = 0;
        const startTime = performance.now();

        // 1. بدء حلقة بنق الألعاب المتزامنة
        if (bestServerUrl) runGamingPingLoop(bestServerUrl, loadedPings, signal);

        // 2. إعداد مؤقت لقطع كل العمليات (البنق + الفحص) في نفس اللحظة بالملي ثانية
        setTimeout(() => { controller.abort(); }, TEST_DURATION_MS);

        // مؤقت لتحديث واجهة المستخدم (كل 200 ملي ثانية لعدم إرهاق المتصفح)
        const uiInterval = setInterval(() => {
            const duration = (performance.now() - startTime) / 1000;
            if (duration > 0.2 && processedBytes > 0) {
                finalSpeed = ((processedBytes * 8) / duration) / 1000000;
                updateGauge(finalSpeed);
            }
        }, 200);

        try {
            if (type === 'download') {
                // استخدام Streams للتحميل اللحظي
                const res = await fetch(`https://speed.cloudflare.com/__down?bytes=500000000`, { cache: 'no-store', signal });
                const reader = res.body.getReader();
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    processedBytes += value.length;
                }
            } else {
                // الخدعة الاحترافية للرفع: إرسال حزم (1MB) متعددة لتفادي حظر السيرفر، مع إبقائها ضمن نفس الـ AbortController
                const chunkSize = 1048576; // 1MB
                const blob = new Blob([new Uint8Array(chunkSize)], {type: 'application/octet-stream'});
                const concurrentWorkers = 4; // 4 مسارات متوازية لضغط الشبكة
                
                async function uploadWorker() {
                    while (!signal.aborted) {
                        try {
                            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: blob, signal });
                            processedBytes += chunkSize;
                        } catch(e) { /* طبيعي جداً أن تظهر رسالة AbortError هنا عند انتهاء الوقت */ }
                    }
                }
                
                let workers = [];
                for(let i=0; i<concurrentWorkers; i++) workers.push(uploadWorker());
                await Promise.allSettled(workers);
            }
        } catch (err) {
            // تجاهل خطأ التوقف المتعمد
        }

        // 3. إنهاء الفحص والمزامنة
        clearInterval(uiInterval);
        const avgPing = loadedPings.length ? Math.round(loadedPings.reduce((a,b)=>a+b)/loadedPings.length) : "--";
        resolve({ speed: finalSpeed.toFixed(2), ping: avgPing });
    });
}
