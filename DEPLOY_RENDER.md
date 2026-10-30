# 🚀 CraftBot 24/7 — Render & UptimeRobot Deployment Guide

Deploy CraftBot 24/7 on **Render.com** (Free Tier) and keep it running **24/7 with UptimeRobot** — with zero container sleeping and instant Llama-3.1 AI in-game chat via Groq!

---

## ⚡ Quick 3-Step Setup

### Step 1: Deploy on Render.com (2 minutes)
1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** $\to$ **Web Service**.
2. Connect your GitHub repository:
   ```
   https://github.com/nilesh0199/MinecraftBot.git
   ```
3. Configure settings (or let `render.yaml` configure them automatically):
   * **Name**: `craftbot-24-7`
   * **Region**: Oregon (or nearest to your Minecraft server)
   * **Branch**: `main`
   * **Runtime**: `Node`
   * **Build Command**: `npm run build`
   * **Start Command**: `npm start`
   * **Plan**: `Free` (512 MB RAM, 0.1 CPU)
4. Under **Health Check Path**, enter:
   ```
   /health
   ```
5. *(Optional)* Under **Environment Variables**, add:
   * `GROQ_API_KEY`: *(Your free Groq API key from [console.groq.com](https://console.groq.com/keys))*
   * `FIREBASE_API_KEY`: *(Optional, for Google Login)*
   * `FIREBASE_PROJECT_ID`: `minecraftbot-639a5`
6. Click **Deploy Web Service**!
   Render will build the React SPA frontend and the Node.js backend. Once complete, your URL will be:
   `https://craftbot-24-7-xxxx.onrender.com`

---

### Step 2: Prevent Sleep with UptimeRobot (100% Free 24/7)
Render's free tier spins down after 15 minutes of inactivity. Pinging `/health` every 5 minutes keeps it **awake 24 hours a day, 7 days a week**:

1. Sign up for free at [UptimeRobot.com](https://uptimerobot.com).
2. Click **+ Add New Monitor**:
   * **Monitor Type**: `HTTP(s)`
   * **Friendly Name**: `CraftBot Health Ping`
   * **URL (or IP)**: `https://<YOUR-RENDER-SUBDOMAIN>.onrender.com/health`
   * **Monitoring Interval**: `Every 5 minutes` (Standard Free Plan)
3. Click **Create Monitor**.
4. **Done!** UptimeRobot will ping your server every 5 minutes, keeping CraftBot active 24/7 within Render's 750 free monthly hours!

---

### Step 3: Get Your Free Groq AI Key (Optional for AI Chat)
1. Go to [Groq Cloud Console](https://console.groq.com/keys).
2. Click **Create API Key** (instant, 100% free with no credit card required).
3. Copy the key (`gsk_...`).
4. In your Render Dashboard $\to$ **Environment** $\to$ Add `GROQ_API_KEY = gsk_...`.
5. Render will restart the service with the new key in ~20 seconds.
6. Now in Minecraft chat:
   * Anyone can type: `!ask what level should I mine for diamonds?`
   * Or mention: `@AFKBOT tell me a funny joke!`
   * CraftBot responds dynamically via **Llama-3.1-8b-instant** in **~200ms**!

---

## 🎮 In-Game Commands Reference

| Command | Permission | Description |
| :--- | :--- | :--- |
| `!help` | Public | Lists all available in-game commands |
| `!sleep` / `!bed` | Public | Scans for nearest bed (24 blocks), walks to it, and sleeps |
| `!wake` / `!wakeup` | Public | Wakes the bot up from bed |
| `!nightskip` / `!nap` | Public | Disconnects for 60s so players can sleep, then auto-rejoins |
| `!ask <question>` | Public | Asks the Groq AI Companion a question |
| `@{bot}` / `!hi` | Public | Greets the bot or chats with AI |
| `!follow` / `!come` | Public | Follows the player calling the bot |
| `!stop` / `!halt` | Public | Stops following and stays in place |
| `!status` | Public | Reports bot health, hunger, coordinates, and bed status |
| `!shutdown bot` | **Owner Only** | Safely & permanently shuts down the bot |
| `!transfer <Player>` | **Owner Only** | Transfers bot ownership to another player IGN |
| `!ai on` / `!ai off` | **Owner Only** | Enables or disables Groq AI chat companion |
| `!dropall` / `!toss` | **Owner Only** | Drops all inventory items at the bot's feet |
| `!eat` | **Owner Only** | Consumes food from inventory |
| `!attack` | **Owner Only** | Toggles mob farm auto-attack |
