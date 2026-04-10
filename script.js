const ui = {
    btn: document.getElementById('actionBtn'),
    status: document.getElementById('status'),
    mainVal: document.getElementById('mainValue'),
    needle: document.getElementById('needle'),
    progress: document.getElementById('progress'),
    v1: document.getElementById('v1'), v2: document.getElementById('v2'),
    v3: document.getElementById('v3'), v4: document.getElementById('v4')
};

// استخدام عقد Edge VPS القريبة (Cloudflare Saudi Arabia)
const VPS_EDGE = "https://1.1.1.1/cdn-cgi/trace"; 
let targetSpeed = 0, currentSpeed = 0, isRunning = false;
let loadedPings = [];

function render() {
    if (!isRunning && Math.abs(currentSpeed - targetSpeed) < 0.1) return;
    currentSpeed += (targetSpeed - currentSpeed) * 0.15;
    const percent = Math.min(currentSpeed / 100, 1);
    
    ui.needle.style.transform = `rotate(${-130 + (260 * percent)}deg)`;
    ui.progress.style.strokeDashoffset = 535 - (535 * percent);
    ui.mainVal.innerText = Math.round(currentSpeed);
    
    document.querySelectorAll('.num').forEach(n => {
        n.classList.toggle('active', currentSpeed >= parseInt(n.innerText));
    });
    
    requestAnimationFrame(render);
}

ui.btn.addEventListener('click', () => {
    if (ui.btn.classList.contains('reset')) return location.reload();
    runTest();
});

async function runTest() {
    isRunning = true; ui.btn.disabled = true; render();
    try {
        ui.status.innerText = "قياس البنق الخام (Jeddah/Riyadh Edge)...";
        ui.v1.innerText = await getRawPing() + " ms";

        ui.status.innerText = "فحص التنزيل والبنق المثقل...";
        loadedPings = [];
        const pingInt = setInterval(async () => {
            const s = performance.now();
            try { await fetch(VPS_EDGE, {mode:'no-cors', cache:'no-store'}); loadedPings.push(performance.now()-s); } catch(e){}
        }, 350);

        const dl = await startDownload();
        clearInterval(pingInt);
        ui.v3.innerText = dl + " Mbps";
        ui.v2.innerText = (loadedPings.length ? Math.round(Math.min(...loadedPings)) : "--") + " ms";

        ui.status.innerText = "قياس الرفع (المحرك الأصلي)...";
        const ul = await startUpload();
        ui.v4.innerText = ul + " Mbps";

        ui.status.innerText = "اكتمل الفحص بنجاح.";
        targetSpeed = 0; ui.btn.innerText = "إعادة الفحص"; ui.btn.classList.add('reset');
    } catch(e) { ui.status.innerText = "خطأ في الشبكة."; }
    finally { isRunning = false; ui.btn.disabled = false; }
}

async function getRawPing() {
    let pings = [];
    for(let i=0; i<15; i++){
        const s = performance.now();
        try {
            await fetch(VPS_EDGE + '?v=' + Math.random(), {
                method: 'HEAD', mode: 'no-cors', cache: 'no-store', priority: 'high'
            });
            pings.push(performance.now() - s);
        } catch(e){}
        await new Promise(r => setTimeout(r, 30));
    }
    const filtered = pings.filter(p => p > 3).sort((a,b)=>a-b);
    return filtered.length ? Math.round(filtered[0]) : "--";
}

function startDownload() {
    return new Promise(async (resolve) => {
        const start = performance.now();
        let bytes = 0, speed = 0;
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
                targetSpeed = speed;
            }
        } catch(e){}
    });
}

async function startUpload() {
    let bytes = 0, speed = 0; const start = performance.now();
    const data = new Uint8Array(1024 * 1024);
    while(performance.now() < start + 10000) {
        try {
            await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: data, mode: 'no-cors' });
            bytes += data.length;
            speed = (bytes * 8 / ((performance.now()-start)/1000)) / 1000000;
            targetSpeed = speed;
        } catch(e){ break; }
    }
    return speed.toFixed(1);
}
