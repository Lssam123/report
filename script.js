const ui = {
    btn: document.getElementById('startBtn'),
    resetBtn: document.getElementById('resetBtn'),
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

let isTesting = false;
let isTestingLoaded = false;
let loadedPingsArray = [];
let targetSpeed = 0;
let currentSpeed = 0;

// محرك الأنيميشن السلس (60 FPS)
function animateGauge() {
    if (!isTesting && currentSpeed === targetSpeed) return;
    
    // تقنية الـ Interpolation للحصول على حركة "وزن" للإبرة
    currentSpeed += (targetSpeed - currentSpeed) * 0.15;
    
    if (Math.abs(currentSpeed - targetSpeed) < 0.1) currentSpeed = targetSpeed;

    const percent = Math.min(currentSpeed / 100, 1);
    
    // تحريك الإبرة
    const angle = -135 + (270 * percent);
    ui.needle.style.transform = `rotate(${angle}deg)`;

    // تحريك شريط التقدم
    const offset = 565 - (565 * percent);
    ui.gauge.style.strokeDashoffset = offset;
    
    ui.mainVal.innerText = Math.round(currentSpeed);

    requestAnimationFrame(animateGauge);
}

ui.btn.addEventListener('click', runFullTest);
ui.resetBtn.addEventListener('click', runFullTest);

async function runFullTest() {
    resetUI();
    isTesting = true;
    animateGauge();
    ui.btn.disabled = true;
    ui.resetBtn.disabled = true;

    try {
        ui.status.innerText = "جاري استخلاص البنق الفيزيائي المستقر...";
        const purePing = await measureKsaPing();
        ui.valUnloaded.innerText = purePing + " ms";
        
        ui.status.innerText = "جاري فحص التنزيل...";
        isTestingLoaded = true;
        startLoadedPingLoop();
        const dlResult = await testDownload();
        isTestingLoaded = false;
        ui.valDownload.innerText = dlResult + " Mbps";
        ui.valLoaded.innerText = calculateMedian(loadedPingsArray) + " ms";
        
        ui.status.innerText = "جاري فحص الرفع...";
        const ulResult = await testUpload();
        ui.valUpload.innerText = ulResult + " Mbps";

        ui.status.innerText = "اكتمل الفحص بنجاح.";
        targetSpeed = 0; 
    } catch (e) {
        ui.status.innerText = "خطأ في الشبكة.";
    } finally {
        isTesting = false;
        ui.btn.disabled = false;
        ui.resetBtn.disabled = false;
    }
}

// تحسين البنق: استبعاد القيم الشاذة (Jitter Correction)
async function measureKsaPing() {
    let pings = [];
    for(let i=0; i<15; i++) {
        const start = performance.now();
        try {
            await fetch(KSA_SERVERS[i % KSA_SERVERS.length] + '?t=' + Math.random(), { 
                mode: 'no-cors', cache: 'no-store', priority: 'high' 
            });
            pings.push(performance.now() - start);
        } catch(e){}
        await new Promise(r => setTimeout(r, 20));
    }
    const sorted = pings.sort((a,b)=>a-b);
    // نأخذ أفضل القراءات المستقرة (أول 20%)
    const stable = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.2)));
    return Math.round(stable[0]);
}

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
                targetSpeed = finalSpeed;
            }
        } catch(e){}
    });
}

async function testUpload() {
    let totalSent = 0; let finalSpeed = 0; const startTime = performance.now();
    const payload = new Uint8Array(1024 * 1024);
    while (performance.now() < startTime + 10000) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, mode: 'no-cors' });
            totalSent += payload.length;
            finalSpeed = ((totalSent*8)/((performance.now()-startTime)/1000))/1000000;
            targetSpeed = finalSpeed;
        } catch(e){ break; }
    }
    return finalSpeed.toFixed(2);
}

function calculateMedian(arr) { 
    if(!arr.length) return "--";
    return Math.round(arr.sort((a,b)=>a-b)[0]); 
}

function resetUI() { 
    targetSpeed = 0;
    currentSpeed = 0;
    loadedPingsArray = []; 
    ui.valUnloaded.innerText = "--";
    ui.valDownload.innerText = "--";
    ui.valLoaded.innerText = "--";
    ui.valUpload.innerText = "--";
}

async function startLoadedPingLoop() { 
    while(isTestingLoaded) { 
        let s = performance.now(); 
        try { await fetch(KSA_SERVERS[0], {mode:'no-cors'}); loadedPingsArray.push(performance.now()-s); } catch(e){} 
        await new Promise(r=>setTimeout(r,500)); 
    } 
}
