const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('status');

const ui = {
    bestServer: document.getElementById('bestServer'),
    pingIdle: document.getElementById('pingIdle'),
    downloadSpeed: document.getElementById('downloadSpeed'),
    pingLoadedDown: document.getElementById('pingLoadedDown'),
    uploadSpeed: document.getElementById('uploadSpeed'),
    pingLoadedUp: document.getElementById('pingLoadedUp')
};

const telecomServers = [
    { name: "STC", url: "https://www.stc.com.sa/" },
    { name: "Mobily", url: "https://www.mobily.com.sa/" },
    { name: "Zain", url: "https://sa.zain.com/" },
    { name: "Salam", url: "https://salam.sa/" }
];

let bestServerUrl = "";

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    resetUI();
    
    try {
        statusText.innerText = "جاري قياس الاستجابة الأساسية...";
        const bestTelco = await findBestPing();
        ui.bestServer.innerText = bestTelco.name;
        ui.pingIdle.innerText = bestTelco.ping;
        bestServerUrl = bestTelco.url; // استخدام هذا الرابط لقياس البنق المثقل لاحقاً

        if (bestServerUrl) {
            statusText.innerText = "جاري قياس التحميل والاستجابة المثقلة...";
            const downResult = await measureSpeedAndLoadedPing('download');
            ui.downloadSpeed.innerText = downResult.speed;
            ui.pingLoadedDown.innerText = downResult.loadedPing;

            statusText.innerText = "جاري قياس الرفع والاستجابة المثقلة...";
            const upResult = await measureSpeedAndLoadedPing('upload');
            ui.uploadSpeed.innerText = upResult.speed;
            ui.pingLoadedUp.innerText = upResult.loadedPing;
        }

        statusText.innerText = "مكتمل.";
    } catch (error) {
        statusText.innerText = "فشل الفحص.";
    } finally {
        startBtn.disabled = false;
        startBtn.innerText = "إعادة الفحص";
    }
});

function resetUI() {
    ui.bestServer.innerText = "--";
    ui.pingIdle.innerText = "--";
    ui.downloadSpeed.innerText = "--";
    ui.pingLoadedDown.innerText = "--";
    ui.uploadSpeed.innerText = "--";
    ui.pingLoadedUp.innerText = "--";
}

async function findBestPing() {
    let best = { name: "-", ping: Infinity, url: null };
    for (let server of telecomServers) {
        const pingTime = await measureSinglePing(server.url);
        if (pingTime < best.ping) {
            best = { name: server.name, ping: pingTime, url: server.url };
        }
    }
    return best.ping === Infinity ? { name: "خطأ اتصال", ping: "-", url: null } : best;
}

async function measureSinglePing(url) {
    const start = performance.now();
    try {
        await fetch(url + '?nocache=' + Math.random(), { mode: 'no-cors', cache: 'no-store' });
        return Math.round(performance.now() - start);
    } catch (e) {
        return Infinity;
    }
}

// دالة تدمج بين قياس السرعة وقياس البنق في نفس الوقت
async function measureSpeedAndLoadedPing(type) {
    let speedMbps = 0;
    let isTesting = true;
    let loadedPings = [];

    // إعداد حجم بيانات أكبر لضمان ضغط الشبكة والحصول على قراءة دقيقة (50MB تحميل / 20MB رفع)
    const downloadSize = 50000000; 
    const uploadSize = 20000000;   

    // بدء حلقة قياس البنق المثقل بشكل متوازي
    const pingInterval = setInterval(async () => {
        if (isTesting && bestServerUrl) {
            const p = await measureSinglePing(bestServerUrl);
            if (p !== Infinity) loadedPings.push(p);
        }
    }, 500); // إرسال طلب بنق كل نصف ثانية أثناء التحميل/الرفع

    // بدء فحص السرعة
    const start = performance.now();
    
    if (type === 'download') {
        const url = `https://speed.cloudflare.com/__down?bytes=${downloadSize}`;
        await fetch(url, { cache: 'no-store' });
        const duration = (performance.now() - start) / 1000;
        speedMbps = ((downloadSize * 8) / duration) / 1000000;
    } else {
        const payload = new Uint8Array(uploadSize);
        const url = "https://speed.cloudflare.com/__up";
        await fetch(url, { method: 'POST', body: payload });
        const duration = (performance.now() - start) / 1000;
        speedMbps = ((uploadSize * 8) / duration) / 1000000;
    }

    // إيقاف حلقة البنق المثقل
    isTesting = false;
    clearInterval(pingInterval);

    // حساب متوسط البنق المثقل
    let avgLoadedPing = "-";
    if (loadedPings.length > 0) {
        const sum = loadedPings.reduce((a, b) => a + b, 0);
        avgLoadedPing = Math.round(sum / loadedPings.length);
    }

    return { 
        speed: speedMbps.toFixed(1), 
        loadedPing: avgLoadedPing 
    };
}
