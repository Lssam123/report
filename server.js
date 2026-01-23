const express = require("express");
const { execFile } = require("child_process");
const path = require("path");

const app = express();
const PORT = 3000;

// مسار سكربت البايثون
const PY_SCRIPT = path.join(__dirname, "..", "core_python", "speed_test.py");

app.get("/api/speedtest", (req, res) => {
  execFile("python", [PY_SCRIPT], (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || error.message });
    }
    try {
      const data = JSON.parse(stdout);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Invalid JSON from Python script" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Speedtest API running on http://localhost:${PORT}`);
});
