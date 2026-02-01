const EDGE_URL = "https://speed.cloudflare.com/__down?bytes=100000000"; // 100MB chunk
const PING_URL = "https://1.1.1.1/cdn-cgi/trace";
const TEST_DURATION = 10000; // 10 ثواني
const THREAD_COUNT = 8; // عدد المسارات المتوازية

const startBtn = document.getElementById('start-btn');
const statusText = document.getElementById('status-bar');
const downloadDisplay = document.getElementById('download-speed');
const pingIdleDisplay = document.getElementById('ping-idle');
const pingLoadedDisplay = document.getElementById('ping-loaded');
const jitterDisplay = document.getElementById('jitter');

async function getLatency() {
    const start = performance.now();
    try {
        await fetch(PING_URL, { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch (e) { return 0; }
}

async function runTest() {
    let totalBytes = 0;
    const startTime = performance.now();
    const controllers = [];
    let loadedPings = [];

    // دالة المسار الواحد
    const worker = async () => {
        const controller = new AbortController();
        controllers.push(controller);
        try {
            const response = await fetch(EDGE_URL + "&t=" + Math.random(), { 
                signal: controller.signal,
                cache: 'no-store' 
            });
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                
                const now = performance.now();
                const elapsed = (now - startTime) / 1000;
                const mbps = ((totalBytes * 8) / (1024 * 1024)) / elapsed;
                downloadDisplay.innerText = mbps.toFixed(1);

                if (now - startTime > TEST_DURATION) break;
            }
        } catch (e) {}
    };

    // تشغيل المسارات
    for (let i = 0; i < THREAD_COUNT; i++) worker();

    // قياس البنق أثناء الضغط
    const pingTask = setInterval(async () => {
        const p = await getLatency();
        if (p > 0) {
            loadedPings.push(p);
            pingLoadedDisplay.innerText = Math.floor(p);
        }
    }, 500);

    // إنهاء الاختبار بعد الوقت المحدد
    await new Promise(r => setTimeout(r, TEST_DURATION));
    controllers.forEach(c => c.abort());
    clearInterval(pingTask);

    return loadedPings;
}

startBtn.onclick = async () => {
    startBtn.disabled = true;
    statusText.innerText = "جاري قياس البنق الخامل...";

    // 1. البنق الخامل
    let idleSamples = [];
    for(let i=0; i<5; i++) idleSamples.push(await getLatency());
    const minIdle = Math.min(...idleSamples.filter(v => v > 0));
    pingIdleDisplay.innerText = Math.floor(minIdle);

    // 2. فحص التحميل والبنق تحت الضغط
    statusText.innerText = "جاري التحميل عبر 8 مسارات Edge...";
    const loadedPings = await runTest();

    // 3. تحليل النتائج
    const avgLoaded = loadedPings.reduce((a,b) => a+b, 0) / loadedPings.length;
    const jitter = Math.abs(avgLoaded - minIdle);
    
    jitterDisplay.innerText = Math.floor(jitter);
    statusText.innerText = "اكتمل الفحص بنجاح.";
    startBtn.disabled = false;
};
