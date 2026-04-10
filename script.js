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

let isTestingLoaded = false;
let loadedPingsArray = [];

function updateGaugeDisplay(val) {
    const maxVal = 100;
    const speed = Math.min(val, maxVal);
    const percent = speed / maxVal;

    // تحريك الإبرة (270 درجة مجموع القوس)
    const angle = -135 + (270 * percent);
    ui.needle.style.transform = `rotate(${angle}deg)`;

    // تحريك شريط التقدم (المحيط = 2 * pi * 90 = 565 تقريباً)
    const offset = 565 - (565 * percent);
    ui.gauge.style.strokeDashoffset = offset;
}

ui.btn.addEventListener('click', startTest);
ui.resetBtn.addEventListener('click', startTest);

async function startTest() {
    resetUI();
    ui.btn.disabled = true;
    ui.resetBtn.disabled = true;
    
    try {
        ui.status.innerText = "جاري استخلاص البنق الفيزيائي...";
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

        ui.status.innerText = "اكتمل الفحص.";
    } catch (e) { 
        ui.status.innerText = "حدث خطأ. تحقق من الاتصال.";
    } finally { 
        ui.btn.disabled = false; 
        ui.resetBtn.disabled = false; 
    }
}

async function measureKsaPing() {
    let pings = [];
    // محرك البنق الجديد: طلبات GET صغيرة جداً لضمان العمل في جميع المتصفحات
    for(let i=0; i<10; i++) {
        const start = performance.now();
        try {
            await fetch(KSA_SERVERS[i % KSA_SERVERS.length] + '?t=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
            pings.push(performance.now() - start);
        } catch(e){}
        await new Promise(r => setTimeout(r, 50));
    }
    const sorted = pings.sort((a,b)=>a-b);
    return sorted.length ? Math.round(sorted[0]) : "--";
}

// محركات التنزيل والرفع (بدون تعديل كما طلبت)
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
                finalSpeed = ((totalBytes*8)/duration)/1000000;
                ui.mainVal.innerText = Math.round(finalSpeed);
                updateGaugeDisplay(finalSpeed);
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
            ui.mainVal.innerText = Math.round(finalSpeed);
            updateGaugeDisplay(finalSpeed);
        } catch(e){ break; }
    }
    return finalSpeed.toFixed(2);
}

function calculateMedian(arr) { return arr.length ? Math.round(arr.sort((a,b)=>a-b)[0]) : "--"; }
function resetUI() { ui.mainVal.innerText = "0"; updateGaugeDisplay(0); loadedPingsArray = []; }
async function startLoadedPingLoop() { while(isTestingLoaded) { let s = performance.now(); try { await fetch(KSA_SERVERS[0], {mode:'no-cors'}); loadedPingsArray.push(performance.now()-s); } catch(e){} await new Promise(r=>setTimeout(r,500)); } }
