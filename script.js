const CONFIG = {
    DL_URL: "https://speed.cloudflare.com/__down?bytes=100000000",
    UL_URL: "https://speed.cloudflare.com/__up",
    DURATION: 10000,
    THREADS_DL: 16, // رفع الأداء لأقصى درجة
    THREADS_UL: 8
};

const UI = {
    speedNum: document.getElementById('speed-num'),
    maxDl: document.getElementById('max-dl'),
    maxUl: document.getElementById('max-ul'),
    pIdle: document.getElementById('ping-i'),
    pLoaded: document.getElementById('ping-l'),
    grade: document.getElementById('net-grade'),
    status: document.getElementById('status-msg'),
    btn: document.getElementById('run-test'),
    ipBox: document.getElementById('ip-display')
};

// إعداد الرسم البياني المتقدم
const chart = new Chart(document.getElementById('liveChart'), {
    type: 'line',
    data: {
        labels: Array(20).fill(''),
        datasets: [{
            data: Array(20).fill(0),
            borderColor: '#00f2fe',
            borderWidth: 4,
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(0, 242, 254, 0.05)',
            pointRadius: 0
        }]
    },
    options: { maintainAspectRatio: false, scales: { x: { display: false }, y: { display: false } }, plugins: { legend: false } }
});

async function getNetworkInfo() {
    try {
        const res = await fetch('https://1.1.1.1/cdn-cgi/trace');
        const text = await res.text();
        const ip = text.match(/ip=(.*)/)[1];
        const loc = text.match(/loc=(.*)/)[1];
        UI.ipBox.innerText = `IP: ${ip} | الموقع: ${loc}`;
    } catch { UI.ipBox.innerText = "سيرفر Edge متصل"; }
}

async function runTest(mode) {
    const startTime = performance.now();
    let bytes = 0;
    const ctrl = new AbortController();

    const worker = async () => {
        try {
            while (performance.now() - startTime < CONFIG.DURATION) {
                if (mode === 'DL') {
                    const res = await fetch(`${CONFIG.DL_URL}&r=${Math.random()}`, { signal: ctrl.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytes += value.length;
                    }
                } else {
                    const blob = new Blob([new Uint8Array(1024 * 1024)]);
                    await fetch(CONFIG.UL_URL, { method: 'POST', body: blob, signal: ctrl.signal });
                    bytes += blob.size;
                }
            }
        } catch {}
    };

    const updateInterval = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const mbps = ((bytes * 8) / (1024 * 1024)) / elapsed;
        UI.speedNum.innerText = Math.floor(mbps);
        chart.data.datasets[0].data.push(mbps);
        chart.data.datasets[0].data.shift();
        chart.update('none');
    }, 100);

    const threads = mode === 'DL' ? CONFIG.THREADS_DL : CONFIG.THREADS_UL;
    for (let i = 0; i < threads; i++) worker();

    await new Promise(r => setTimeout(r, CONFIG.DURATION));
    ctrl.abort();
    clearInterval(updateInterval);
    return ((bytes * 8) / (1024 * 1024)) / (CONFIG.DURATION / 1000);
}

UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    UI.speedNum.innerText = "0";
    
    // 1. زمن الاستجابة
    UI.status.innerText = "تحليل زمن الاستجابة...";
    const p1 = await (async function p() {
        const s = performance.now();
        await fetch(CONFIG.DL_URL, { mode: 'no-cors', method: 'HEAD' });
        return performance.now() - s;
    })();
    UI.pIdle.innerText = Math.floor(p1);

    // 2. التحميل
    UI.status.innerText = "فحص التحميل (16 مسار توربيني)...";
    const dlFinal = await runTest('DL');
    UI.maxDl.innerText = dlFinal.toFixed(1);
    document.getElementById('dl-progress').style.width = "100%";

    // 3. الرفع
    UI.status.innerText = "فحص الرفع...";
    chart.data.datasets[0].borderColor = '#f093fb';
    const ulFinal = await runTest('UL');
    UI.maxUl.innerText = ulFinal.toFixed(1);
    document.getElementById('ul-progress').style.width = "100%";

    // 4. تقييم الشبكة
    let score = "C";
    if (dlFinal > 100 && p1 < 20) score = "A+";
    else if (dlFinal > 50) score = "B";
    UI.grade.innerText = score;
    UI.status.innerText = "اكتمل التحليل!";
    UI.btn.disabled = false;
};

getNetworkInfo();
