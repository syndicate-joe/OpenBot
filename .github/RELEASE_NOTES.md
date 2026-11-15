## OpenBot 0.3.0: bots that drive a real browser, text you back, and run on Windows

**Download:** [macOS (Apple silicon) .dmg](https://github.com/satiricalguru/OpenBot/releases/latest/download/OpenBot-mac-arm64.dmg) · [Windows (x64) installer](https://github.com/satiricalguru/OpenBot/releases/latest/download/OpenBot-windows-x64-setup.exe) · [Linux AppImage](https://github.com/satiricalguru/OpenBot/releases/latest/download/OpenBot-linux-x86_64.AppImage)

### New
- **Real browser control with a live screen.** Bots can open, read, click and type in their own Chrome/Edge profile (Playwright). Watch it live in the Computer panel. Clicking and typing default to **Ask**, and password fields are always refused.
- **Telegram and Slack bridges.** Text your bots from your phone. Telegram uses long polling and Slack uses Socket Mode, so you don't need a public URL. Only chats you allow can talk to your bots.
- **Windows and Linux installers.** A Windows setup .exe, plus a Linux AppImage and .deb, built on native CI runners.
- **Team mode with sign-in.** Create accounts with admin and member roles. Passwords are hashed with scrypt, sessions use HttpOnly cookies, and failed logins are rate-limited. Sign-in turns on automatically when OpenBot is shared on your network.
- **Signing pipeline.** The release workflow signs and notarizes the macOS build, and signs the Windows build, as soon as certificates are added as repository secrets.

### Install notes
- **macOS:** this build is not notarized yet. After the first launch is blocked, open **System Settings → Privacy & Security → Open Anyway**, or run `xattr -cr /Applications/OpenBot.app`.
- **Windows:** the installer is unsigned, so SmartScreen may warn you. Click **More info → Run anyway**.
- You'll also need a free model and ffmpeg. On macOS run `brew install ffmpeg ollama`; on Windows run `winget install Gyan.FFmpeg Ollama.Ollama`. Then run `ollama pull qwen3:8b`.
