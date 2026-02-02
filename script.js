const CONFIG = {
    DL_URL: "https://speed.cloudflare.com/__down?bytes=100000000",
    UL_URL: "https://speed.cloudflare.com/__up",
    PING_URL: "https://1.1.1.1/cdn-cgi/trace",
    DURATION: 8000, // 8 ثواني لكل فحص
    DL_THREADS: 8,
    UL_THREADS: 4
};

const UI = {
    startBtn: document.getElementById('start-btn'),
    status: document.getElementById('status-bar'),
    progress: document.getElementById('progress-bar'),
    dlText: document.getElementById('download-speed'),
    ulText: document.getElementById('upload-speed'),
    pIdle: document.getElementById('ping-idle'),
    pLoaded: document.getElementById('ping-loaded'),
    gauge: document.getElementById('gauge-fill'),
    gaugeVal: document.getElementById('gauge-text')
};

async function getLatency() {
    const start = performance.now();
    try {
        await fetch(CONFIG.PING_URL, { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

function updateGauge(mbps) {
    const max = 100; // سقف العداد افتراضياً
    const rotation = Math.min(mbps / max, 1) / 2;
    UI.gauge.style.transform = `rotate(${rotation}turn)`;
    UI.gaugeVal.innerText = Math.floor(mbps);
}

// --- محرك التحميل ---
async function testDownload() {
    let totalBytes = 0;
    const startTime = performance.now();
    const ctrl = new AbortController();
    let pings = [];

    const downloadWorker = async () => {
        try {
            const res = await fetch(CONFIG.DL_URL + "&r=" + Math.random(), { signal: ctrl.signal });
            const reader = res.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((totalBytes * 8) / (1024 * 1024)) / elapsed;
                UI.dlText.innerText = mbps.toFixed(1);
                updateGauge(mbps);
            }
        } catch {}
    };

    const pingTask = setInterval(async () => {
        const p = await getLatency();
        if (p > 0) { pings.push(p); UI.pLoaded.innerText = Math.floor(p); }
    }, 500);

    for (let i = 0; i < CONFIG.DL_THREADS; i++) downloadWorker();
    
    await new Promise(r => setTimeout(r, CONFIG.DURATION));
    ctrl.abort();
    clearInterval(pingTask);
    return pings;
}

// --- محرك الرفع ---
async function testUpload() {
    let totalBytes = 0;
    const startTime = performance.now();
    const ctrl = new AbortController();
    const data = new Blob([new Uint8Array(1024 * 1024)]); // 1MB chunk

    const uploadWorker = async () => {
        try {
            while (performance.now() - startTime < CONFIG.DURATION) {
                await fetch(CONFIG.UL_URL, {
                    method: 'POST',
                    body: data,
                    signal: ctrl.signal
                });
                totalBytes += data.size;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((totalBytes * 8) / (1024 * 1024)) / elapsed;
                UI.ulText.innerText = mbps.toFixed(1);
                updateGauge(mbps);
            }
        } catch {}
    };

    for (let i = 0; i < CONFIG.UL_THREADS; i++) uploadWorker();
    await new Promise(r => setTimeout(r, CONFIG.DURATION));
    ctrl.abort();
}

UI.startBtn.onclick = async () => {
    UI.startBtn.disabled = true;
    UI.progress.style.width = "0%";
    
    // 1. Idle Ping
    UI.status.innerText = "فحص زمن الاستجابة الخامل...";
    const p1 = await getLatency();
    UI.pIdle.innerText = Math.floor(p1);
    UI.progress.style.width = "15%";

    // 2. Download
    UI.status.innerText = "جاري فحص التحميل (8 مسارات Edge)...";
    await testDownload();
    UI.progress.style.width = "60%";

    // 3. Upload
    UI.status.innerText = "جاري فحص الرفع (4 مسارات Edge)...";
    UI.gauge.style.filter = "hue-rotate(150deg)"; // تغيير لون العداد للرفع
    await testUpload();
    
    UI.progress.style.width = "100%";
    UI.status.innerText = "اكتمل الفحص بنجاح!";
    UI.startBtn.disabled = false;
    UI.gauge.style.filter = "none";
};
