const CONFIG = {
    DL_URL: "https://speed.cloudflare.com/__down?bytes=200000000",
    UL_URL: "https://speed.cloudflare.com/__up",
    PING_URL: "https://1.1.1.1/cdn-cgi/trace",
    THREADS: 32, // أقصى طاقة مسارات
    DURATION: 10000, // 10 ثواني لكل فحص
    WARM_UP: 2000 // أول ثانيتين لا يتم حسابهما لضمان الدقة
};

const UI = {
    live: document.getElementById('live-mbps'),
    dl: document.getElementById('res-dl'),
    ul: document.getElementById('res-ul'),
    pIdle: document.getElementById('res-ping-idle'),
    pLoaded: document.getElementById('res-ping-loaded'),
    status: document.getElementById('status'),
    btn: document.getElementById('start-btn')
};

// فحص البنق بدقة متناهية (متوسط 20 عينة مع تصفية الشوائب)
async function getPrecisePing() {
    let samples = [];
    for (let i = 0; i < 20; i++) {
        const start = performance.now();
        try {
            await fetch(`${CONFIG.PING_URL}?n=${crypto.randomUUID()}`, { mode: 'no-cors', cache: 'no-store' });
            samples.push(performance.now() - start);
        } catch (e) {}
    }
    samples.sort((a, b) => a - b);
    const trimmed = samples.slice(4, 16); // حذف الأطراف لضمان الدقة
    return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

async function runSuperEngine(mode) {
    const startTime = performance.now();
    let bytesCaptured = 0;
    let calculationStart = 0;
    let isReady = false;
    let pingsDuringLoad = [];
    const controller = new AbortController();

    // فحص البنق أثناء الضغط (كل 200 ملي ثانية)
    const pingPulse = setInterval(async () => {
        if (!isReady) return;
        const p = await getPrecisePing();
        pingsDuringLoad.push(p);
        UI.pLoaded.innerText = p;
    }, 200);

    const worker = async () => {
        try {
            while (performance.now() - startTime < CONFIG.DURATION) {
                if (mode === 'DL') {
                    const res = await fetch(`${CONFIG.DL_URL}&r=${Math.random()}`, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (!isReady && (performance.now() - startTime > CONFIG.WARM_UP)) {
                            isReady = true; calculationStart = performance.now(); bytesCaptured = 0;
                        }
                        bytesCaptured += value.length;
                        updateUI(bytesCaptured, calculationStart);
                    }
                } else {
                    const chunk = new Uint8Array(2 * 1024 * 1024); // 2MB
                    await fetch(CONFIG.UL_URL, { method: 'POST', body: chunk, signal: controller.signal });
                    if (!isReady && (performance.now() - startTime > CONFIG.WARM_UP)) {
                        isReady = true; calculationStart = performance.now(); bytesCaptured = 0;
                    }
                    bytesCaptured += chunk.byteLength;
                    updateUI(bytesCaptured, calculationStart);
                }
            }
        } catch (e) {}
    };

    function updateUI(bytes, start) {
        if (!isReady) return;
        const elapsed = (performance.now() - start) / 1000;
        const mbps = ((bytes * 8) / (1024 * 1024)) / elapsed;
        UI.live.innerText = mbps.toFixed(2);
    }

    // إطلاق 32 مساراً متوازياً
    for (let i = 0; i < CONFIG.THREADS; i++) worker();

    await new Promise(r => setTimeout(r, CONFIG.DURATION));
    controller.abort();
    clearInterval(pingPulse);

    return ((bytesCaptured * 8) / (1024 * 1024)) / ((performance.now() - calculationStart) / 1000);
}

UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    
    UI.status.innerText = "جاري قياس البنق غير المثقل...";
    UI.pIdle.innerText = await getPrecisePing();

    UI.status.innerText = "فحص التحميل (32 مسار) + البنق المثقل...";
    const dl = await runSuperEngine('DL');
    UI.dl.innerText = dl.toFixed(2);

    UI.status.innerText = "فحص الرفع (32 مسار)...";
    UI.pLoaded.innerText = "0";
    const ul = await runSuperEngine('UL');
    UI.ul.innerText = ul.toFixed(2);

    UI.status.innerText = "اكتمل الفحص الخارق بنجاح";
    UI.btn.disabled = false;
};
