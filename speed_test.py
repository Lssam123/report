import json
import time
import subprocess

def run_speedtest():
    # نستخدم speedtest-cli كأمر خارجي لإخراج JSON
    result = subprocess.run(
        ["speedtest-cli", "--json"],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError("Speedtest failed: " + result.stderr)

    data = json.loads(result.stdout)

    return {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "ping_ms": data.get("ping"),
        "download_mbps": data.get("download") / 1_000_000,
        "upload_mbps": data.get("upload") / 1_000_000,
        "server": data.get("server", {}).get("host"),
        "sponsor": data.get("server", {}).get("sponsor")
    }

if __name__ == "__main__":
    try:
        result = run_speedtest()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
