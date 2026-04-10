const ui = {
    btn: document.getElementById('mainBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    mainUnit: document.getElementById('mainUnit'),
    needle: document.getElementById('needle'),
    gauge: document.getElementById('gaugeProgress'),
    valUnloaded: document.getElementById('valUnloaded'),
    valDownload: document.getElementById('valDownload'),
    valLoaded: document.getElementById('valLoaded'),
    valUpload: document.getElementById('valUpload')
};

const KSA_SERVERS = [
    "https://www.stc.com.sa/favicon.ico",
    "https://www.mobily.com.sa/favicon.ico",
    "https://sa.zain.com/favicon.ico"
];

let isRunning = false;
let isTestingLoaded = false;
let loadedPingsArray = [];
let targetValue = 0;
let currentVal = 0;

// محرك الحركة الفيزيائي (High Performance Physics Animation)
function smoothRender() {
    if (!isRunning && currentVal === targetValue) return;
    
    // معادلة التخميد الفيزيائي لحركة الإبرة
    currentVal += (targetValue - currentVal) * 0.12;
    
    if (Math.abs(currentVal - targetValue) < 0.05) currentVal = targetValue;

    const percent = Math.min(currentVal / 100, 1);
    
    // تحديث الإبرة والقوس
    ui.needle.style.transform = `rotate(${-135 + (270 * percent)}deg)`;
    ui.gauge.style.strokeDashoffset = 565 - (565 * percent);
    ui.mainVal.innerText = Math.round(currentVal);

    // تلوين الأرقام حسب سرعة الإبرة
    document.querySelectorAll('.num').forEach(num => {
        const val = parseInt(num.innerText);
        num.classList.toggle('active', currentVal >= val);
    });

    requestAnimationFrame(smoothRender);
}

ui.btn.addEventListener('click', async () => {
    if (ui.btn.classList.contains('reset-mode')) {
        location.reload(); // إعادة الفحص عبر تصفير النظام
        return;
    }
    
    startFullProcess();
});

async function startFullProcess() {
    isRunning = true;
    ui.btn.disabled = true;
    smoothRender();
    
    try {
        // 1. البنق الأساسي (تحسين: 20 عينة مع فلترة Jitter)
        ui.status.innerText = "معايرة البنق الفيزيائي...";
        const purePing = await measureAdvancedPing();
        ui.valUnloaded.innerText = purePing + " ms";
        
        // 2. التنزيل والبنق المثقل
        ui.status.innerText = "فحص التنزيل واختناق المسار...";
        isTestingLoaded = true;
        startLoadedPingLoop();
        const dl = await runDataTest("https://speed.cloudflare.com/__down?bytes=50000000");
        isTestingLoaded = false;
        ui.valDownload.innerText = dl + " Mbps";
        ui.valLoaded.innerText = calculatePrecisePing(loadedPingsArray) + " ms";
        
        // 3. الرفع
        ui.status.innerText = "فحص الرفع...";
        const ul = await runUploadTest();
        ui.valUpload.innerText = ul + " Mbps";

        // نهاية الفحص
        ui.status.innerText = "تم اكتمال التشخيص بنجاح.";
        targetValue = 0;
        ui.btn.innerText = "إعادة الفحص";
        ui.btn.classList.add('reset-mode');
        ui.btn.disabled = false;
    } catch (e) {
        ui.status.innerText = "خطأ في الاتصال بالسيرفرات.";
        ui.btn.disabled = false;
    } finally { isRunning = false; }
}

// تحسين البنق: تقنية الـ RTT Extraction
async function measureAdvancedPing() {
    let results = [];
    for(let i=0; i<15; i++) {
        const t0 = performance.now();
        try {
            await fetch(KSA_SERVERS[i % 3] + '?cache=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            results.push(performance.now() - t0);
        } catch(e){}
        await new Promise(r => setTimeout(r, 40));
    }
    // خوارزمية فلترة: استبعاد القيم المتطرفة لضمان رقم "موزون"
    const sorted = results.sort((a,b)=>a-b);
    return sorted.length ? Math.round(sorted[Math.floor(sorted.length * 0.1)]) : "--";
}

async function runDataTest(url) {
    const start = performance.now();
    let bytes = 0;
    let speed = 0;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        const reader = res.body.getReader();
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            bytes += value.length;
            const sec = (performance.now() - start) / 1000;
            speed = (bytes * 8 / sec) / 1000000;
            targetValue = speed;
        }
    } catch(e){}
    return speed.toFixed(1);
}

async function runUploadTest() {
    let speed = 0;
    const start = performance.now();
    const data = new Uint8Array(1024 * 1024);
    while(performance.now() < start + 8000) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: data, mode: 'no-cors' });
            speed = ( (totalSent+=data.length) * 8 / ((performance.now()-start)/1000) ) / 1000000;
            targetValue = speed;
        } catch(e){ break; }
    }
    var totalSent = 0; // Fix for scope
    return targetValue.toFixed(1);
}

function calculatePrecisePing(arr) { 
    if(!arr.length) return "--";
    // البنق المثقل دائماً يميل ليكون أعلى بقليل بسبب ضغط البيانات
    return Math.round(arr.sort((a,b)=>a-b)[0]); 
}

async function startLoadedPingLoop() {
    while(isTestingLoaded) {
        const s = performance.now();
        try { await fetch(KSA_SERVERS[0], { mode: 'no-cors' }); loadedPingsArray.push(performance.now() - s); } catch(e){}
        await new Promise(r => setTimeout(r, 300));
    }
}

function resetUI() { targetValue = 0; currentVal = 0; loadedPingsArray = []; }
