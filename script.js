const ui = {
    btn: document.getElementById('mainBtn'),
    status: document.getElementById('statusText'),
    mainVal: document.getElementById('mainValue'),
    needleWrap: document.getElementById('needleWrapper'),
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

// محرك الحركة فائق السلاسة (120fps Optimization)
function smoothRender() {
    if (!isRunning && Math.abs(currentVal - targetValue) < 0.01) return;
    
    // محاكاة الوزن الفيزيائي للإبرة
    currentVal += (targetValue - currentVal) * 0.15;
    
    const percent = Math.min(currentVal / 100, 1);
    
    // محاذاة الإبرة بدقة الصفر مع خط التقدم
    const angle = -135 + (270 * percent);
    ui.needleWrap.style.transform = `rotate(${angle}deg)`;
    ui.gauge.style.strokeDashoffset = 565 - (565 * percent);
    
    ui.mainVal.innerText = Math.round(currentVal);

    // تفعيل توهج الأرقام
    document.querySelectorAll('.gauge-num-text').forEach(num => {
        const val = parseInt(num.textContent);
        num.classList.toggle('active', currentVal >= val);
    });

    requestAnimationFrame(smoothRender);
}

ui.btn.addEventListener('click', () => {
    if (ui.btn.classList.contains('reset')) { location.reload(); return; }
    executeTest();
});

async function executeTest() {
    isRunning = true; ui.btn.disabled = true; smoothRender();
    try {
        ui.status.innerText = "فحص البنق الفيزيائي المستقر...";
        const ping = await measurePing();
        ui.valUnloaded.innerText = ping + " ms";
        
        ui.status.innerText = "فحص التنزيل والبنق المثقل...";
        isTestingLoaded = true;
        startLoadedPingLoop();
        const dl = await testDownload();
        isTestingLoaded = false;
        ui.valDownload.innerText = dl + " Mbps";
        ui.valLoaded.innerText = calculateMedian(loadedPingsArray) + " ms";
        
        ui.status.innerText = "فحص الرفع (محرك أصلي)...";
        const ul = await testUpload();
        ui.valUpload.innerText = ul + " Mbps";

        ui.status.innerText = "اكتمل الفحص.";
        targetValue = 0; ui.btn.innerText = "إعادة الفحص"; ui.btn.classList.add('reset');
    } catch (e) { ui.status.innerText = "خطأ في الاتصال."; }
    finally { ui.btn.disabled = false; isRunning = false; }
}

async function measurePing() {
    let results = [];
    for(let i=0; i<15; i++) {
        const t0 = performance.now();
        try {
            await fetch(KSA_SERVERS[i % 3] + '?v=' + Math.random(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            const rtt = performance.now() - t0;
            if (rtt > 5) results.push(rtt);
        } catch(e){}
        await new Promise(r => setTimeout(r, 30));
    }
    return results.length ? Math.round(results.sort((a,b)=>a-b)[0]) : "--";
}

function testDownload() {
    return new Promise(async (resolve) => {
        const start = performance.now();
        let bytes = 0; let speed = 0;
        const ctrl = new AbortController();
        setTimeout(() => { ctrl.abort(); resolve(speed.toFixed(1)); }, 10000);
        try {
            const res = await fetch("https://speed.cloudflare.com/__down?bytes=50000000", { signal: ctrl.signal });
            const reader = res.body.getReader();
            while(true) {
                const {done, value} = await reader.read();
                if(done) break;
                bytes += value.length;
                speed = (bytes * 8 / ((performance.now()-start)/1000)) / 1000000;
                targetValue = speed;
            }
        } catch(e){}
    });
}

// محرك الرفع الأصلي المستقر
async function testUpload() {
    let totalSent = 0; let speed = 0; const start = performance.now();
    const data = new Uint8Array(1024 * 1024);
    while(performance.now() < start + 10000) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: data, mode: 'no-cors' });
            totalSent += data.length;
            speed = (totalSent * 8 / ((performance.now()-start)/1000)) / 1000000;
            targetValue = speed;
        } catch(e){ break; }
    }
    return speed.toFixed(1);
}

async function startLoadedPingLoop() {
    while(isTestingLoaded) {
        const s = performance.now();
        try { await fetch(KSA_SERVERS[0] + '?p=' + Math.random(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
        const d = performance.now() - s; if(d > 5) loadedPingsArray.push(d); } catch(e){}
        await new Promise(r => setTimeout(r, 350));
    }
}

function calculateMedian(arr) { return arr.length ? Math.round(arr.sort((a,b)=>a-b)[Math.floor(arr.length/2)]) : "--"; }
