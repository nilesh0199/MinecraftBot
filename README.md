# 🟩 CraftBot 24/7 — Headless Minecraft AFK Bot Cloud Manager

A dedicated web-controlled Minecraft AFK Bot dashboard designed to run **24/7 in the cloud (Oracle Cloud Free Tier)** so you never need to keep your personal computer running for mob grinders, crop farms, and chunk loaders.

Built for **Cracked / Offline** servers with **Firebase Google Authentication**, in-game owner command verification, live chat, interactive inventory tossing, and smart automation modes.

---

## ⚡ Key Features

- **24/7 Cloud Background Daemon:** The bot process runs on your server independently of browser tabs. Close your browser, shut down your laptop, and the bot stays active.
- **Cracked & Offline Server Ready:** Instant bot spawning without Microsoft account lockouts or license limits. Supports AuthMe auto-login (`/login <password>`).
- **Firebase Google Authentication:** Secure login for you and your friends.
- **Smart User Recents:** Remembers your **last server IP** and displays your **last 3 bot usernames** for 1-click spawning.
- **In-Game Whitelist Security:** Onboarding asks for your Minecraft username (`ownerIgn`). Only this exact player can command the bot in-game (`!leave`, `!follow`, `!status`), ignoring anyone else.
- **Interactive Minecraft HUD & Inventory:**
  - Real-time Hearts (❤️❤️) & Hunger (🍗🍗) tracking.
  - World coordinates (X, Y, Z), dimension, ping, and level XP bar.
  - 9x4 Minecraft inventory slots with stack counts. Click any item to **Toss 1**, **Toss All**, **Hold in Main Hand**, or **Put in Off-Hand**.
- **Survival Automation:**
  - **Anti-AFK:** Periodic look angle jiggles and sneak cycles to prevent server kicks.
  - **Auto-Eat:** Automatically switches to food and eats whenever hunger drops below 14.
  - **Auto-Attack (Mob Grinders):** Attacks falling mobs (Enderman, Blaze, Skeleton) on optimal weapon cooldown.
  - **Auto-Disconnect Timers:** Set a runtime (e.g. 60 minutes) and the bot cleanly logs off when done.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
# In the root folder:
npm run install:all
```

### 2. Build and Run
You can run the client and server separately:

```bash
# Terminal 1 - Start Server (Port 3001)
npm run dev:server

# Terminal 2 - Start Frontend (Port 5173)
npm run dev:client
```

> **Demo Mode Included:** If you haven't configured Firebase yet, clicking **"Sign in with Google"** automatically enters a local demo profile (`Nilesh` / `Nilesh_Gamer`) so you can test all bot features immediately!

---

## 🔑 Firebase Setup (Google Sign-In & Firestore)

To enable real Google authentication and cloud profile saving:

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In **Build > Authentication**:
   - Enable **Google** sign-in provider.
3. In **Build > Firestore Database**:
   - Click **Create Database** (Start in Test mode or production mode with user-only read/write rules).
4. In **Project Settings (General)**:
   - Under "Your apps", click the **Web (</>)** icon to register a web app.
   - Copy your `firebaseConfig` credentials.
5. Create a `client/.env` file (or copy `client/.env.example`):
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-app
   VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_BACKEND_URL=http://localhost:3001
   ```

---

## ☁️ Deploying to Oracle Cloud Free Tier (24/7 Always Online)

Oracle Cloud provides an **Always Free** VM (Ampere ARM up to 4 OCPU / 24 GB RAM or AMD 1 GB RAM) which is 100% free and never turns off.

### Step 1: Create Oracle Cloud VM
1. Go to [Oracle Cloud Console](https://cloud.oracle.com/) and create an instance:
   - Image: **Ubuntu 22.04 or 24.04 Minimal**
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM, 1-2 OCPU, 6-12 GB RAM) or **VM.Standard.E2.1.Micro** (AMD).
   - Save your SSH private key.

### Step 2: Open Ports in Oracle Cloud Network
1. In Oracle Cloud, go to **Networking > Virtual Cloud Networks > your-vcn > Security Lists > Default Security List**.
2. Click **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - Destination Port Range: `3001` (or `80,443,3001`)
   - Protocol: `TCP`

### Step 3: Install Docker on the VM
SSH into your Oracle VM:
```bash
ssh -i your_key.key ubuntu@<YOUR_ORACLE_VM_PUBLIC_IP>
```

Install Docker & Docker Compose:
```bash
sudo apt update && sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER
newgrp docker
```

Also allow port 3001 through Ubuntu's firewall:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
```

### Step 4: Clone & Launch CraftBot
```bash
git clone <YOUR_REPO_URL> craftbot
cd craftbot

# Build and launch with Docker Compose
docker compose up -d --build
```

Now open `http://<YOUR_ORACLE_VM_PUBLIC_IP>:3001` in your browser!

---

## 🎮 In-Game Commands Reference

When logged in, your bot will only accept commands from your verified **Owner IGN**:

| Command | Description |
| :--- | :--- |
| `!leave` or `/msg <bot> leave` | Forces the bot to cleanly leave and shut down. |
| `!follow` or `/msg <bot> follow` | Bot begins following your player using A* pathfinding. |
| `!stop` | Stops following and stays in place. |
| `!status` | Whispers back the bot's health, hunger, coordinates, and dimension. |
| `!drop` or `!dropall` | Drops all items currently held in the bot's inventory. |

---

## 🛠️ Project Structure

```
Minecraft Bot/
├── client/                     # React + Vite + Tailwind + Firebase UI
│   ├── src/
│   │   ├── components/
│   │   │   ├── landing/        # Minecraft-themed Hero, Features & Login
│   │   │   ├── onboarding/     # Display Name & Owner IGN Modal
│   │   │   └── dashboard/      # HUD, Live Chat, Inventory Grid, Controls
│   │   ├── firebase.ts         # Firebase Auth & Firestore client
│   │   ├── App.tsx             # Root Auth state router
│   │   └── index.css           # Custom Minecraft bevels & styles
├── server/                     # Node.js + TypeScript Mineflayer Daemon
│   ├── src/
│   │   ├── bot/
│   │   │   ├── BotInstance.ts  # Mineflayer lifecycle, chat, auto-eat, anti-afk
│   │   │   └── BotManager.ts   # Multi-user background bot process supervisor
│   │   └── index.ts            # Express + Socket.io Server
├── Dockerfile                  # Multi-stage production container
├── docker-compose.yml          # 24/7 background service for Oracle Cloud
└── package.json
```
