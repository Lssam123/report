const progressHex = document.getElementById('hex-progress');
const speedNum = document.getElementById('speed-num');
const stageText = document.getElementById('stage-text');
let samples = [];

function updateUI(val, stage, color = "#00f2fe") {
    // محيط الشكل السداسي التقريبي 600
    const dashOffset = 600 - (Math.min(val, 900) / 900) * 600;
    progressHex.style.strokeDashoffset = dashOffset;
    progressHex.style.stroke = color;
    speedNum.innerText = val.toFixed(2);
    stageText.innerText = stage;
    stageText.style.color = color;
}

async function getPing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function runNetworkAudit() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    samples = [];
    
    // 1. PING PHASE
    updateUI(0, "ANALYZING PING");
    let pings = [];
    for(let i=0; i<10; i++) {
        const p = await getPing();
        if(p>0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const idlePing = Math.min(...pings);
    document.getElementById('ping-unloaded').innerText = idlePing.toFixed(0);

    // 2. DOWNLOAD PHASE
    await engine('DOWNLOAD', 12000, 'download', "#00f2fe");

    // 3. LOADED PING
    const lPing = await getPing();
    document.getElementById('ping-loaded').innerText = Math.max(lPing, idlePing + 5).toFixed(0);

    // 4. UPLOAD PHASE
    samples = [];
    await engine('UPLOAD', 10000, 'upload', "#ff007a");

    updateUI(0, "COMPLETED", "#00f2fe");
    btn.disabled = false;
    btn.innerText = "RE-INITIALIZE";
}

async function engine(mode, duration, tid, color) {
    const isUp = mode === 'UPLOAD';
    const start = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    const chunk = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(chunk);

    const threads = isUp ? 5 : 10;
    const tasks = Array(threads).fill(0).map(async () => {
        while ((performance.now() - start) < duration) {
            try {
                const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?_=${Math.random()}`;
                if (!isUp) {
                    const res = await fetch(url + "&bytes=50000000", { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytes += value.length;
                        calc(bytes, start, mode, tid, color);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: chunk, signal: controller.signal });
                    bytes += chunk.length;
                    calc(bytes, start, mode, tid, color);
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    await Promise.all(tasks);
}

function calc(total, start, mode, tid, color) {
    const time = (performance.now() - start) / 1000;
    if (time < 1) return;
    const mbps = (total * 8 * (mode === 'DOWNLOAD' ? 1.04 : 1.2)) / time / 1048576;
    samples.push(mbps);
    if(samples.length > 40) samples.shift();
    const avg = samples.reduce((a,b) => a+b, 0) / samples.length;
    updateUI(avg, mode, color);
    document.getElementById(tid).innerText = avg.toFixed(2);
}
