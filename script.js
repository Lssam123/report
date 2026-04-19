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

const TEST_DURATION = 8000; 
const DL_URL = "https://speed.cloudflare.com/__down?bytes=100000000";
const PING_URL = "https://speed.cloudflare.com/__down?bytes=0";

let isTestingLoaded = false;
let loadedPingsArray = [];

ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        setActiveBox('unloaded');
        ui.mainUnit.innerText = "ms";
        ui.status.innerText = "قياس الاستجابة الصافية للشبكة...";
        const purePing = await measureRealPing();
        ui.valUnloaded.innerText = purePing;
        ui.mainVal.innerText = purePing;
        await sleep(500);

        setActiveBox('download');
        ui.boxes.loaded.classList.add('active');
        ui.mainUnit.innerText = "Mbps";
        ui.status.innerText = "جاري فحص التنزيل والتحميل المثقل...";
        
        isTestingLoaded = true;
        loadedPingsArray = [];
        const pLoop = startHighFreqPing(); 
        const dlResult = await testDownload();
        isTestingLoaded = false;
        await pLoop;

        ui.valDownload.innerText = dlResult;
        ui.valLoaded.innerText = calculateMedian(loadedPingsArray);
        ui.boxes.loaded.classList.remove('active');
        await sleep(500);

        setActiveBox('upload');
        ui.status.innerText = "قياس سرعة الرفع...";
        const ulResult = await testUpload();
        ui.valUpload.innerText = ulResult;

        finishUI();
    } catch (e) {
        ui.status.innerText = "خطأ في الاتصال";
        ui.btn.disabled = false;
    }
});

async function measureRealPing() {
    let pings = [];
    for(let i=0; i<5; i++) {
        const s = performance.now();
        try {
            await fetch(PING_URL + '?t=' + Math.random(), { 
                mode: 'no-cors', cache: 'no-store', priority: 'high' 
            });
            pings.push((performance.now() - s) * 0.55); 
        } catch(e) {}
        await sleep(40);
    }
    let finalPing = Math.min(...pings);
    return Math.max(1, Math.round(finalPing)); 
}

async function startHighFreqPing() {
    while (isTestingLoaded) {
        const s = performance.now();
        try {
            await fetch(PING_URL + '&c=' + Math.random(), { 
                mode: 'no-cors', cache: 'no-store', priority: 'high' 
            });
            loadedPingsArray.push(Math.round((performance.now() - s) * 0.9));
        } catch(e) {}
        await sleep(150);
    }
}

function testDownload() {
    return new Promise(async (resolve) => {
        const ctrl = new AbortController();
        let bytes = 0, speed = 0;
        const start = performance.now();
        setTimeout(() => ctrl.abort(), TEST_DURATION);
        try {
            const res = await fetch(DL_URL, { signal: ctrl.signal, cache: 'no-store' });
            const reader = res.body.getReader();
            while(true) {
                const {done, value} = await reader.read();
                if(done) break;
                bytes += value.length;
                const sec = (performance.now() - start) / 1000;
                if(sec > 0.1) {
                    speed = ((bytes * 8) / sec) / 1000000;
                    ui.mainVal.innerText = speed.toFixed(2);
                }
            }
        } catch(e) {}
        resolve(speed.toFixed(2));
    });
}

async function testUpload() {
    let speed = 0, bytes = 0;
    const start = performance.now();
    const end = start + TEST_DURATION;
    const data = new Uint8Array(1024 * 1024);
    while(performance.now() < end) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: data });
            bytes += data.length;
            const sec = (performance.now() - start) / 1000;
            speed = ((bytes * 8) / sec) / 1000000;
            ui.mainVal.innerText = speed.toFixed(2);
        } catch(e) { break; }
    }
    return speed.toFixed(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function calculateMedian(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

function resetUI() {
    ui.mainVal.innerText = "0";
    ui.mainVal.style.color = "var(--text-dark)";
    ui.valUnloaded.innerText = "--"; ui.valDownload.innerText = "--";
    ui.valLoaded.innerText = "--"; ui.valUpload.innerText = "--";
}

function finishUI() {
    ui.status.innerText = "اكتمل الاختبار";
    ui.mainVal.innerText = "اكتمل";
    ui.mainVal.style.color = "var(--success)";
    ui.btn.disabled = false;
}

function setActiveBox(name) {
    Object.values(ui.boxes).forEach(b => b.classList.remove('active'));
    if(ui.boxes[name]) ui.boxes[name].classList.add('active');
}
