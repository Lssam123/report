const UI = {
    mbps: document.getElementById('current-mbps'),
    dlMax: document.getElementById('dl-max'),
    ulMax: document.getElementById('ul-max'),
    status: document.getElementById('status'),
    btn: document.getElementById('start-btn'),
    pIdle: document.getElementById('p-idle'),
    pLoaded: document.getElementById('p-loaded')
};

// إعداد الرسم البياني
const ctx = document.getElementById('speedChart').getContext('2d');
let speedData = new Array(30).fill(0);
const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: speedData.map((_, i) => i),
        datasets: [{
            data: speedData,
            borderColor: '#4facfe',
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 0,
            fill: true,
            backgroundColor: 'rgba(79, 172, 254, 0.1)'
        }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false }, x: { display: false } }, plugins: { legend: { display: false } } }
});

async function measurePing() {
    const start = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - start;
    } catch { return 0; }
}

async function runSpeedTest(type = 'download') {
    const duration = 10000; // 10 ثواني
    const startTime = performance.now();
    let bytesTotal = 0;
    let maxSpeed = 0;
    const ctrl = new AbortController();

    const worker = async () => {
        try {
            while (performance.now() - startTime < duration) {
                if (type === 'download') {
                    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=50000000&r=${Math.random()}`, { signal: ctrl.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytesTotal += value.length;
                    }
                } else {
                    const data = new Blob([new Uint8Array(1024 * 1024 * 2)]);
                    await fetch("https://speed.cloudflare.com/__up", { method: 'POST', body: data, signal: ctrl.signal });
                    bytesTotal += data.size;
                }
            }
        } catch {}
    };

    // تحديث الرسم البياني والواجهة
    const tracker = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const mbps = ((bytesTotal * 8) / (1024 * 1024)) / elapsed;
        
        UI.mbps.innerText = mbps.toFixed(1);
        if (mbps > maxSpeed) maxSpeed = mbps;

        speedData.push(mbps);
        speedData.shift();
        chart.update('none');
    }, 200);

    const threads = type === 'download' ? 12 : 6;
    for (let i = 0; i < threads; i++) worker();

    await new Promise(r => setTimeout(r, duration));
    ctrl.abort();
    clearInterval(tracker);
    return maxSpeed;
}

UI.btn.onclick = async () => {
    UI.btn.disabled = true;
    UI.status.innerText = "جاري فحص البنق الخامل...";
    
    const p1 = await measurePing();
    UI.pIdle.innerText = Math.floor(p1);

    UI.status.innerText = "فحص التحميل التوربيني (12 مسار)...";
    chart.data.datasets[0].borderColor = '#4facfe';
    const maxDl = await runSpeedTest('download');
    UI.dlMax.innerText = maxDl.toFixed(1);

    UI.status.innerText = "فحص الرفع...";
    chart.data.datasets[0].borderColor = '#f093fb';
    const maxUl = await runSpeedTest('upload');
    UI.ulMax.innerText = maxUl.toFixed(1);

    const p2 = await measurePing();
    UI.pLoaded.innerText = Math.floor(p2);
    
    UI.status.innerText = "اكتمل الفحص بنجاح";
    UI.btn.disabled = false;
};
