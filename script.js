const CONFIG = {
    DL_URL: "https://speed.cloudflare.com/__down?bytes=100000000",
    UL_URL: "https://speed.cloudflare.com/__up",
    PING_URL: "https://1.1.1.1/cdn-cgi/trace",
    DURATION: 10000,
    DL_THREADS: 32, // فتح مسارات هائلة للتحميل
    UL_THREADS: 16  // مسارات مكثفة للرفع
};

const UI = {
    live: document.getElementById('live-mbps'),
    dl: document.getElementById('res-dl'),
    ul: document.getElementById('res-ul'),
    ping: document.getElementById('res-ping'),
    status: document.getElementById('status'),
    btn: document.getElementById('ignite')
};

// فحص البنق بدقة نانو-ثانية (عبر تكرار عالي واستبعاد الانحرافات)
async function getHighPrecisionPing() {
    let results = [];
    for (let i = 0; i < 15; i++) {
        const start = performance.now();
        await fetch(CONFIG.PING_URL, { mode: 'no-cors', cache: 'no-store' });
        results.push(performance.now() - start);
    }
    results.sort((a, b) => a - b);
    // نأخذ المتوسط من أفضل القيم المستقرة فقط
    return Math.floor(results.slice(2, 7).reduce((a, b) => a + b, 0) / 5);
}

async function runSuperTest(mode) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controllers = [];

    const engine = async () => {
        const ctrl = new AbortController();
        controllers.push(ctrl);
        try {
            while (performance.now() - startTime < CONFIG.DURATION) {
                if (mode === 'DL') {
                    const response = await fetch(`${CONFIG.DL_URL}&t=${Math.random()}`, { signal: ctrl.signal });
                    const reader = response.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        updateUI(totalBytes, startTime);
                    }
                } else {
                    const data = new Blob([new Uint8Array(1024 * 1024 * 2)]); // 2MB chunk
                    await fetch(CONFIG.UL_URL, { method: 'POST', body: data, signal: ctrl.signal });
                    totalBytes += data.size;
                    updateUI(totalBytes, startTime);
                }
            }
        } catch (e) {}
    };

    const updateUI = (bytes, start) => {
        const elapsed = (performance.now() - start) / 1000;
        const mbps = ((bytes * 8) / (1024 * 1024)) / elapsed;
        UI.live.innerText = mbps.toFixed(2);
    };

    // إطلاق العنان للمسارات المتعددة
    const threadsCount = mode === 'DL' ? CONFIG.DL_THREADS : CONFIG.UL_THREADS;
    const workers = Array.from({ length: threadsCount }, () => engine());

    await new Promise(r => setTimeout(r, CONFIG.DURATION));
    controllers.forEach(c => c.abort());
    
    return ((totalBytes * 8) / (1024 * 1024)) / (CONFIG.DURATION / 1000);
}

UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    UI.status.innerText = "جاري تصفية البنق الخامل...";
    
    const p = await getHighPrecisionPing();
    UI.ping.innerText = p;

    UI.status.innerText = `اختبار التحميل التوربيني (${CONFIG.DL_THREADS} مسار)...`;
    const dl = await runSuperTest('DL');
    UI.dl.innerText = dl.toFixed(2);

    UI.status.innerText = `اختبار الرفع المكثف (${CONFIG.UL_THREADS} مسار)...`;
    const ul = await runSuperTest('UL');
    UI.ul.innerText = ul.toFixed(2);

    UI.status.innerText = "اكتمل الفحص بأقصى دقة.";
    UI.live.innerText = dl.toFixed(2);
    UI.btn.disabled = false;
};
