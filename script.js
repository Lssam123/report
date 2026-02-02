const CONFIG = {
    ENDPOINTS: {
        DL: "https://speed.cloudflare.com/__down?bytes=100000000",
        UL: "https://speed.cloudflare.com/__up",
        PING: "https://1.1.1.1/cdn-cgi/trace"
    },
    TEST_TIME: 8000,
    THREADS: 20 // أقصى عدد مسارات آمن للمتصفح
};

// إعداد الرسم البياني بدقة 60 إطار في الثانية
const ctx = document.getElementById('ultraChart').getContext('2d');
let chartData = new Array(40).fill(0);
const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: chartData.map((_, i) => i),
        datasets: [{
            data: chartData,
            borderColor: '#00d2ff',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(0, 210, 255, 0.05)',
            pointRadius: 0
        }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { display: false } }, plugins: { legend: false } }
});

// --- خوارزمية البنق عالية الدقة ---
async function precisionPing() {
    const samples = [];
    for(let i=0; i < 10; i++) {
        const start = performance.now();
        try {
            await fetch(CONFIG.ENDPOINTS.PING, { mode: 'no-cors', cache: 'no-store' });
            samples.push(performance.now() - start);
        } catch(e) {}
    }
    // استبعاد أعلى وأقل قيمتين (Outliers) لضمان الدقة الإحصائية
    samples.sort((a,b) => a - b);
    const validSamples = samples.slice(2, -2);
    const avg = validSamples.reduce((a,b) => a+b, 0) / validSamples.length;
    const jitter = samples[samples.length-1] - samples[0];
    return { avg: Math.floor(avg), jitter: Math.floor(jitter) };
}

async function runPrecisionTest(type) {
    const startTime = performance.now();
    let totalBytes = 0;
    const ctrl = new AbortController();

    const worker = async () => {
        try {
            while (performance.now() - startTime < CONFIG.TEST_TIME) {
                if(type === 'DL') {
                    const res = await fetch(CONFIG.ENDPOINTS.DL + "&cache=" + Math.random(), { signal: ctrl.signal });
                    const reader = res.body.getReader();
                    while(true) {
                        const { done, value } = await reader.read();
                        if(done) break;
                        totalBytes += value.length;
                    }
                } else {
                    const data = new Blob([new Uint8Array(1024 * 1024 * 2)]);
                    await fetch(CONFIG.ENDPOINTS.UL, { method: 'POST', body: data, signal: ctrl.signal });
                    totalBytes += data.size;
                }
            }
        } catch(e) {}
    };

    const uiUpdater = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const mbps = ((totalBytes * 8) / (1024 * 1024)) / elapsed;
        document.getElementById('live-speed').innerText = Math.floor(mbps);
        chartData.push(mbps);
        chartData.shift();
        chart.update('none');
    }, 150);

    for(let i=0; i < (type === 'DL' ? CONFIG.THREADS : 8); i++) worker();
    
    await new Promise(r => setTimeout(r, CONFIG.TEST_TIME));
    ctrl.abort();
    clearInterval(uiUpdater);
    return ((totalBytes * 8) / (1024 * 1024)) / (CONFIG.TEST_TIME / 1000);
}

document.getElementById('main-btn').onclick = async function() {
    this.disabled = true;
    const progress = document.getElementById('progress-line');
    
    // 1. فحص البنق والدقة
    progress.style.width = "20%";
    const pResult = await precisionPing();
    document.getElementById('final-ping').innerText = pResult.avg;
    document.getElementById('final-jitter').innerText = pResult.jitter;
    document.getElementById('p-quality').innerText = pResult.avg < 30 ? "ممتاز" : "متوسط";

    // 2. فحص التحميل
    progress.style.width = "50%";
    const dl = await runPrecisionTest('DL');
    document.getElementById('final-dl').innerText = dl.toFixed(2);

    // 3. فحص الرفع
    progress.style.width = "80%";
    chart.data.datasets[0].borderColor = '#f093fb';
    const ul = await runPrecisionTest('UL');
    document.getElementById('final-ul').innerText = ul.toFixed(2);

    // 4. النتائج النهائية
    progress.style.width = "100%";
    document.getElementById('stability').innerText = (dl > 10 ? "مستقر" : "غير مستقر");
    this.disabled = false;
    this.innerText = "إعادة الفحص";
};
