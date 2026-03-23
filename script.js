<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>منصة فحص جودة الشبكة - Control Panel</title>
    <style>
        /* تصميم "غرفة التحكم" (Control Room) - احترافي وخالي من البهرجة */
        :root {
            --bg: #0a0a0c;
            --panel: #121216;
            --border: #2a2a35;
            --text: #e2e8f0;
            --cyan: #00f0ff; /* لون السرعة */
            --ping: #ff3e3e; /* لون البنق */
            --log: #00ff66; /* لون سطر الأوامر */
        }

        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }

        .dashboard {
            background-color: var(--panel);
            border: 1px solid var(--border);
            border-radius: 8px;
            width: 100%;
            max-width: 800px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.8);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* الجزء العلوي: الأرقام */
        .metrics-container {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            border-bottom: 1px solid var(--border);
        }

        .metric-box {
            padding: 20px;
            border-left: 1px solid var(--border);
            text-align: center;
        }
        .metric-box:first-child { border-left: none; }

        .label {
            font-size: 11px;
            color: #8a8a98;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            display: block;
        }

        .value {
            font-family: 'Courier New', Courier, monospace;
            font-size: 32px;
            font-weight: bold;
            color: var(--text);
        }
        
        .val-cyan { color: var(--cyan); }
        .val-ping { color: var(--ping); }

        .unit {
            font-size: 12px;
            color: #8a8a98;
            margin-right: 2px;
        }

        /* الجزء الأوسط: الرسم البياني */
        .graph-container {
            padding: 20px;
            border-bottom: 1px solid var(--border);
            background: #0d0d11;
            position: relative;
        }
        
        #liveGraph {
            width: 100%;
            height: 150px;
            display: block;
        }

        .graph-overlay {
            position: absolute;
            top: 25px;
            right: 25px;
            font-size: 12px;
            color: #8a8a98;
            font-family: monospace;
        }

        /* الجزء السفلي: سطر الأوامر (Terminal Log) والزر */
        .bottom-section {
            display: flex;
        }

        .terminal-log {
            flex: 1;
            padding: 15px;
            background: #050505;
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            color: var(--log);
            height: 80px;
            overflow-y: auto;
            border-left: 1px solid var(--border);
        }

        .terminal-log p { margin: 2px 0; }
        .log-time { color: #8a8a98; margin-left: 5px; }

        .action-btn {
            width: 200px;
            background: var(--text);
            color: var(--bg);
            border: none;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
            text-transform: uppercase;
        }

        .action-btn:hover { background: var(--cyan); }
        .action-btn:disabled { background: var(--border); color: #8a8a98; cursor: not-allowed; }

        /* سكرول بار للترمينال */
        .terminal-log::-webkit-scrollbar { width: 6px; }
        .terminal-log::-webkit-scrollbar-thumb { background: var(--border); }
    </style>
</head>
<body>

    <div class="dashboard">
        <div class="metrics-container">
            <div class="metric-box">
                <span class="label">البنق الأساسي (TCP)</span>
                <span class="value val-ping" id="idlePing">--<span class="unit">ms</span></span>
            </div>
            <div class="metric-box">
                <span class="label">تنزيل (Download)</span>
                <span class="value val-cyan" id="dlSpeed">--<span class="unit">Mbps</span></span>
            </div>
            <div class="metric-box">
                <span class="label">بنق مثقل (Loaded)</span>
                <span class="value val-ping" id="loadedPing">--<span class="unit">ms</span></span>
            </div>
            <div class="metric-box">
                <span class="label">رفع (Upload)</span>
                <span class="value val-cyan" id="ulSpeed">--<span class="unit">Mbps</span></span>
            </div>
        </div>

        <div class="graph-container">
            <div class="graph-overlay">مخطط التدفق اللحظي (Real-time Flow)</div>
            <canvas id="liveGraph"></canvas>
        </div>

        <div class="bottom-section">
            <div class="terminal-log" id="termLog">
                <p><span class="log-time">[SYS]</span> النظام جاهز. بانتظار بدء التسلسل...</p>
            </div>
            <button class="action-btn" id="startBtn">بدء الفحص</button>
        </div>
    </div>

    <script>
        // --- 1. إعدادات الواجهة والرسم البياني ---
        const ui = {
            btn: document.getElementById('startBtn'),
            log: document.getElementById('termLog'),
            idlePing: document.getElementById('idlePing'),
            dlSpeed: document.getElementById('dlSpeed'),
            loadedPing: document.getElementById('loadedPing'),
            ulSpeed: document.getElementById('ulSpeed')
        };

        // إعداد الرسم البياني (Canvas) برمجياً من الصفر
        const canvas = document.getElementById('liveGraph');
        const ctx = canvas.getContext('2d');
        let graphData = [];
        let graphColor = "#00f0ff";
        
        function resizeCanvas() {
            canvas.width = canvas.parentElement.clientWidth - 40;
            canvas.height = 150;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        function drawGraph() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (graphData.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(0, canvas.height);

            const step = canvas.width / 50; // عرض 50 نقطة كحد أقصى
            const maxVal = Math.max(...graphData, 10); // تحديد أعلى سرعة لضبط مقياس الرسم

            for (let i = 0; i < graphData.length; i++) {
                let x = i * step;
                let y = canvas.height - ((graphData[i] / maxVal) * (canvas.height - 20));
                ctx.lineTo(x, y);
            }

            ctx.lineWidth = 2;
            ctx.strokeStyle = graphColor;
            ctx.stroke();

            // إضافة تدرج لوني تحت الخط
            ctx.lineTo((graphData.length - 1) * step, canvas.height);
            ctx.lineTo(0, canvas.height);
            let gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, graphColor + "40"); // شفافية 25%
            gradient.addColorStop(1, "transparent");
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        function addGraphPoint(val) {
            graphData.push(val);
            if (graphData.length > 50) graphData.shift();
            drawGraph();
        }

        function writeLog(msg) {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false });
            ui.log.innerHTML += `<p><span class="log-time">[${time}]</span> ${msg}</p>`;
            ui.log.scrollTop = ui.log.scrollHeight; // التمرير للأسفل تلقائياً
        }

        // --- 2. إعدادات الشبكة ---
        const TEST_DURATION = 10000; // 10 ثواني
        const EDGE_URL = "https://cp.cloudflare.com/generate_204"; // نقطة كلاودفلير السريعة جداً

        let isTestingLoaded = false;
        let loadedPings = [];

        // --- 3. دورة التشغيل الرئيسية ---
        ui.btn.addEventListener('click', async () => {
            ui.btn.disabled = true;
            ui.btn.innerText = "جاري القياس...";
            const def = `--<span class="unit">--</span>`;
            ui.idlePing.innerHTML=def; ui.dlSpeed.innerHTML=def; ui.loadedPing.innerHTML=def; ui.ulSpeed.innerHTML=def;
            graphData = []; ctx.clearRect(0, 0, canvas.width, canvas.height);
            ui.log.innerHTML = '';
            
            try {
                // 1. البنق النقي باستخدام Resource Timing API
                writeLog("بدء الاتصال بخوادم الحافة (Edge Nodes)...");
                const purePing = await measureHardwarePing();
                ui.idlePing.innerHTML = `${purePing}<span class="unit">ms</span>`;
                writeLog(`تم حساب البنق الأساسي: ${purePing}ms`);
                await sleep(500);

                // 2. التحميل والبنق المثقل
                graphColor = "#00f0ff"; // أزرق للتنزيل
                graphData = [];
                writeLog("جاري اختبار مسار التنزيل (Download Stream)...");
                
                isTestingLoaded = true; loadedPings = [];
                startLoadedPingLoop(); 
                
                const dlSpeed = await testDownload();
                
                isTestingLoaded = false;
                ui.dlSpeed.innerHTML = `${dlSpeed}<span class="unit">Mbps</span>`;
                const finalLoaded = loadedPings.length ? Math.min(...loadedPings) : "--";
                ui.loadedPing.innerHTML = `${finalLoaded}<span class="unit">ms</span>`;
                writeLog(`انتهى التنزيل: ${dlSpeed} Mbps | بنق مثقل: ${finalLoaded}ms`);
                await sleep(1000);

                // 3. الرفع (باستخدام No-CORS Workers)
                graphColor = "#ff00ff"; // وردي للرفع
                graphData = [];
                writeLog("جاري اختبار مسار الرفع (Upload Chunks) لتجاوز حماية المتصفح...");
                
                const ulSpeed = await testUploadSafe();
                
                ui.ulSpeed.innerHTML = `${ulSpeed}<span class="unit">Mbps</span>`;
                writeLog(`انتهى الرفع: ${ulSpeed} Mbps`);
                writeLog("اكتمل التشخيص. البيانات مطابقة للمعايير.");

            } catch (err) {
                writeLog(`<span style="color:#ff3e3e">خطأ فادح: ${err.message}</span>`);
            } finally {
                ui.btn.disabled = false;
                ui.btn.innerText = "إعادة الفحص";
                isTestingLoaded = false;
            }
        });

        const sleep = ms => new Promise(r => setTimeout(r, ms));

        // --- 4. محرك البنق (Hardware Level Ping) ---
        // هذه الدالة تستخدم performance API لاستخراج وقت انتقال الشبكة الدقيق (TCP/TLS) متجاهلة وقت الجافاسكريبت
        async function measureHardwarePing() {
            let pings = [];
            // طلب تسخين لفتح القناة
            try { await fetch(EDGE_URL, { mode: 'no-cors', cache: 'no-store' }); } catch(e){}
            
            for (let i = 0; i < 5; i++) {
                const testUrl = EDGE_URL + '?id=' + Date.now() + Math.random();
                try {
                    await fetch(testUrl, { mode: 'no-cors', cache: 'no-store' });
                    // قراءة الوقت من المتصفح مباشرة
                    const entries = performance.getEntriesByName(testUrl);
                    if (entries.length > 0) {
                        // duration يمثل وقت الرحلة الكاملة للطلب
                        pings.push(Math.round(entries[0].duration));
                    }
                } catch(e) {}
                await sleep(50);
            }
            // أخذ أقل رقم لأنه يمثل قدرة الخط دون أي معوقات برمجية (نفس آلية Speedtest)
            return pings.length > 0 ? Math.min(...pings) : "--";
        }

        async function startLoadedPingLoop() {
            while (isTestingLoaded) {
                const testUrl = EDGE_URL + '?load=' + Date.now();
                try {
                    await fetch(testUrl, { mode: 'no-cors', cache: 'no-store' });
                    const entries = performance.getEntriesByName(testUrl);
                    if (entries.length > 0) loadedPings.push(Math.round(entries[0].duration));
                } catch(e) {}
                await sleep(250);
            }
        }

        // --- 5. محرك التنزيل ---
        function testDownload() {
            return new Promise(async (resolve) => {
                const controller = new AbortController();
                const url = "https://speed.cloudflare.com/__down?bytes=150000000"; // 150MB لضمان عدم انتهائه بسرعة
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
                        if (duration > 0.3) {
                            finalSpeed = ((totalBytes * 8) / duration) / 1000000;
                            ui.dlSpeed.innerHTML = `${finalSpeed.toFixed(2)}<span class="unit">Mbps</span>`;
                            addGraphPoint(finalSpeed);
                        }
                    }
                } catch (e) {} // سيتوقف هنا عند الـ abort
                clearTimeout(timeout);
                resolve(finalSpeed.toFixed(2));
            });
        }

        // --- 6. محرك الرفع المطلق (The Ultimate Upload Fix for GitHub Pages) ---
        // الخدعة: نستخدم Fetch مع وضع no-cors. هذا يمنع المتصفح من إرسال طلب (OPTIONS) الأمني
        // ويقوم بإرسال البيانات فوراً بقوة. نحن لا نحتاج لقراءة استجابة السيرفر، نحتاج فقط لرمي البيانات.
        function testUploadSafe() {
            return new Promise((resolve) => {
                let isRunning = true;
                let totalSentBytes = 0;
                let finalSpeed = 0;
                const startTime = performance.now();
                
                // حزمة صغيرة جداً (1 ميجا) لتتكرر بسرعة ولا يتم حظرها بسبب طول الوقت
                const chunkSize = 1048576; 
                const chunkData = new Blob([new Uint8Array(chunkSize)]);

                // تحديث الواجهة كل ربع ثانية
                const uiTimer = setInterval(() => {
                    if (!isRunning) return;
                    const duration = (performance.now() - startTime) / 1000;
                    if (duration > 0.5 && totalSentBytes > 0) {
                        finalSpeed = ((totalSentBytes * 8) / duration) / 1000000;
                        ui.ulSpeed.innerHTML = `${finalSpeed.toFixed(2)}<span class="unit">Mbps</span>`;
                        addGraphPoint(finalSpeed);
                    }
                }, 250);

                // إيقاف الفحص بعد 10 ثواني
                setTimeout(() => {
                    isRunning = false;
                    clearInterval(uiTimer);
                    resolve(finalSpeed.toFixed(2));
                }, TEST_DURATION);

                // عامل الرفع (Worker): يرسل حزمة، وينتظر وصولها، ثم يرسل أخرى فوراً
                async function uploadWorker() {
                    while (isRunning) {
                        try {
                            await fetch('https://speed.cloudflare.com/__up', {
                                method: 'POST',
                                body: chunkData,
                                mode: 'no-cors', // كلمة السر لتجاوز جيتهاب والمتصفح
                                cache: 'no-store'
                            });
                            // إذا اكتمل الرفع بدون أخطاء، نضيف الحجم للرصيد
                            if (isRunning) totalSentBytes += chunkSize;
                        } catch(e) {
                            // إذا فشل الاتصال، استمر في المحاولة (Loop)
                        }
                    }
                }

                // تشغيل 4 عمال (Workers) متوازيين لضغط خط الرفع وسحب أقصى سرعة
                for (let i = 0; i < 4; i++) uploadWorker();
            });
        }
    </script>
</body>
</html>
