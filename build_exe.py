"""
PyInstaller Build Script for Gemini Chat Studio Hub Server
Builds a standalone Windows executable (GeminiHubServer.exe)
"""
import os
import sys
import shutil
import subprocess

if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def build():
    print("=" * 60)
    print("  [*] Building GeminiHubServer.exe with PyInstaller...")
    print("=" * 60)

    # Output directory
    dist_dir = os.path.join(BASE_DIR, "dist")
    build_dir = os.path.join(BASE_DIR, "build")

    # Command arguments for PyInstaller
    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--name=GeminiHubServer",
        "--onefile",
        "--noconfirm",
        f"--distpath={dist_dir}",
        f"--workpath={build_dir}",
        f"--add-data={os.path.join(BASE_DIR, 'index.html')};.",
        f"--add-data={os.path.join(BASE_DIR, 'style.css')};.",
        f"--add-data={os.path.join(BASE_DIR, 'app.js')};.",
        f"--add-data={os.path.join(BASE_DIR, 'config.yaml')};.",
        f"--add-data={os.path.join(BASE_DIR, 'riro_sdk')};riro_sdk",
        f"--add-data={os.path.join(BASE_DIR, 'plugins')};plugins",
        "--hidden-import=uvicorn",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespans",
        "--hidden-import=uvicorn.lifespans.on",
        "--hidden-import=fastapi",
        "--hidden-import=starlette",
        "--hidden-import=starlette.responses",
        "--hidden-import=starlette.routing",
        "--hidden-import=pydantic",
        "--hidden-import=httpx",
        "--hidden-import=psutil",
        "--hidden-import=yaml",
        "--hidden-import=plugins",
        "--hidden-import=plugins.base",
        "--hidden-import=plugins.manager",
        "--hidden-import=plugins.riroschool_plugin",
        "--hidden-import=plugins.system_plugin",
        "--hidden-import=plugins.neis_plugin",
        "--hidden-import=riro_sdk",
        os.path.join(BASE_DIR, "server.py")
    ]

    print("Running command:")
    print(" ".join(cmd))
    print("\nStarting build process...")

    res = subprocess.run(cmd, cwd=BASE_DIR)
    if res.returncode != 0:
        print(f"\n[!] Build failed with return code {res.returncode}")
        return False

    # Also copy config.yaml next to exe for easy user editing
    target_config = os.path.join(dist_dir, "config.yaml")
    src_config = os.path.join(BASE_DIR, "config.yaml")
    if os.path.exists(src_config):
        shutil.copy2(src_config, target_config)
        print(f"[OK] Copied external config.yaml to {target_config}")

    print("\n" + "=" * 60)
    print("  [SUCCESS] Build Completed Successfully!")
    print(f"  Single Executable: {os.path.join(dist_dir, 'GeminiHubServer.exe')}")
    print(f"  Configuration File: {target_config}")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = build()
    sys.exit(0 if success else 1)
