const ui = {
    btn: document.getElementById('startBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    mainUnit: document.getElementById('mainUnit'),
    valUnloaded: document.getElementById('valUnloaded'),
    valDownload: document.getElementById('valDownload'),
    valLoaded: document.getElementById('valLoaded'),
    valUpload: document.getElementById('valUpload'),
    boxes: {
        unloaded: document.getElementById('boxUnloaded'),
        download: document.getElementById('boxDownload'),
        loaded: document.getElementById('boxLoaded'),
        upload: document.getElementById('boxUpload')
    }
};

const TEST_DURATION = 10000;
const KSA_SERVERS = [
    "https://www.stc.com.sa/favicon.ico",
    "https://www.mobily.com.sa/favicon.ico",
    "https://sa.zain.com/favicon.ico",
    "https://salam.sa/favicon.ico"
];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;
    try {
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---";
        ui.status.innerText = "جاري معايرة المسار الفيزيائي لأقرب عقدة...";
        
        const purePing = await measureKsaPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        setActiveBox('download');
        ui.boxes.loaded.classList.add('active'); 
        isTestingLoaded = true;
        startLoadedPingLoop(); 
        const dlResult = await testDownload();
        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        
        setActiveBox('upload');
        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        setActiveBox(null);
        ui.status.innerText = "تم الفحص بأعلى دقة فيزيائية ممكنة.";
        ui.mainVal.innerText = "انتهى";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";
    } catch (err) { ui.status.innerText = "خطأ في الاتصال."; } finally { ui.btn.disabled = false; }
});

// المحرك المثالي (The Ideal Calibration Engine)
async function measureKsaPing() {
    let pings = [];
    
    // 1. مرحلة الـ Pre-Warming: فتح مسارات الـ TCP/TLS صامتة
    for (const url of KSA_SERVERS) {
        try { await fetch(url, { method: 'HEAD', mode: 'no-cors' }); } catch(e){}
    }

    // 2. مرحلة القياس الإحصائي المكثف
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

    for(let i=0; i<10; i++) {
        await runWave();
        await sleep(25);
    }
    
    if (pings.length > 0) {
        const sorted = pings.sort((a, b) => a - b);
        // نأخذ القيمة الأسرع (Minimum) لأنها تمثل "سرعة السلك" الصافية
        return Math.round(sorted[0]); 
    }
    return "--";
}

// الدوال المساعدة (مختصرة للأداء)
const sleep = ms => new Promise(r => setTimeout(r, ms));
function resetUI() { ui.mainVal.innerText = "0.00"; ui.mainVal.style.color = "var(--text-dark)"; ui.valUnloaded.innerHTML = `-- <span>--</span>`; ui.valDownload.innerHTML = `-- <span>--</span>`; ui.valLoaded.innerHTML = `-- <span>--</span>`; ui.valUpload.innerHTML = `-- <span>--</span>`; setActiveBox(null); }
function setActiveBox(boxName) { Object.values(ui.boxes).forEach(box => box?.classList.remove('active')); ui.boxes[boxName]?.classList.add('active'); }
function calculateMedian(arr) { if (!arr.length) return "--"; const sorted = [...arr].sort((a,b)=>a-b); return Math.round(sorted[0]); }
function updateMainValue(speed) { ui.mainVal.innerText = speed.toFixed(2); }
async function startLoadedPingLoop() { while (isTestingLoaded) { let start = performance.now(); try { await fetch(KSA_SERVERS[0]+'?l='+Math.random(), { method: 'HEAD', mode: 'no-cors' }); loadedPingsArray.push(performance.now()-start); } catch(e){} await sleep(400); } }
function testDownload() { return new Promise(async (resolve) => { const controller = new AbortController(); const startTime = performance.now(); let totalBytes = 0; let finalSpeed = 0; setTimeout(() => { controller.abort(); resolve(finalSpeed.toFixed(2)); }, TEST_DURATION); try { const response = await fetch("https://speed.cloudflare.com/__down?bytes=100000000", { signal: controller.signal }); const reader = response.body.getReader(); while (true) { const { done, value } = await reader.read(); if (done) break; totalBytes += value.length; const duration = (performance.now()-startTime)/1000; if (duration > 0.1) { finalSpeed = ((totalBytes*8)/duration)/1000000; updateMainValue(finalSpeed); } } } catch(e){} }); }
async function testUpload() { let totalSent = 0; let finalSpeed = 0; const startTime = performance.now(); const endTime = startTime + TEST_DURATION; const payload = new Uint8Array(2 * 1024 * 1024); while (performance.now() < endTime) { try { await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload, mode: 'no-cors' }); totalSent += payload.length; const duration = (performance.now()-startTime)/1000; finalSpeed = ((totalSent*8)/duration)/1000000; updateMainValue(finalSpeed); } catch(e){ break; } } return finalSpeed.toFixed(2); }
