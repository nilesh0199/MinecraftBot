# 🟩 CraftBot 24/7 — Dual-Bot Minecraft AFK Manager & Web Dashboard

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Minecraft Version](https://img.shields.io/badge/Minecraft-Java%201.8.x%20--%201.21.x%20(Protocol%20774)-blue)](#)
[![Cloud Ready](https://img.shields.io/badge/Cloud-Render%20%7C%20VPS%20%7C%20Docker-green)](#)
[![Dual Bot Architecture](https://img.shields.io/badge/Dual--Bot-Simultaneous%20Slots%20(Bot%201%20&%202)-cyan)](#)
[![Zero Auth](https://img.shields.io/badge/Access-Zero--Auth%20Public%20Dashboard-orange)](#)
[![Keep Alive](https://img.shields.io/badge/UptimeRobot-Autonomous%20Bot%20Revive-purple)](#)

A full-stack, headless Minecraft AFK bot platform with an authentic **Minecraft-themed web dashboard** designed for 24/7 continuous cloud operation. Keep your mob grinders running, crop farms growing, and chunks loaded without keeping your personal computer turned on!

---

## ✨ What's New in CraftBot 24/7

* 🚀 **Zero-Authentication Instant Access**: The dashboard is the landing page. No Google OAuth popups, no Firebase configuration, and no login barriers.
* 🤖 **Dual-Bot Simultaneous Architecture**: Run **two bots simultaneously** on the same server instance. Switch between **Bot 1** and **Bot 2** tabs at the top without disconnecting or stopping either bot.
* ⚡ **UptimeRobot Autonomous Revival**: Bot configurations are saved to persistent server storage (`bot-slots.json`). Whenever UptimeRobot pings `/health`, any dropped bots are **automatically reconnected and revived 24/7**.
* 🌐 **Universal Server & Port Support**: Connect to **any** Minecraft server (Vanilla, Paper, Spigot, Fabric, Aternos, Hypixel, etc.) with default (`25565`) or custom ports (`:16808`, `:25566`).
* 💥 **1.21 Mace Smash Animation**: Authentic Minecraft 1.21 Mace jump, particle smash, and sound effects on connection and on demand.
* 🛡️ **Lean & Blazing Fast**: Purged 85 unused Firebase packages. Client bundle size reduced by 61% (loads in <1s) with **0 vulnerabilities**.

---

## 🎛️ Dashboard & Feature Overview

### 1. Dual-Bot Slot System (Top Tabs)
* **Slot 1 (Bot 1)** & **Slot 2 (Bot 2)**: Both bots run concurrently in the cloud daemon.
* **Large High-Visibility Switcher**: Clearly displays which bot is currently being viewed with bright `ACTIVE TAB` indicators, live status pills (`ONLINE` / `CONNECTING` / `OFFLINE`), and bot usernames.
* **Independent Controls**: Each bot maintains its own independent HUD, vitals, inventory, chat history, and automation settings.

---

### 2. 24/7 Cloud Background & Reconnect Resilience
* **Runs in Background**: Operates as a persistent daemon. You can close your browser tab or turn off your computer; both bots stay active in-game.
* **UptimeRobot Keep-Alive**: When UptimeRobot pings `/health` every 5 minutes, the server verifies both bot instances and automatically restarts any offline bots.
* **Smart Exponential Backoff**: When a Minecraft server restarts or goes offline, CraftBot retries across 5 attempts (5s $\to$ 15s $\to$ 30s $\to$ 60s $\to$ 120s) with a live HUD countdown and an instant **"⚡ Retry Now"** button.

---

### 3. Smart Door & Gate Navigation
* **Auto Door Opening**: While following players (`!follow`) or pathfinding, the bot automatically detects closed wooden doors, trapdoors, and fence gates within reach and opens them smoothly.
* **Auto Door Closing**: Once the bot steps through the doorway, it automatically closes the door behind it to keep hostile mobs out!

---

### 4. Groq AI Chat Companion (English & Hinglish)
* **Instant Inference (~200ms)**: Powered by ultra-fast Groq AI inference with auto-failover across top models.
* **Hinglish & Natural Language**: Understands queries in English, Hindi, and Hinglish (e.g. `!chat ek joke sunao`, `!chat diamonds kahan milenge`).
* **Short-Term Context Memory**: Remembers recent conversation context while chatting with players in-game.
* **Chat Commands**:
  * `!chat <message>` — Queries the AI companion (or mention `@botname`).
  * `@{botname} <message>` — Greets or chats naturally with the bot.
  * `!ai on` / `!ai off` — Toggle AI chat (Owner only).

---

### 5. Interactive 9x4 Inventory Management
* **Interactive Slots**: Click any item from the hotbar or main inventory to open a quick-action modal.
* **Drop / Toss Actions**: Drop 1 item or toss the full stack with a single click.
* **Equip & Eat**: Equip armor to helmet, chestplate, leggings, or boots, place weapons in hand/off-hand, or command the bot to eat food items.
* **Hotbar Hotkeys**: Press keys `1`–`9` on your keyboard to instantly swap active hotbar slots.

---

### 6. Bed Sleeping & Night-Skip System
* **`!sleep` (Auto-Bed Navigation)**:
  * Scans within a **24-block radius** for any bed block (`red_bed`, `white_bed`, etc.).
  * Walks to the bed using pathfinder, hops in, and announces: `🛏️ In bed! Goodnight everyone.`
  * Automatically wakes up in the morning or upon `!wake`.
* **`!nightskip` (1-Minute Temporary Leave & Auto-Rejoin)**:
  * Disconnects for 60 seconds so other players on the server can sleep and pass the night.
  * **Auto-rejoins automatically after 60 seconds** without requiring the owner to reopen the web dashboard!

---

### 7. In-Game Ownership Transfer & Dynamic Username Switch
* **`✏️ Change` Button (HUD)**:
  * Click the `✏️ Change` button directly beside the bot username in the dashboard HUD.
  * Enter a new Minecraft username: the bot announces the change in chat, cleanly disconnects, and **automatically rejoins the server in 10 seconds** with the new identity!
* **`!rename <NewUsername>`**: Switch the bot's username directly via in-game Minecraft chat.
* **`!transfer <NewOwnerIGN>`**: Reassign authorized bot controller in-game to another player at any time.

---

## 📜 In-Game Command Reference

| Command | Allowed Users | Description |
| :--- | :--- | :--- |
| `!help` | Public | Lists available in-game commands |
| `!sleep` / `!bed` | Public | Finds nearest bed (24 blocks), walks to it, and sleeps |
| `!wake` / `!wakeup` | Public | Wakes the bot up from bed |
| `!nightskip` / `!nap` | Public | Leaves for 60s so players can sleep, then auto-rejoins |
| `!chat <message>` | Public | Queries the Groq AI companion (English & Hinglish) |
| `@{botname}` / `!hi` | Public | Greets the bot or chats with AI |
| `!follow` / `!come` | Public | Follows the player and navigates doors |
| `!stop` / `!halt` | Public | Stops pathfinding and stays in place |
| `!status` | Public | Reports HP, hunger, coords, dimension, and sleeping status |
| `!shutdown bot` | **Owner Only** | Safely & permanently shuts down the bot |
| `!rename <NewName>` | **Owner Only** | Changes bot username and rejoins in 10 seconds |
| `!transfer <Player>` | **Owner Only** | Transfers bot ownership to another player IGN |
| `!ai on` / `!ai off` | **Owner Only** | Enables or disables Groq AI chat companion |
| `!dropall` / `!toss` | **Owner Only** | Drops all inventory items at the bot's feet |
| `!eat` | **Owner Only** | Consumes food from inventory |
| `!attack` | **Owner Only** | Toggles mob farm auto-attack |

---

## 🚀 Deployment Options

### Option 1: Render.com (Free 24/7 Cloud Host)
Detailed walkthrough in [**DEPLOY_RENDER.md**](./DEPLOY_RENDER.md).

1. Go to [dashboard.render.com](https://dashboard.render.com/) $\to$ **New +** $\to$ **Web Service**.
2. Select **Public Git repository** and paste:
   ```
   https://github.com/nilesh0199/MinecraftBot.git
   ```
   *(No need to connect your personal GitHub account!)*
3. Render detects `render.yaml` automatically:
   * **Build Command**: `npm run build`
   * **Start Command**: `npm start`
   * **Health Check Path**: `/health`
   * **Plan**: `Free`
4. *(Optional)* Add Environment Variable `GROQ_API_KEY` for Llama-3 AI in-game chat.
5. In [UptimeRobot.com](https://uptimerobot.com), create a free **HTTP monitor** pointing to `https://<your-app>.onrender.com/health` every 5 minutes.
   - This keeps the Render service awake 24/7 **and** revives both bots automatically if dropped!

---

### Option 2: Local Run (Windows / macOS / Linux)

1. **Build both client and server**:
   ```bash
   npm run build
   ```
2. **Start the server**:
   ```bash
   npm start
   ```
3. Open your browser at **`http://localhost:3001`**.

---

## 🛡️ Production Security & Audit

CraftBot features built-in security protections audited with an automated test suite:
* **SSRF Defense**: Blocks connections to private subnets, loopback addresses, cloud metadata (`169.254.169.254`), and dangerous ports (SSH, MySQL, Redis).
* **Slot Boundary & Inventory Validation**: Rigorous checks on inventory slots and commands.
* **Rate Limiting**: Throttles chat and spawn actions to prevent spam kicks and resource abuse.
* **Memory Watchdog**: Monitors heap allocation to ensure 24/7 stability.

Run the test suite anytime:
```bash
npx ts-node server/tests/security-audit.ts
# RESULTS: 94/94 PRODUCTION AUDIT TESTS PASSED
```

---

## 📄 License
MIT License. Created for the Minecraft community.
