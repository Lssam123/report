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

function smoothRender() {
    if (!isRunning && currentVal === targetValue) return;
    currentVal += (targetValue - currentVal) * 0.15;
    if (Math.abs(currentVal - targetValue) < 0.05) currentVal = targetValue;
    const percent = Math.min(currentVal / 100, 1);
    ui.needle.style.transform = `rotate(${-135 + (270 * percent)}deg)`;
    ui.gauge.style.strokeDashoffset = 565 - (565 * percent);
    ui.mainVal.innerText = Math.round(currentVal);
    document.querySelectorAll('.num').forEach(num => {
        num.classList.toggle('active', currentVal >= parseInt(num.innerText));
    });
    requestAnimationFrame(smoothRender);
}

ui.btn.addEventListener('click', () => {
    if (ui.btn.classList.contains('reset-mode')) { location.reload(); return; }
    startFullProcess();
});

async function startFullProcess() {
    isRunning = true; ui.btn.disabled = true; smoothRender();
    try {
        ui.status.innerText = "قياس البنق الفيزيائي...";
        const purePing = await measureKsaPing();
        ui.valUnloaded.innerText = purePing + " ms";
        
        ui.status.innerText = "فحص التنزيل والبنق المثقل...";
        isTestingLoaded = true;
        startLoadedPingLoop();
        const dl = await testDownload();
        isTestingLoaded = false;
        ui.valDownload.innerText = dl + " Mbps";
        ui.valLoaded.innerText = calculateMedian(loadedPingsArray) + " ms";
        
        ui.status.innerText = "فحص الرفع...";
        const ul = await testUpload();
        ui.valUpload.innerText = ul + " Mbps";

        ui.status.innerText = "اكتمل الفحص.";
        targetValue = 0; ui.btn.innerText = "إعادة الفحص";
        ui.btn.classList.add('reset-mode'); ui.btn.disabled = false;
    } catch (e) { ui.status.innerText = "خطأ في الشبكة."; ui.btn.disabled = false; } finally { isRunning = false; }
}

async function measureKsaPing() {
    let pings = [];
    for(let i=0; i<12; i++) {
        const t0 = performance.now();
        try {
            // استخدام HEAD وتغيير الرابط لإجبار السيرفر على الرد الحقيقي
            await fetch(KSA_SERVERS[i % 3] + '?nocache=' + Math.random(), { 
                method: 'HEAD', mode: 'no-cors', cache: 'no-store' 
            });
            pings.push(performance.now() - t0);
        } catch(e){}
        await new Promise(r => setTimeout(r, 40));
    }
    const sorted = pings.filter(p => p > 5).sort((a,b)=>a-b); // فلترة الأرقام المستحيلة (أقل من 5ms)
    return sorted.length ? Math.round(sorted[0]) : "--";
}

// محرك التنزيل الأصلي
function testDownload() {
    return new Promise(async (resolve) => {
        const startTime = performance.now();
        let totalBytes = 0; let finalSpeed = 0;
        const controller = new AbortController();
        setTimeout(() => { controller.abort(); resolve(finalSpeed.toFixed(2)); }, 10000);
        try {
            const response = await fetch("https://speed.cloudflare.com/__down?bytes=50000000", { signal: controller.signal });
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                const duration = (performance.now()-startTime)/1000;
                finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                targetValue = finalSpeed;
            }
        } catch(e){}
    });
}

// محرك الرفع الأصلي (تم استرجاعه بالكامل)
async function testUpload() {
    let totalSent = 0; let finalSpeed = 0; const startTime = performance.now();
    const payload = new Uint8Array(1024 * 1024);
    while (performance.now() < startTime + 10000) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, mode: 'no-cors' });
            totalSent += payload.length;
            finalSpeed = ((totalSent*8)/((performance.now()-startTime)/1000))/1000000;
            targetValue = finalSpeed;
        } catch(e){ break; }
    }
    return finalSpeed.toFixed(2);
}

async function startLoadedPingLoop() {
    while(isTestingLoaded) {
        const s = performance.now();
        try { 
            await fetch(KSA_SERVERS[0] + '?ping=' + Math.random(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' }); 
            const diff = performance.now() - s;
            if (diff > 5) loadedPingsArray.push(diff);
        } catch(e){}
        await new Promise(r => setTimeout(r, 400));
    }
}

function calculateMedian(arr) { 
    if(!arr.length) return "--";
    const sorted = arr.sort((a,b)=>a-b);
    return Math.round(sorted[Math.floor(sorted.length / 2)]); 
}
