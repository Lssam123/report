const fill = document.getElementById('progress');
const count = document.getElementById('mbps-count');
const TEST_DURATION = 10000; // 10 ثوانٍ

function updateUI(speed, type) {
    const max = 500; 
    const offset = 565 - (565 * (Math.min(speed, max) / max));
    fill.style.strokeDashoffset = offset;
    count.innerText = Math.floor(speed);
    
    // تأثير "تكبير الحكم" مع السرعة
    count.style.transform = `scale(${1 + (speed / 600)})`;

    if(type === 'dl') document.getElementById('dl-val').innerText = speed;
    if(type === 'ul') document.getElementById('ul-val').innerText = speed;
}

async function runTurboTest() {
    const btn = document.getElementById('test-btn');
    btn.disabled = true;
    
    // 1. فحص البينج (Ping)
    btn.innerText = "جاري قياس الاستجابة...";
    const ping = await measurePing();
    document.getElementById('ping-val').innerText = ping;

    // 2. فحص التحميل (10 ثوانٍ)
    btn.innerText = "جاري فحص التحميل (10s)...";
    await startTimedTest('dl');

    // 3. فحص الرفع (10 ثوانٍ)
    btn.innerText = "جاري فحص الرفع (10s)...";
    await startTimedTest('ul');

    btn.disabled = false;
    btn.innerText = "فحص جديد";
}

async function measurePing() {
    const start = performance.now();
    await fetch("https://www.cloudflare.com/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-cache' });
    return Math.floor(performance.now() - start);
}

async function startTimedTest(type) {
    const startTime = performance.now();
    let totalData = 0;
    const controller = new AbortController();

    // تشغيل المحرك لمدة 10 ثوانٍ فقط
    setTimeout(() => controller.abort(), TEST_DURATION);

    try {
        if (type === 'dl') {
            // تحميل متوازي لضمان أقصى سرعة (Multi-threading)
            const threads = 6;
            const promises = Array(threads).fill(0).map(async () => {
                try {
                    const response = await fetch("https://speed.cloudflare.com/__down?bytes=100000000", { signal: controller.signal });
                    const reader = response.body.getReader();
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        totalData += value.length;
                        const elapsed = (performance.now() - startTime) / 1000;
                        const mbps = ((totalData * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                        updateUI(parseFloat(mbps), 'dl');
                    }
                } catch(e) {}
            });
            await Promise.all(promises);
        } else {
            // اختبار الرفع (Upload)
            const upData = new Uint8Array(10 * 1024 * 1024); // 10MB chunk
            while ((performance.now() - startTime) < TEST_DURATION) {
                await fetch("https://httpbin.org/post", { method: 'POST', body: upData, signal: controller.signal });
                totalData += upData.length;
                const elapsed = (performance.now() - startTime) / 1000;
                const mbps = ((totalData * 8) / (elapsed * 1024 * 1024)).toFixed(1);
                updateUI(parseFloat(mbps), 'ul');
            }
        }
    } catch (e) { /* التجاهل عند انتهاء الوقت (Abort) */ }
}
