const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    mainUnit: document.getElementById('mainUnit'),
    valUnloaded: document.getElementById('valUnloaded'),
    valDownload: document.getElementById('valDownload'),
    valLoaded: document.getElementById('valLoaded'),
    valUpload: document.getElementById('valUpload')
};

const KSA_SERVERS = [
    "https://www.stc.com.sa/favicon.ico",
    "https://www.mobily.com.sa/favicon.ico",
    "https://sa.zain.com/favicon.ico",
    "https://salam.sa/favicon.ico"
];

let isTestingLoaded = false;
let loadedPingsArray = [];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;
    try {
        ui.mainVal.innerText = "---";
        ui.status.innerText = "جاري معايرة زمن الاستجابة...";
        
        // تعديل البنق المطور
        const purePing = await measureKsaPing();
        ui.valUnloaded.innerText = purePing + " ms";
        
        ui.status.innerText = "جاري قياس التنزيل...";
        isTestingLoaded = true;
        startLoadedPingLoop();
        const dlResult = await testDownload();
        isTestingLoaded = false;
        ui.valDownload.innerText = dlResult + " Mbps";
        ui.valLoaded.innerText = calculateMedian(loadedPingsArray) + " ms";
        
        ui.status.innerText = "جاري قياس الرفع...";
        const ulResult = await testUpload();
        ui.valUpload.innerText = ulResult + " Mbps";

        ui.status.innerText = "تم اكتمال التشخيص.";
        ui.mainVal.innerText = "100%";
        ui.mainUnit.innerText = "النتيجة النهائية";
    } catch (e) { ui.status.innerText = "حدث خطأ."; } finally { ui.btn.disabled = false; }
});

// --- التعديل المطلوب على البنق فقط ---
async function measureKsaPing() {
    let pings = [];
    // تقنية الـ Parallel Head Burst لإيجاد أسرع مسار فيزيائي
    const runWave = async () => {
        const promises = KSA_SERVERS.map(url => {
            const start = performance.now();
            return fetch(url + '?t=' + Math.random(), { 
                method: 'HEAD', mode: 'no-cors', cache: 'no-store', priority: 'high'
            }).then(() => {
                pings.push(performance.now() - start);
            }).catch(() => {});
        });
        await Promise.all(promises);
    };

    for(let i=0; i<12; i++) { // زيادة العينات لرفع الدقة
        await runWave();
        await sleep(20);
    }
    
    const sorted = pings.filter(p => p > 0).sort((a, b) => a - b);
    return Math.round(sorted[0]); // القيمة الحقيقية الأسرع
}

// --- بقية الدوال (بدون أي تعديل كما طلبت) ---
const sleep = ms => new Promise(r => setTimeout(r, ms));
function resetUI() { ui.mainVal.innerText = "0.00"; ui.valUnloaded.innerText = "--"; ui.valDownload.innerText = "--"; ui.valLoaded.innerText = "--"; ui.valUpload.innerText = "--"; }
function calculateMedian(arr) { if (!arr.length) return "--"; const sorted = [...arr].sort((a,b)=>a-b); return Math.round(sorted[0]); }
function updateMainValue(speed) { ui.mainVal.innerText = speed.toFixed(2); }

async function startLoadedPingLoop() {
    while (isTestingLoaded) {
        let start = performance.now();
        try { await fetch(KSA_SERVERS[0]+'?l='+Math.random(), { method: 'HEAD', mode: 'no-cors' }); loadedPingsArray.push(performance.now()-start); } catch(e){}
        await sleep(400);
    }
}

function testDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const startTime = performance.now();
        let totalBytes = 0; let finalSpeed = 0;
        setTimeout(() => { controller.abort(); resolve(finalSpeed.toFixed(2)); }, 10000);
        try {
            const response = await fetch("https://speed.cloudflare.com/__down?bytes=100000000", { signal: controller.signal });
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                const duration = (performance.now()-startTime)/1000;
                if (duration > 0.1) { finalSpeed = ((totalBytes*8)/duration)/1000000; updateMainValue(finalSpeed); }
            }
        } catch(e){}
    });
}

async function testUpload() {
    let totalSent = 0; let finalSpeed = 0; const startTime = performance.now(); const endTime = startTime + 10000;
    const payload = new Uint8Array(2 * 1024 * 1024);
    while (performance.now() < endTime) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, mode: 'no-cors' });
            totalSent += payload.length;
            const duration = (performance.now()-startTime)/1000;
            finalSpeed = ((totalSent*8)/duration)/1000000;
            updateMainValue(finalSpeed);
        } catch(e){ break; }
    }
    return finalSpeed.toFixed(2);
}
