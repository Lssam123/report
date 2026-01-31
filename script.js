const bar = document.getElementById('bar');
const num = document.getElementById('number');
const label = document.getElementById('label');

function update(v, txt) {
    const offset = 565 - (Math.min(v, 900) / 900) * 565;
    bar.style.strokeDashoffset = offset;
    num.innerText = v.toFixed(2);
    label.innerText = txt;
}

// 1. وظيفة البنق المستقلة
async function measurePing() {
    let results = [];
    const endTime = Date.now() + 3000; // 3 ثوانٍ كما طلبت
    while (Date.now() < endTime) {
        const start = performance.now();
        try {
            await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
            results.push(performance.now() - start);
        } catch (e) {}
        await new Promise(r => setTimeout(r, 50));
    }
    return results.length ? Math.min(...results) : 0;
}

// 2. الوظيفة الرئيسية المتسلسلة
async function runMain() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;

    // المرحلة الأولى: البنق (صامت لمدة 3 ثوانٍ)
    update(0, "جاري البدء...");
    const ping = await measurePing();
    document.getElementById('p-val').innerText = ping.toFixed(0);

    // المرحلة الثانية: التحميل
    await startTest('DOWNLOAD', 10000, 'd-val');

    // المرحلة الثالثة: الرفع
    await startTest('UPLOAD', 10000, 'u-val');

    // النهاية
    update(0, "اكتمل");
    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

// 3. محرك القياس (تحميل/رفع)
async function startTest(type, duration, targetId) {
    const isUp = type === 'UPLOAD';
    const startTime = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    
    // إغلاق إجباري بعد انتهاء الوقت
    setTimeout(() => controller.abort(), duration);

    const dummy = new Uint8Array(1024 * 1024); // 1MB
    crypto.getRandomValues(dummy);

    const workers = isUp ? 4 : 8; // تقليل الخيوط للرفع لضمان الثبات
    const tasks = [];

    for (let i = 0; i < workers; i++) {
        tasks.push((async () => {
            while (performance.now() - startTime < duration) {
                try {
                    const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=25000000&_=${Math.random()}`;
                    
                    if (!isUp) {
                        const res = await fetch(url, { signal: controller.signal });
                        const buf = await res.arrayBuffer();
                        bytes += buf.byteLength;
                    } else {
                        await fetch(url, { method: 'POST', body: dummy, signal: controller.signal });
                        bytes += dummy.length;
                    }

                    // حساب السرعة
                    const sec = (performance.now() - startTime) / 1000;
                    if (sec > 0.5) {
                        const mbps = (bytes * 8 * (isUp ? 1.2 : 1.05)) / sec / 1048576;
                        update(mbps, isUp ? "جاري الرفع" : "جاري التحميل");
                        document.getElementById(targetId).innerText = mbps.toFixed(2);
                    }
                } catch (e) { if (controller.signal.aborted) break; }
            }
        })());
    }

    // الانتظار الإجباري لانتهاء كافة المهام قبل العودة للدالة الرئيسية
    await Promise.allSettled(tasks);
}
