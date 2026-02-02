const CONFIG = {
    DL_URL: "https://speed.cloudflare.com/__down?bytes=150000000", // 150MB لضمان ضغط مستمر
    UL_URL: "https://speed.cloudflare.com/__up",
    PING_URL: "https://1.1.1.1/cdn-cgi/trace",
    DURATION: 10000,
    DL_THREADS: 32, // أقصى عدد مسارات لتثقيل الشبكة
    UL_THREADS: 16
};

const UI = {
    live: document.getElementById('live-mbps'),
    dl: document.getElementById('res-dl'),
    ul: document.getElementById('res-ul'),
    pIdle: document.getElementById('res-ping-idle'),
    pLoaded: document.getElementById('res-ping-loaded'),
    status: document.getElementById('status'),
    btn: document.getElementById('ignite')
};

// دالة قياس البنق بدقة متناهية
async function measurePing() {
    let samples = [];
    for (let i = 0; i < 20; i++) {
        const start = performance.now();
        try {
            await fetch(`${CONFIG.PING_URL}?r=${Math.random()}`, { mode: 'no-cors', cache: 'no-store' });
            samples.push(performance.now() - start);
        } catch (e) {}
    }
    // تصفية النتائج: استبعاد أعلى 20% وأقل 20% (Trimmed Mean) لإزالة أي تشويش
    samples.sort((a, b) => a - b);
    const trimmed = samples.slice(Math.floor(samples.length * 0.2), Math.floor(samples.length * 0.8));
    return Math.floor(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

async function runSuperTest(mode) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controllers = [];
    let loadedPings = [];

    // دالة لقياس البنق أثناء التحميل (البنق المثقل)
    const pingSampler = setInterval(async () => {
        if (mode === 'DL') {
            const p = await measurePing();
            loadedPings.push(p);
            UI.pLoaded.innerText = Math.min(...loadedPings); // نعرض أقل قيمة حصلنا عليها أثناء الضغط
        }
    }, 1000);

    const engine = async () => {
        const ctrl = new AbortController();
        controllers.push(ctrl);
        try {
            while (performance.now() - startTime < CONFIG.DURATION) {
                if (mode === 'DL') {
                    const response = await fetch(`${CONFIG.DL_URL}&r=${Math.random()}`, { signal: ctrl.signal });
                    const reader = response.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        updateUI(totalBytes, startTime);
                    }
                } else {
                    const data = new Blob([new Uint8Array(1024 * 1024 * 1)]); // 1MB chunks
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

    const threadsCount = mode === 'DL' ? CONFIG.DL_THREADS : CONFIG.UL_THREADS;
    for (let i = 0; i < threadsCount; i++) engine();

    await new Promise(r => setTimeout(r, CONFIG.DURATION));
    controllers.forEach(c => c.abort());
    clearInterval(pingSampler);
    
    const finalMbps = ((totalBytes * 8) / (1024 * 1024)) / (CONFIG.DURATION / 1000);
    
    if (mode === 'DL' && loadedPings.length > 0) {
        UI.pLoaded.innerText = Math.floor(loadedPings.reduce((a,b)=>a+b, 0) / loadedPings.length);
    }
    
    return finalMbps;
}

UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    UI.pIdle.innerText = "--";
    UI.pLoaded.innerText = "--";
    
    UI.status.innerText = "قياس الاستجابة الصافية (البنق غير المثقل)...";
    const idlePing = await measurePing();
    UI.pIdle.innerText = idlePing;

    UI.status.innerText = "اختبار التحميل والبنق المثقل (32 مسار)...";
    const dl = await runSuperTest('DL');
    UI.dl.innerText = dl.toFixed(2);

    UI.status.innerText = "اختبار الرفع العالي (16 مسار)...";
    const ul = await runSuperTest('UL');
    UI.ul.innerText = ul.toFixed(2);

    UI.status.innerText = "اكتمل الفحص الخارق.";
    UI.live.innerText = dl.toFixed(2);
    UI.btn.disabled = false;
};
