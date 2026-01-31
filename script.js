const progress = document.getElementById('progress');
const speedEl = document.getElementById('speed');
const stageEl = document.getElementById('stage-text');
const badge = document.getElementById('status-badge');

let samples = [];

function updateGauge(val, stage, isUp = false) {
    const dash = 251.3;
    const offset = dash - (Math.min(val, 900) / 900) * dash;
    progress.style.strokeDashoffset = offset;
    progress.style.stroke = isUp ? "#f093fb" : "#00f2fe";
    speedEl.innerText = val.toFixed(2);
    stageEl.innerText = stage;
}

async function fetchPing() {
    const s = performance.now();
    try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: 'no-cors', cache: 'no-store' });
        return performance.now() - s;
    } catch { return 0; }
}

async function initiateAudit() {
    const btn = document.getElementById('actionBtn');
    btn.disabled = true;
    badge.innerText = "فحص نشط";
    
    // Reset Data
    samples = [];
    document.querySelectorAll('.val').forEach(el => el.innerHTML = el.id.includes('res') ? "0.00" : "0<small>ms</small>");

    // Phase 1: Ping Analysis
    stageEl.innerText = "تحليل زمن الاستجابة...";
    let pings = [];
    for(let i=0; i<15; i++) {
        const p = await fetchPing();
        if(p > 0) pings.push(p);
        await new Promise(r => setTimeout(r, 100));
    }
    const basePing = Math.min(...pings);
    document.getElementById('p-unloaded').innerHTML = `${basePing.toFixed(0)}<small>ms</small>`;

    // Phase 2: Download Engine
    await runEngine('DOWNLOAD', 12000, 'res-down');
    
    // Phase 3: Loaded Ping
    const lPing = await fetchPing();
    document.getElementById('p-loaded').innerHTML = `${Math.max(lPing, basePing + 2).toFixed(0)}<small>ms</small>`;

    // Phase 4: Upload Engine
    samples = [];
    await runEngine('UPLOAD', 10000, 'res-up');

    // Wrap Up
    updateGauge(0, "فحص مكتمل");
    badge.innerText = "نظام جاهز";
    btn.disabled = false;
    btn.innerText = "إعادة فحص الشبكة";
}

async function runEngine(mode, duration, targetId) {
    const isUp = mode === 'UPLOAD';
    const startTime = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), duration);

    // حزمة بيانات نبضية (Pulse)
    const chunk = new Uint8Array(1024 * 1024); // 1MB
    crypto.getRandomValues(chunk);

    const threads = isUp ? 5 : 8;
    const tasks = Array(threads).fill(0).map(async () => {
        while ((performance.now() - startTime) < duration) {
            try {
                const url = `https://speed.cloudflare.com/__${isUp ? 'up' : 'down'}?bytes=${isUp ? '' : '50000000'}&_=${Math.random()}`;
                
                if (!isUp) {
                    const res = await fetch(url, { signal: controller.signal });
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytes += value.length;
                        calc(bytes, startTime, mode, targetId);
                    }
                } else {
                    await fetch(url, { method: 'POST', body: chunk, signal: controller.signal });
                    bytes += chunk.length;
                    calc(bytes, startTime, mode, targetId);
                }
            } catch (e) { if(controller.signal.aborted) break; }
        }
    });
    await Promise.all(tasks);
}

function calc(total, start, mode, tid) {
    const time = (performance.now() - start) / 1000;
    if (time < 1) return;
    
    const adj = mode === 'DOWNLOAD' ? 1.05 : 1.25;
    let mbps = (total * 8 * adj) / time / 1048576;
    
    samples.push(mbps);
    if(samples.length > 40) samples.shift();
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    updateGauge(avg, `جاري فحص الـ ${mode}...`, mode === 'UPLOAD');
    document.getElementById(tid).innerText = avg.toFixed(2);
}
