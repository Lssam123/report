// تحديد العناصر من ملف HTML
const startBtn = document.getElementById('startBtn');
const speedValue = document.getElementById('speed-value');
const statusText = document.getElementById('status');

// إعدادات الاختبار
// نستخدم صورة كبيرة من خوادم ويكيميديا لاختبار التنزيل (حجمها تقريباً 8.1 ميجابايت)
const imageAddr = "https://upload.wikimedia.org/wikipedia/commons/3/3e/Tokyo_Sky_Tree_2012.JPG";
const downloadSize = 8097000; // حجم الصورة بالبايت (Bytes)

startBtn.addEventListener('click', () => {
    // تحديث الواجهة عند بدء الفحص
    startBtn.disabled = true;
    startBtn.innerText = "جاري الفحص...";
    statusText.innerText = "يتم الآن قياس سرعة التنزيل...";
    speedValue.innerText = "...";

    // المتغيرات لحساب الوقت
    let startTime, endTime;
    let download = new Image();

    // دالة تعمل بمجرد انتهاء تحميل الصورة
    download.onload = function () {
        endTime = (new Date()).getTime();
        showResults();
    };
    
    // دالة تعمل في حال فشل تحميل الصورة
    download.onerror = function (err, msg) {
        statusText.innerText = "فشل في تحميل بيانات الاختبار. تأكد من اتصالك.";
        startBtn.disabled = false;
        startBtn.innerText = "إعادة المحاولة";
    };

    // بدء حساب الوقت وبدء تحميل الصورة
    // نستخدم Math.random() لمنع المتصفح من استخدام الصورة من الذاكرة المؤقتة (Cache)
    startTime = (new Date()).getTime();
    download.src = imageAddr + "?n=" + Math.random();

    // دالة حساب السرعة وعرضها
    function showResults() {
        let duration = (endTime - startTime) / 1000; // تحويل الوقت إلى ثواني
        let bitsLoaded = downloadSize * 8; // تحويل البايت إلى بت
        
        let speedBps = (bitsLoaded / duration); // بت في الثانية
        let speedKbps = (speedBps / 1024);      // كيلوبت في الثانية
        let speedMbps = (speedKbps / 1024);     // ميجابت في الثانية

        // عرض النتيجة النهائية
        speedValue.innerText = speedMbps.toFixed(2);
        statusText.innerText = "تم الفحص بنجاح!";
        startBtn.disabled = false;
        startBtn.innerText = "فحص مرة أخرى";
    }
});
