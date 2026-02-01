let chart;
let speedData = [];

// 1. تهيئة الرسم البياني
const ctx = document.getElementById('liveChart').getContext('2d');
chart = new Chart(ctx, {
    type: 'line',
    data: { labels: Array(30).fill(''), datasets: [{ data: [], borderColor: '#00f2fe', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(0, 242, 254, 0.05)', tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { display: false } } }
});

// 2. دالة البنق غير المثقل (دقة عالية)
async function measureIdlePing() {
    let samples = [];
    for(let i=0; i<10; i++) {
        const start = performance.now();
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        samples.push(performance.now() - start);
        await new Promise(r => setTimeout(r, 50));
    }
    return Math.min(...samples);
}

// 3. المحرك الرئيسي
async function runFullSuite() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    speedData = [];

    // المرحلة أ: البنق غير المثقل
    setUI(0, "فحص الاستجابة...", "#fff");
    const ping = await measureIdlePing();
    document.getElementById('ping-val').innerText = ping.toFixed(0);

    // المرحلة ب: التحميل
    const downSpeed = await executeTest('DOWNLOAD', 10000, 'down-val', "#00f2fe");

    // المرحلة ج: الرفع
    await executeTest('UPLOAD', 10000, 'up-val', "#f093fb");

    setUI(0, "تم الفحص", "#00f2fe");
    btn.disabled = false;
    btn.innerText = "إعادة الاختبار";
}

async function executeTest(mode, duration, targetId, color) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    const blob = new Uint8Array(1024 * 1024); // 1MB للرفع
    crypto.getRandomValues(blob);

    const streams = isUp ? 6 : 12;
    const tasks = [];

    for (let i = 0; i < streams; i++) {
        tasks.push((async () => {
            while (performance.now() - startTime < duration) {
                try {
                    const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=25000000&_=${Math.random()}`;
                    if (!isUp) {
                        const res = await fetch(url, { signal: controller.signal });
                        const buf = await res.arrayBuffer();
                        totalBytes += buf.byteLength;
                    } else {
                        await fetch(url, { method: 'POST', body: blob, signal: controller.signal });
                        totalBytes += blob.length;
                    }

                    const elapsed = (performance.now() - startTime) / 1000;
                    if (elapsed > 0.5) {
                        const mbps = (totalBytes * 8 * (isUp ? 1.22 : 1.07)) / elapsed / 1048576;
                        setUI(mbps, isUp ? "جاري الرفع" : "جاري التحميل", color);
                        document.getElementById(targetId).innerText = mbps.toFixed(2);
                        
                        // تحديث الرسم البياني
                        speedData.push(mbps);
                        if(speedData.length > 30) speedData.shift();
                        chart.data.datasets[0].data = speedData;
                        chart.data.datasets[0].borderColor = color;
                        chart.update('none');
                    }
                } catch (e) { if (controller.signal.aborted) break; }
            }
        })());
    }
    await Promise.allSettled(tasks);
}

function setUI(speed, label, color) {
    const offset = 565 - (Math.min(speed, 1000) / 1000) * 565;
    document.getElementById('progress-bar').style.strokeDashoffset = offset;
    document.getElementById('progress-bar').style.stroke = color;
    document.getElementById('main-speed').innerText = speed.toFixed(2);
    document.getElementById('test-label').innerText = label;
}
