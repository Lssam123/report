// --- 1. ربط الواجهة ---
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

// 🔥 سيرفر البنق الجديد الجاهز
const WS_SERVER = const WS_SERVER = "wss://ping-network-server.com/echo";


let isTestingLoaded = false;
let loadedPingsArray = [];

// --- 2. دورة التشغيل ---
ui.btn.addEventListener('click', async () => {
    resetUI();
    ui.btn.disabled = true;

    try {
        // البنق الأساسي
        setActiveBox('unloaded');
        ui.mainVal.innerText = "---";
        ui.mainUnit.innerText = "PING";
        ui.status.innerText = "جاري قياس البنق...";
        ui.btn.innerText = "جاري الفحص...";

        const purePing = await measureLocalPing();
        ui.valUnloaded.innerHTML = `${purePing} <span>ms</span>`;
        await sleep(500);

        // التنزيل + البنق المثقل
        setActiveBox('download');
        ui.boxes.loaded.classList.add('active');
        ui.mainVal.innerText = "0.00";
        ui.mainUnit.innerText = "MBPS";
        ui.status.innerText = "جاري قياس التنزيل...";

        isTestingLoaded = true;
        loadedPingsArray = [];
        startLoadedPingLoop();

        const dlResult = await testDownload();

        isTestingLoaded = false;
        ui.valDownload.innerHTML = `${dlResult} <span>Mbps</span>`;
        ui.valLoaded.innerHTML = `${calculateMedian(loadedPingsArray)} <span>ms</span>`;
        ui.boxes.loaded.classList.remove('active');
        await sleep(1000);

        // الرفع
        setActiveBox('upload');
        ui.mainVal.innerText = "0.00";
        ui.status.innerText = "جاري قياس الرفع...";

        const ulResult = await testUpload();
        ui.valUpload.innerHTML = `${ulResult} <span>Mbps</span>`;

        // النهاية
        setActiveBox(null);
        ui.status.innerText = "اكتمل الفحص بنجاح.";
        ui.mainVal.innerText = "انتهى";
        ui.mainUnit.innerText = "DONE";
        ui.mainVal.style.color = "var(--success)";
        ui.btn.innerText = "إعادة الفحص";

    } catch (err) {
        ui.status.innerText = "حدث خطأ أثناء الفحص.";
        ui.btn.innerText = "إعادة المحاولة";
    } finally {
        ui.btn.disabled = false;
        isTestingLoaded = false;
    }
});

// --- 3. دوال مساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resetUI() {
    ui.mainVal.innerText = "0.00";
    ui.mainVal.style.color = "var(--text-dark)";
    ui.mainUnit.innerText = "MBPS";
    const def = `-- <span>--</span>`;
    ui.valUnloaded.innerHTML = def;
    ui.valDownload.innerHTML = def;
    ui.valLoaded.innerHTML = def;
    ui.valUpload.innerHTML = def;
    setActiveBox(null);
}

function setActiveBox(boxName) {
    Object.values(ui.boxes).forEach(box => box.classList.remove('active'));
    if (boxName && ui.boxes[boxName]) ui.boxes[boxName].classList.add('active');
}

function calculateMedian(arr) {
    if (arr.length === 0) return "--";
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function updateMainValue(speed) {
    ui.mainVal.innerText = speed.toFixed(2);
}

// --- 4. 🔥 محرك البنق الجديد (WebSocket Echo) ---
async function measureLocalPing() {
    return new Promise((resolve) => {
        const ws = new WebSocket(WS_SERVER);
        let samples = [];

        ws.onopen = () => {
            let count = 0;

            const sendPing = () => {
                const start = performance.now();
                ws.send("ping");

                ws.onmessage = () => {
                    const rtt = performance.now() - start;
                    samples.push(rtt);

                    count++;
                    if (count < 10) {
                        sendPing();
                    } else {
                        ws.close();
                        resolve(Math.round(calculateMedian(samples)));
                    }
                };
            };

            sendPing();
        };

        ws.onerror = () => resolve("--");
    });
}

// البنق المثقل
async function startLoadedPingLoop() {
    const ws = new WebSocket(WS_SERVER);

    ws.onopen = () => {
        const loop = () => {
            if (!isTestingLoaded) {
                ws.close();
                return;
            }

            const start = performance.now();
            ws.send("load");

            ws.onmessage = () => {
                const rtt = Math.round(performance.now() - start);
                loadedPingsArray.push(rtt);
                setTimeout(loop, 300);
            };
        };

        loop();
    };
}

// --- 5. التنزيل (بدون تغيير) ---
function testDownload() {
    return new Promise(async (resolve) => {
        const controller = new AbortController();
        const url = "https://speed.cloudflare.com/__down?bytes=150000000";
        let totalBytes = 0;
        let finalSpeed = 0;
        const startTime = performance.now();

        const timeout = setTimeout(() => {
            controller.abort();
            resolve(finalSpeed.toFixed(2));
        }, TEST_DURATION);

        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.length;
                const duration = (performance.now() - startTime) / 1000;
                if (duration > 0.2) {
                    finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                    updateMainValue(finalSpeed);
                }
            }
        } catch (e) {}
        clearTimeout(timeout);
        resolve(finalSpeed.toFixed(2));
    });
}

// --- 6. الرفع (بدون تغيير) ---
async function testUpload() {
    let finalSpeed = 0;
    let totalSent = 0;
    const startTime = performance.now();
    const endTime = startTime + TEST_DURATION;
    
    const payload = new Uint8Array(2 * 1024 * 1024);

    while (performance.now() < endTime) {
        try {
            await fetch('https://speed.cloudflare.com/__up', {
                method: 'POST',
                body: payload,
                cache: 'no-store'
            });
            
            totalSent += payload.length;
            const duration = (performance.now() - startTime) / 1000;
            finalSpeed = ((totalSent * 8) / duration) / 1000000;
            updateMainValue(finalSpeed);
            
        } catch (e) {
            if (totalSent === 0) return "Error";
            break;
        }
    }
    
    return finalSpeed > 0 ? finalSpeed.toFixed(2) : "0.00";
}
