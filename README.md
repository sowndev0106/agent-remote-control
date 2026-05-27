# Agent Remote Control 🎮

A project designed to implement remote control and monitoring capabilities for AI agents (specifically targeting Antigravity sessions).

## 📌 Reference Source

This project references and adapts source code and architectures from:

*   **Repository:** [antigravity_phone_chat](https://github.com/krishnakanthb13/antigravity_phone_chat) (by [@krishnakanthb13](https://github.com/krishnakanthb13))
*   **Local Clone Path:** [ref-source/antigravity_phone_chat](./ref-source/antigravity_phone_chat)

### Key Architectures & Features Referenced:
*   **CDP Mirroring:** Real-time mirroring of the Antigravity session using the Chrome DevTools Protocol (CDP).
*   **Remote Controls:** Bidirectional scroll synchronization, thought block expansion, precision remote clicks, and action execution (such as "Allow", "Deny", and custom input).
*   **Tunnels & Security:** Local HTTPS configurations alongside secure reverse tunneling options (ngrok, Cloudflare, Pinggy) with passcode protection.

---

## 🛠️ Project Structure

*   `src/`: Primary source code of the agent remote control application (under active development).
*   `ref-source/`: Reference repositories, documentation, and external blueprints (excluded from git tracking).
    *   `ref-source/antigravity_phone_chat/`: Local clone of the referenced mobile controller repository.
