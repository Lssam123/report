const progressCircle = document.getElementById('gauge-progress');
const speedNum = document.getElementById('speed-num');
const TEST_DURATION = 15000; // 15 ثانية للفحص

function updateGauge(speed) {
    const maxSpeed = 500; 
    const circumference = 534;
    const offset = circumference - (Math.min(speed, maxSpeed) / maxSpeed) * circumference;
    progressCircle.style.strokeDashoffset = offset;
    speedNum.innerText = Math.floor(speed);
}

// تحسين دقة البينج بأخذ متوسط 5 محاولات
async function getHighPrecisionPing() {
    let results = [];
    for(let i=0; i<5; i++) {
        const start = performance.now();
        await fetch("https://www.cloudflare.com/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        results.push(performance.now() - start);
    }
    return Math.floor(results.reduce((a, b) => a + b) / results.length);
}

async function runAdvancedTest() {
    const btn = document.getElementById('test-btn');
    btn.disabled = true;
    
    // 1. فحص البينج بدقة
    btn.innerText = "جاري قياس استجابة الشبكة...";
    const avgPing = await getHighPrecisionPing();
    document.getElementById('ping').innerText = avgPing;

    // 2. فحص التحميل (Download) لـ 15 ثانية
    btn.innerText = "جاري فحص التحميل (15s)...";
    await performTrafficTest('dl');

    // 3. فحص الرفع (Upload) لـ 15 ثانية
    btn.innerText = "جاري فحص الرفع (15s)...";
    await performTrafficTest('ul');

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function performTrafficTest(type) {
    const startTime = performance.now();
    let totalBytes = 0;
    const controller = new AbortController();

    // إيقاف الفحص بعد 15 ثانية بالضبط
    setTimeout(() => controller.abort(), TEST_DURATION);

    try {
        if (type === 'dl') {
            const threads = 6; // تحميل متوازي لرفع الدقة
            const downloadTasks = Array(threads).fill(0).map(async () => {
                try {
                    const response = await fetch("https://speed.cloudflare.com/__down?bytes=200000000", { signal: controller.signal });
                    const reader = response.body.getReader();
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        totalBytes += value.length;
                        const elapsed = (performance.now() - startTime) / 1000;
                        const mbps = ((totalBytes * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                        updateGauge(parseFloat(mbps));
                        document.getElementById('download').innerText = mbps;
                    }
                } catch(e) {}
            });
            await Promise.all(downloadTasks);
        } else {
            // اختبار الرفع (Upload) الدقيق
            const uploadChunk = new Uint8Array(5 * 1024 * 1024); // 5MB chunk
            while ((performance.now() - startTime) < TEST_DURATION) {
                await fetch("https://httpbin.org/post", { 
                    method: 'POST', 
                    body: uploadChunk, 
                    signal: controller.signal,
                    mode: 'cors'
                });
                totalBytes += uploadChunk.length;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((totalBytes * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                updateGauge(parseFloat(mbps));
                document.getElementById('upload').innerText = mbps;
            }
        }
    } catch (e) { /* انتهى الوقت بنجاح */ }
}

// جلب IP المستخدم
fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => document.getElementById('ip-display').innerText = "IP: " + d.ip + " | Server: Global Edge");
