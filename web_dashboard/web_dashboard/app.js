const btn = document.getElementById("runTestBtn");

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "جاري القياس...";

  try {
    const res = await fetch("http://localhost:3000/api/speedtest");
    const data = await res.json();

    document.getElementById("ping").textContent = data.ping_ms?.toFixed(1);
    document.getElementById("download").textContent = data.download_mbps?.toFixed(2);
    document.getElementById("upload").textContent = data.upload_mbps?.toFixed(2);
    document.getElementById("server").textContent = data.server || "-";
  } catch (e) {
    alert("حدث خطأ أثناء القياس");
  } finally {
    btn.disabled = false;
    btn.textContent = "ابدأ القياس";
  }
});
