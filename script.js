// إعداد العداد البياني
const ctx = document.getElementById('speedGauge').getContext('2d');
let speedChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
        datasets: [{
            data: [0, 100],
            backgroundColor: ['#00f2fe', '#1e293b'],
            borderWidth: 0,
            circumference: 270,
            rotation: 225,
            cutout: '85%'
        }]
    },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
});

async function runTest() {
    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = true;
    startBtn.innerText = "جاري الفحص...";

    try {
        // 1. قياس الـ Ping
        const startPing = Date.now();
        await fetch('https://www.google.com', { mode: 'no-cors' });
        const ping = Date.now() - startPing;
        document.getElementById('ping').innerText = ping;

        // 2. قياس السرعة (تحميل ملف 10MB افتراضي)
        const testFile = "https://cachefly.cachefly.net/10mb.test?r=" + Math.random();
        const startTime = Date.now();
        const response = await fetch(testFile);
        const reader = response.body.getReader();
        let receivedLength = 0;

        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            receivedLength += value.length;
            
            // تحديث الواجهة أثناء التحميل
            const currentTime = (Date.now() - startTime) / 1000;
            const currentMbps = ((receivedLength * 8) / (currentTime * 1024 * 1024)).toFixed(1);
            updateUI(currentMbps);
        }

        const duration = (Date.now() - startTime) / 1000;
        const finalMbps = ((receivedLength * 8) / (duration * 1024 * 1024)).toFixed(1);
        
        document.getElementById('download').innerText = finalMbps;
        startBtn.disabled = false;
        startBtn.innerText = "إعادة الفحص";

    } catch (error) {
        alert("فشل الاختبار. تأكد من اتصالك بالإنترنت.");
        startBtn.disabled = false;
    }
}

function updateUI(speed) {
    document.getElementById('speed-value').innerText = speed;
    speedChart.data.datasets[0].data = [speed, 100 - speed];
    speedChart.update('none'); // تحديث بدون أنيميشن بطيء للسلاسة
}

// جلب الـ IP بشكل بسيط
fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => document.getElementById('ip-display').innerText = "IP: " + data.ip);
