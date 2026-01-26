async function startTest() {
    const btn = document.getElementById('btn-start');
    const status = document.getElementById('status');
    const speedDisplay = document.getElementById('speed');

    btn.disabled = true;
    status.innerText = "جاري القياس...";
    speedDisplay.innerText = "0.0";

    // رابط لملف تجريبي (حوالي 5 ميجا) لضمان دقة القياس
    const imageAddr = "https://upload.wikimedia.org/wikipedia/commons/3/3a/Original_Kanagawa_Oki_Nami_Ura.jpg" + "?n=" + Math.random();
    const downloadSize = 5242880; // حجم الملف التقريبي بالبايت

    let startTime, endTime;
    const download = new Image();

    startTime = (new Date()).getTime();
    download.src = imageAddr;

    download.onload = function () {
        endTime = (new Date()).getTime();
        showResults(startTime, endTime, downloadSize);
    };

    function showResults(startTime, endTime, fileSize) {
        const duration = (endTime - startTime) / 1000; // بالثواني
        const bitsLoaded = fileSize * 8;
        const speedBps = bitsLoaded / duration;
        const speedKbps = speedBps / 1024;
        const speedMbps = (speedKbps / 1024).toFixed(2);

        speedDisplay.innerText = speedMbps;
        status.innerText = "اكتمل الاختبار!";
        btn.disabled = false;
        btn.innerText = "إعادة الفحص";
    }
}
