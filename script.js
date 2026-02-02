const URLS = {
    DL: "https://speed.cloudflare.com/__down?bytes=100000000",
    UL: "https://speed.cloudflare.com/__up",
    TRACE: "https://1.1.1.1/cdn-cgi/trace"
};

// إعداد الرسم البياني المطور
const ctx = document.getElementById('speedChart').getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 0, 400);
gradient.addColorStop(0, 'rgba(0, 242, 254, 0.3)');
gradient.addColorStop(1, 'rgba(0, 242, 254, 0)');

let speedChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(30).fill(''),
        datasets: [{
            data: Array(30).fill(0),
            borderColor: '#00f2fe',
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            backgroundColor: gradient,
            pointRadius: 0
        }]
    },
    options: { maintainAspectRatio: false, scales: { x: { display: false }, y: { display: false } }, plugins: { legend: false } }
});

// وظيفة جلب معلومات السيرفر
async function fetchServerInfo() {
    try {
        const res = await fetch(URLS.TRACE);
        const data = await res.text();
        const ip = data.match(/ip=(.*)/)[1];
        const colo = data.match(/colo=(.*)/)[1];
        document.getElementById('ip-address').innerText = ip;
        document.getElementById('node-name').innerText = `نقطة تواجد ${colo}`;
    } catch { 
        document.getElementById('node-name').innerText = "سيرفر Edge تلقائي";
    }
}

// قياس زمن الاستجابة (Ping) بدقة إحصائية
async function measurePing() {
    let samples = [];
    for(let i=0; i<8; i++) {
        const start = performance.now();
        await fetch(URLS.TRACE, { mode: 'no-cors', cache: 'no-store' });
        samples.push(performance.now() - start);
    }
    samples.sort((a,b) => a-b);
    const avgPing = samples.slice(1, 7).reduce((a,b)=>a+b, 0) / 6;
    return { 
        ping: Math.round(avgPing), 
        jitter: Math.round(samples[7] - samples[0]) 
    };
}

// محرك فحص السرعة (التحميل والرفع)
async function networkEngine(type) {
    const duration = 10000; // 10 ثواني لكل فحص
    const start = performance.now();
    let bytesReceived = 0;
    const ctrl = new AbortController();

    const task = async () => {
        try {
            while (performance.now() - start < duration) {
                if (type === 'تحميل') {
                    const res = await fetch(URLS.DL + "&cache=" + Math.random(), { signal: ctrl.signal });
                    const reader = res.body.getReader();
                    while(true) {
                        const { done, value } = await reader.read();
                        if(done) break;
                        bytesReceived += value.length;
                    }
                } else {
                    const blob = new Blob([new Uint8Array(1024 * 512)]);
                    await fetch(URLS.UL, { method: 'POST', body: blob, signal: ctrl.signal });
                    bytesReceived += blob.size;
                }
            }
        } catch(e) {}
    };

    const updater = setInterval(() => {
        const mbps = ((bytesReceived * 8) / (1024 * 1024)) / ((performance.now() - start) / 1000);
        document.getElementById('live-speed').innerText = Math.round(mbps);
        speedChart.data.datasets[0].data.push(mbps);
        speedChart.data.datasets[0].data.shift();
        speedChart.update('none');
    }, 200);

    const threads = type === 'تحميل' ? 12 : 6;
    for(let i=0; i < threads; i++) task();

    await new Promise(r => setTimeout(r, duration));
    ctrl.abort(); clearInterval(updater);
    return ((bytesReceived * 8) / (1024 * 1024)) / (duration / 1000);
}

// منطق التشغيل الرئيسي
document.getElementById('start-test').onclick = async function() {
    this.disabled = true;
    const status = document.getElementById('status-label');
    
    // 1. زمن الاستجابة
    status.innerText = "جاري تحليل زمن الاستجابة (البنق)...";
    const p = await measurePing();
    document.getElementById('ping-val').innerText = p.ping;
    document.getElementById('jitter-val').innerText = p.jitter;

    // 2. التحميل
    status.innerText = "جاري فحص سرعة التحميل عبر 12 مسار بيانات...";
    const dl = await networkEngine('تحميل');
    document.getElementById('dl-val').innerText = dl.toFixed(1);

    // 3. الرفع
    status.innerText = "جاري فحص سرعة الرفع...";
    speedChart.data.datasets[0].borderColor = '#f093fb';
    const ul = await networkEngine('رفع');
    document.getElementById('ul-val').innerText = ul.toFixed(1);

    // 4. تقييم كفاءة الخدمة (QoS)
    status.innerText = "اكتمل الفحص بنجاح!";
    generateReport(dl, p.ping);
    this.disabled = false;
    this.innerText = "إعادة الفحص";
};

function generateReport(speed, ping) {
    const game = ping < 40 ? "مثالي ✅" : "متوسط ⚠️";
    const video = speed > 50 ? "يدعم 4K ✅" : "يدعم 1080p فقط ⚠️";
    const meet = speed > 10 ? "مستقر ✅" : "ضعيف ❌";
    
    document.getElementById('game-check').innerHTML = `🎮 ألعاب الأونلاين: <span>${game}</span>`;
    document.getElementById('video-check').innerHTML = `📺 البث المباشر (4K): <span>${video}</span>`;
    document.getElementById('meeting-check').innerHTML = `📹 الاجتماعات المرئية: <span>${meet}</span>`;
}

fetchServerInfo();
