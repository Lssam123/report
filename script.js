const API = {
    DL: "https://speed.cloudflare.com/__down?bytes=100000000",
    UL: "https://speed.cloudflare.com/__up",
    TRACE: "https://1.1.1.1/cdn-cgi/trace"
};

// إعداد الرسم البياني الملون (Gradient Chart)
const ctx = document.getElementById('mainChart').getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 0, 400);
gradient.addColorStop(0, 'rgba(0, 242, 254, 0.4)');
gradient.addColorStop(1, 'rgba(0, 242, 254, 0)');

let chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(30).fill(''),
        datasets: [{
            data: Array(30).fill(0),
            borderColor: '#00f2fe',
            borderWidth: 4,
            fill: true,
            backgroundColor: gradient,
            tension: 0.4,
            pointRadius: 0
        }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: false }, scales: { x: { display: false }, y: { display: false } } }
});

async function getTrace() {
    try {
        const res = await fetch(API.TRACE);
        const data = await res.text();
        document.getElementById('isp-node').innerText = data.match(/colo=(.*)/)[1] + " Node";
        document.getElementById('ip-addr').innerText = data.match(/ip=(.*)/)[1];
    } catch(e) {}
}

async function smartPing() {
    let times = [];
    for(let i=0; i<10; i++) {
        const start = performance.now();
        await fetch(API.TRACE, { mode: 'no-cors', cache: 'no-store' });
        times.push(performance.now() - start);
    }
    times.sort();
    const avg = times.slice(2, 8).reduce((a,b)=>a+b, 0) / 6;
    return { ping: Math.round(avg), jitter: Math.round(times[9] - times[0]) };
}

async function runEngine(mode) {
    const duration = 10000;
    const startTime = performance.now();
    let bytes = 0;
    const ctrl = new AbortController();

    const worker = async () => {
        try {
            while (performance.now() - startTime < duration) {
                if (mode === 'DL') {
                    const res = await fetch(API.DL + "&r=" + Math.random(), { signal: ctrl.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytes += value.length;
                    }
                } else {
                    const blob = new Blob([new Uint8Array(1024 * 512)]);
                    await fetch(API.UL, { method: 'POST', body: blob, signal: ctrl.signal });
                    bytes += blob.size;
                }
            }
        } catch(e) {}
    };

    const update = setInterval(() => {
        const mbps = ((bytes * 8) / (1024 * 1024)) / ((performance.now() - startTime) / 1000);
        document.getElementById('live-mbps').innerText = Math.round(mbps);
        chart.data.datasets[0].data.push(mbps);
        chart.data.datasets[0].data.shift();
        chart.update('none');
    }, 200);

    for(let i=0; i < (mode === 'DL' ? 16 : 8); i++) worker();
    await new Promise(r => setTimeout(r, duration));
    ctrl.abort(); clearInterval(update);
    return ((bytes * 8) / (1024 * 1024)) / (duration / 1000);
}

document.getElementById('start-btn').onclick = async function() {
    this.disabled = true;
    const pb = document.getElementById('progress-bar');
    
    // المرحلة 1: البنق
    pb.style.width = "10%";
    const p = await smartPing();
    document.getElementById('ping-val').innerHTML = `${p.ping} <small>ms</small>`;
    document.getElementById('jitter-val').innerHTML = `${p.jitter} <small>ms</small>`;

    // المرحلة 2: التحميل
    pb.style.width = "50%";
    const dl = await runEngine('DL');
    document.getElementById('dl-val').innerText = dl.toFixed(1);

    // المرحلة 3: الرفع
    pb.style.width = "90%";
    chart.data.datasets[0].borderColor = '#7117ea';
    const ul = await runEngine('UL');
    document.getElementById('ul-val').innerText = ul.toFixed(1);

    // المرحلة 4: التحليل الذكي
    pb.style.width = "100%";
    analyzeUX(dl, p.ping);
    this.disabled = false;
};

function analyzeUX(speed, ping) {
    const game = (ping < 30) ? "ممتاز ✅" : (ping < 80 ? "جيد ⚠️" : "ضعيف ❌");
    const stream = (speed > 25) ? "4K متاح" : "1080p فقط";
    document.getElementById('game-tag').innerHTML = `🎮 الألعاب: <span>${game}</span>`;
    document.getElementById('stream-tag').innerHTML = `📺 البث: <span>${stream}</span>`;
    document.getElementById('work-tag').innerHTML = `💻 العمل: <span>مستقر</span>`;
}

getTrace();
