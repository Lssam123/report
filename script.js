const progressCircle = document.getElementById('progress');
const mainSpeedText = document.getElementById('main-speed');

function updateUI(speed, type) {
    // نسبة مئوية بناءً على 500 ميجا
    const percentage = Math.min(speed / 500, 1);
    const offset = 565 - (565 * percentage);
    progressCircle.style.strokeDashoffset = offset;
    mainSpeedText.innerText = Math.floor(speed);
    
    // تكبير الخط ديناميكياً
    mainSpeedText.style.transform = `scale(${1 + (speed/600)})`;
    
    if(type === 'dl') document.getElementById('dl-speed').innerText = speed;
    else document.getElementById('ul-speed').innerText = speed;
}

async function runCompleteTest() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.innerText = "جاري الفحص...";

    // 1. اختبار التحميل (Download) - 50MB
    await startTrafficTest("https://speed.cloudflare.com/__down?bytes=50000000", 'dl');
    
    // 2. اختبار الرفع (Upload) - محاكاة رفع بيانات حقيقية
    await startTrafficTest("https://httpbin.org/post", 'ul', true);

    btn.disabled = false;
    btn.innerText = "إعادة الفحص";
}

async function startTrafficTest(url, type, isUpload = false) {
    const startTime = performance.now();
    let loaded = 0;

    try {
        if (!isUpload) {
            const response = await fetch(url + "&r=" + Math.random());
            const reader = response.body.getReader();
            while(true) {
                const {done, value} = await reader.read();
                if (done) break;
                loaded += value.length;
                const duration = (performance.now() - startTime) / 1000;
                const mbps = ((loaded * 8) / (duration * 1024 * 1024)).toFixed(1);
                updateUI(parseFloat(mbps), type);
            }
        } else {
            // محاكاة الرفع ببيانات حقيقية مولدة برمجياً
            const dummyData = new Uint8Array(10 * 1024 * 1024); // 10MB
            const upStart = performance.now();
            await fetch(url, { method: 'POST', body: dummyData });
            const upDuration = (performance.now() - upStart) / 1000;
            const upMbps = ((dummyData.length * 8) / (upDuration * 1024 * 1024)).toFixed(1);
            updateUI(parseFloat(upMbps), 'ul');
        }
    } catch (e) { console.error("Error during test"); }
}
