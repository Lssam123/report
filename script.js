const fill = document.getElementById('progress');
const count = document.getElementById('mbps-count');

function updateUI(speed, type) {
    const max = 500; // السقف الجديد للعداد
    const offset = 565 - (565 * (Math.min(speed, max) / max));
    fill.style.strokeDashoffset = offset;
    count.innerText = Math.floor(speed);
    
    // تكبير الرقم ديناميكياً مع السرعة
    count.style.transform = `scale(${1 + (speed / 500)})`;

    if(type === 'dl') document.getElementById('dl-val').innerText = speed;
    else document.getElementById('ul-val').innerText = speed;
}

async function runTurboTest() {
    const btn = document.getElementById('test-btn');
    btn.disabled = true;
    btn.innerText = "جاري الفحص الموازي...";

    // تشغيل 6 طلبات متوازية لضمان سحب كامل سرعة النت
    const threads = 6;
    const testURL = "https://speed.cloudflare.com/__down?bytes=50000000"; // 50MB لكل طلب
    
    let totalLoaded = 0;
    const startTime = performance.now();

    const downloadThreads = Array(threads).fill(0).map(async () => {
        const response = await fetch(testURL + "&cache=" + Math.random());
        const reader = response.body.getReader();
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            totalLoaded += value.length;
            
            const duration = (performance.now() - startTime) / 1000;
            const mbps = ((totalLoaded * 8) / (duration * 1024 * 1024)).toFixed(1);
            updateUI(parseFloat(mbps), 'dl');
        }
    });

    await Promise.all(downloadThreads);

    // اختبار الرفع (Upload)
    btn.innerText = "جاري فحص الرفع...";
    const upData = new Uint8Array(20 * 1024 * 1024); // 20MB للرفع
    const upStart = performance.now();
    await fetch("https://httpbin.org/post", { method: 'POST', body: upData });
    const upDuration = (performance.now() - upStart) / 1000;
    const upMbps = ((upData.length * 8) / (upDuration * 1024 * 1024)).toFixed(1);
    
    updateUI(parseFloat(upMbps), 'ul');
    
    btn.disabled = false;
    btn.innerText = "فحص جديد";
}
