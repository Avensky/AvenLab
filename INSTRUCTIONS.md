# AVENLAB

```t
This is a vehicle reverse engineering app that uses AI concepts to facilitate the process of reverse engineering can bus logs
```

# 🚗 CANBUS HACKING CTF, TOOLKIT, AND SIMULATOR

```t
A curated collection of tools, scripts, and resources for automotive security research and CAN bus experimentation.

This project launches a 3D vehicle simulator where users can attempt code injections for points in a CTF.

When the fuel gauge reaches 0, the simulation ends and all gauges are reset.
```

---

## 📁 Project Structure

```t
Avenlab/
├── .github/
│    └── workflows/        # CICD yml files
│        ├── deploy.yml    # File runs when code is pushed 
│        └── init.yml      # File required to start the first workflow 
|
├── .vscode/
│    └── launch.json       # Code Editor
|
├── data-server/
│   ├── app/
│   │   ├── can/
│   │   │   ├── __init__.py
│   │   │   ├── capture.py 
│   │   │   ├── decoders.py
│   │   │   ├── session.py 
│   │   │   └── status.py    
│   │   ├── exports/
│   │   │   ├── __init__.py
│   │   │   ├── csv_export.py 
│   │   │   └── pdf_export.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── ollama_client.py
│   │   ├── __init__.py
│   │   ├── db.py
│   │   └── main.py
│   ├── db/
│   │   └── schema.sql    # Database
│   └── requirements.txt. # Install python files
|
├── docs/
│   ├── A CAN-Bus Lightweight Authentication Scheme.pdf
│   └── Vehicle Real-time Condition Monitoring Based on CA.pdf
|
├── frontend/
│   ├── public/
│   │   ├── images/
│   │   │   ├── abs.svg
│   │   │   ├── addfolder.svg
│   │   │   ├── air.svg
│   │   │   ├── air2.svg
│   │   │   ├── airbag.svg
│   │   │   ├── airhorn.svg
│   │   │   ├── alert.svg
│   │   │   ├── alert.svg
│   │   │   ├── analytics.svg
│   │   │   ├── analytics2.svg
│   │   │   ├── analytics3.svg
│   │   │   ├── analytics4.svg
│   │   │   ├── analytics5.svg
│   │   │   ├── analytics6.svg
│   │   │   ├── analytics7.svg
│   │   │   ├── analytics8.svg
│   │   │   ├── analytics9.svg
│   │   │   ├── arrow-square-down.svg
│   │   │   ├── arrow-square-left.svg
│   │   │   ├── arrow-square-right.svg
│   │   │   ├── arrow-square-up.svg
│   │   │   ├── arrowdown.svg
│   │   │   ├── arrowright.svg
│   │   │   ├── arrowup.svg
│   │   │   ├── back.svg
│   │   │   ├── backward.svg
│   │   │   ├── biohazzard.svg
│   │   │   ├── books.svg
│   │   │   ├── books2.svg
│   │   │   ├── brakepedal.png
│   │   │   ├── camera.svg
│   │   │   ├── camera2.svg
│   │   │   ├── camera3.svg
│   │   │   ├── camera4.svg
│   │   │   ├── camera5.svg
│   │   │   ├── camera6.svg
│   │   │   ├── camera7.svg
│   │   │   ├── camera8.svg
│   │   │   ├── camera9.svg
│   │   │   ├── car-battery.svg
│   │   │   ├── car-limousine.svg
│   │   │   ├── car-mini.svg
│   │   │   ├── car-oil.svg
│   │   │   ├── car-sport.svg
│   │   │   ├── car-sport2.svg
│   │   │   ├── car.svg
│   │   │   ├── carDoor.svg
│   │   │   ├── caret-back.svg
│   │   │   ├── caret-down.svg
│   │   │   ├── caret-down2.svg
│   │   │   ├── caret-forward.svg
│   │   │   ├── caret-left.svg
│   │   │   ├── caret-right.svg
│   │   │   ├── caret-up.svg
│   │   │   ├── caret-up2.svg
│   │   │   ├── carKey.svg
│   │   │   ├── carLights.svg
│   │   │   ├── cassette.svg
│   │   │   ├── clear-circle.svg
│   │   │   ├── clear-reflect.svg
│   │   │   ├── clear.svg
│   │   │   ├── clear2.svg
│   │   │   ├── cli.svg
│   │   │   ├── cli2.svg
│   │   │   ├── cli3.svg
│   │   │   ├── cli4.svg
│   │   │   ├── cli5.svg
│   │   │   ├── cli6.svg
│   │   │   ├── cpu.svg
│   │   │   ├── csv.svg
│   │   │   ├── engine-coolant.svg
│   │   │   ├── engine.svg
│   │   │   ├── engine2.svg
│   │   │   ├── engine3.svg
│   │   │   ├── exclamation-warning.svg
│   │   │   ├── files.svg
│   │   │   ├── film.svg
│   │   │   ├── film2.svg
│   │   │   ├── forward.svg
│   │   │   ├── game-controller.svg
│   │   │   ├── gas-station.svg
│   │   │   ├── gasPedal.png
│   │   │   ├── gasStation.svg
│   │   │   ├── gasStation2.svg
│   │   │   ├── gear-shift-stick.svg
│   │   │   ├── gear-shift-stick2.svg
│   │   │   ├── gear-shift-pattern.svg
│   │   │   ├── gear-stick.svg
│   │   │   ├── gift.svg
│   │   │   ├── graph.svg
│   │   │   ├── graph2.svg
│   │   │   ├── graph3.svg
│   │   │   ├── hazard.svg
│   │   │   ├── hazard2.svg
│   │   │   ├── hazards.svg
│   │   │   ├── hazzard.svg
│   │   │   ├── headlight.svg
│   │   │   ├── headlight2.svg
│   │   │   ├── headlight3.svg
│   │   │   ├── headlights.svg
│   │   │   ├── headlights2.svg
│   │   │   ├── hide.svg
│   │   │   ├── hood.svg
│   │   │   ├── horn.svg
│   │   │   ├── hornCurve.svg
│   │   │   ├── i.svg
│   │   │   ├── idea.svg
│   │   │   ├── left-arrow.svg
│   │   │   ├── left.svg
│   │   │   ├── linux.svg
│   │   │   ├── log.svg
│   │   │   ├── log2.svg
│   │   │   ├── logo.png
│   │   │   ├── logs.svg
│   │   │   ├── loop.svg
│   │   │   ├── mark.svg
│   │   │   ├── mark2.svg
│   │   │   ├── mark3.svg
│   │   │   ├── microphone.svg
│   │   │   ├── niwc.jpg
│   │   │   ├── niwc2.jpg
│   │   │   ├── niwc3.png
│   │   │   ├── no_sound.png
│   │   │   ├── noGas.svg
│   │   │   ├── nos.svg
│   │   │   ├── oil.svg
│   │   │   ├── onOff.svg
│   │   │   ├── p.svg
│   │   │   ├── parking.svg
│   │   │   ├── pause.svg
│   │   │   ├── pause2.svg
│   │   │   ├── pause3.svg
│   │   │   ├── play-circle.svg
│   │   │   ├── play.svg
│   │   │   ├── playback.svg
│   │   │   ├── reload-ui.svg
│   │   │   ├── reload.svg
│   │   │   ├── reload2.svg
│   │   │   ├── reload3.svg
│   │   │   ├── reload4.svg
│   │   │   ├── remoteKeys.svg
│   │   │   ├── reset.svg
│   │   │   ├── rewind.svg
│   │   │   ├── right-arrow.svg
│   │   │   ├── right.svg
│   │   │   ├── save.svg
│   │   │   ├── SEASTRIKE-2043.png
│   │   │   ├── seat-belt.svg
│   │   │   ├── seatBelt.svg
│   │   │   ├── settings.svg
│   │   │   ├── skip.svg
│   │   │   ├── soundLow2.svg
│   │   │   ├── soundOff.svg
│   │   │   ├── soundOff2.svg
│   │   │   ├── soundOn.svg
│   │   │   ├── soundOn2.svg
│   │   │   ├── spave.png
│   │   │   ├── speedometer.svg
│   │   │   ├── sql.svg
│   │   │   ├── stop-circle.svg
│   │   │   ├── stop.svg
│   │   │   ├── stop2.svg
│   │   │   ├── stop3.svg
│   │   │   ├── stop4.svg
│   │   │   ├── temp.svg
│   │   │   ├── temp2.svg
│   │   │   ├── tempCold.svg
│   │   │   ├── temperature.svg
│   │   │   ├── tempHot.svg
│   │   │   ├── tempHot2.svg
│   │   │   ├── tools.svg
│   │   │   ├── trunk.svg
│   │   │   ├── turbo.svg
│   │   │   ├── tv.svg
│   │   │   ├── tv2.svg
│   │   │   ├── upload.svg
│   │   │   ├── voice.svg
│   │   │   ├── volumeFull.svg
│   │   │   ├── volumeMedium.svg
│   │   │   ├── volumeOff.svg
│   │   │   ├── windshield.svg
│   │   │   ├── wretch.svg
│   │   │   └── zip.svg    
│   │   ├── models/
│   │   │   ├── blocks/
│   │   │   │   └── block_01/
│   │   │   │       └── block_01.glb
│   │   │   ├── roads/
│   │   │   │   ├── intersection.glb
│   │   │   │   ├── road_narrow.glb
│   │   │   │   └── road_wide.glb
│   │   │   ├── vehicles/
│   │   │   │   ├── ae86.glb
│   │   │   │   ├── brz.glb
│   │   │   │   ├── camaro.glb
│   │   │   │   ├── camaro2017.glb
│   │   │   │   ├── frs.glb
│   │   │   │   ├── gt86.glb
│   │   │   │   ├── tank.glb
│   │   │   │   └── tank2.glb
│   │   │   ├── world/
│   │   │   │  ├── city_rtx.glb
│   │   │   │  ├── city_time_square.glb
│   │   │   │  └── city.glb
│   │   ├── sounds/
│   │   │   ├── accelerate.mp3
│   │   │   ├── boost.mp3
│   │   │   ├── car_start.mp3
│   │   │   ├── crash.mp3
│   │   │   ├── engine.mp3
│   │   │   ├── honk.mp3
│   │   │   ├── tire-brake.mp3
│   │   │   └── water.mp3
│   │   ├── videos/
│   │   |   ├── NIWC-Pacific.mp4
│   │   |   └── SEA-STRIKE-2043.mp4
│   │   ├── favicon.ico
│   │   └── vite.svg
│   ├── src/
│   │   ├── controls/
│   │   |   ├── GameController.ts
│   │   |   ├── HideMouse.ts
│   │   |   ├── index.ts
│   │   |   └── Keyboard.ts
│   │   ├── effects/
│   │   │   ├── audio/
│   │   │   │   ├── Accelerate.tsx
│   │   │   │   ├── Boost.tsx
│   │   │   │   ├── Brake.tsx
│   │   │   │   ├── Engine.tsx
│   │   │   │   ├── Honk.tsx
│   │   │   │   └── index.tsx
│   │   │   ├── Boost.tsx
│   │   │   ├── Cameras.tsx
│   │   │   ├── Dust.tsx
│   │   │   ├── index.ts
│   │   │   ├── RotatingCamera.tsx
│   │   │   ├── Skid.tsx
│   │   │   └── VehicleRotatingCamera.ts
│   │   ├── game/
│   │   │   ├── modes/
│   │   │   │   ├──tools/
│   │   │   │   │   └──FirstFrameReady.ts
│   │   │   │   ├── CanBusStatusBadge.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   ├── SandBox.tsx
│   │   │   │   ├── SandBoxSetup.tsx
│   │   │   │   ├── SignalSetup.tsx
│   │   │   │   ├── SignalRecon.tsx
│   │   │   │   ├── SignalReconMission.tsx
│   │   │   │   ├── SignalReconSetup.tsx
│   │   │   │   └── Swarm.tsx
│   │   │   ├── preview/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── VehiclePreview.tsx
│   │   │   │   └── VehiclePreviewModel.tsx
│   │   │   ├── GameScene.tsx
│   │   │   ├── GameUI.tsx
│   │   │   ├── index.ts
│   │   │   ├── LoadingScreen.tsx
│   │   │   ├── MainMenu.tsx
│   │   │   ├── ModeLoadingScreen.tsx
│   │   │   ├── ModeSwitcher.tsx
│   │   │   ├── PauseMenu.tsx
│   │   │   ├── SelectionScreen.tsx
│   │   │   └── SelectionUI.tsx
│   │   ├── hooks/
│   │   │   └── usePhysicsInterpolator.ts
│   │   ├── net/
│   │   │   └── rustSocket.tsx
│   │   ├── store/
│   │   │   ├── tools/
│   │   │   │   ├── DebugMasks.ts
│   │   │   │   ├── derriveInputSignals.ts
│   │   │   │   ├── inputMasks.ts
│   │   │   │   └── inputSender.ts
│   │   │   ├── types/
│   │   │   │   └── signalSender.ts
│   │   │   ├── canBusStore.ts
│   │   │   ├── canDataStore.ts
│   │   │   ├── gameStore.ts
│   │   │   ├── index.ts
│   │   │   ├── inputStore.ts
│   │   │   ├── networkStore.ts
│   │   │   ├── selectionStore.ts
│   │   │   ├── signalReconStore.ts
│   │   │   ├── types.ts
│   │   │   ├── uiStore.ts
│   │   │   └── worldStore.ts
│   │   ├── ui/
│   │   │   ├── command/
│   │   │   │   └── CommandLine.tsx
│   │   │   ├── Commandline/
│   │   │   │   ├── Playback/
│   │   │   │   ├── Sessions/
│   │   │   │   ├── CommandLine.tsx
│   │   │   │   └── ViewSummary.tsx
│   │   │   ├── Dashboard/
│   │   │   │   ├── Boost.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── FuelGauge.tsx
│   │   │   │   ├── FuelTemp.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   ├── Revolutions.tsx
│   │   │   │   ├── Speedometer.tsx
│   │   │   │   └── TempGauge.tsx
│   │   │   ├── ControlPanel.tsx
│   │   │   ├── DebugOverlay.tsx
│   │   │   ├── Editor.ts
│   │   │   ├── Help.tsx
│   │   │   ├── index.ts
│   │   │   ├── Intro.ts
│   │   │   ├── Keys.tsx
│   │   │   ├── Menu.tsx
│   │   │   ├── Minimap.tsx
│   │   │   ├── Pedals.tsx
│   │   │   ├── PickColor.tsx
│   │   │   └── Steering.tsx
│   │   ├── utils/
│   │   │   └── constants.ts
│   │   ├── vehicles/
│   │   │   ├── tools/
│   │   │   │   ├── addSpot.ts
│   │   │   │   ├── createGlassMaterialFactory.ts
│   │   │   │   ├── getTankParts.tsx
│   │   │   │   ├── setupVehicleParts.tsx
│   │   │   │   └── VehicleSpotLight.tsx
│   │   │   ├── Ae86.tsx
│   │   │   ├── Brz.tsx
│   │   │   ├── Camaro.tsx
│   │   │   ├── GeometryVisualizer.tsx
│   │   │   ├── Gt86.tsx
│   │   │   ├── index.ts
│   │   │   ├── Tank.tsx
│   │   │   └── VehicleScene.tsx
│   │   ├── world/
│   │   │   ├── environments/
│   │   │   │   ├── index.ts
│   │   │   │   ├── Rtx.tsx
│   │   │   │   └── TimeSquare.tsx
│   │   │   ├── BlueTeamBaseGround.tsx
│   │   │   ├── CityChunk.tsx
│   │   │   ├── CityGeometry.tsx
│   │   │   ├── CityScene.tsx
│   │   │   └── index.ts
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── FullCanvas.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── README.md
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
│
├── physics-server
│   ├── src/                  
│   │   ├── assets/                  
│   │   │   └── blocks                 
│   │   │      └── block_01_collidrs.json                  
│   │   ├── aven_tire/                 
│   │   │   ├── anti_roll.rs              
│   │   │   ├── brush_lite.rs              
│   │   │   ├── kinematics.rs              
│   │   │   ├── longitudinal.rs              
│   │   │   ├── mod.rs              
│   │   │   ├── solve.rs              
│   │   │   ├── state.rs              
│   │   │   ├── steering.rs              
│   │   │   └── types.rs               
│   │   ├── world/                 
│   │   │   ├── block_colliders.rs              
│   │   │   └── mod.rs               
│   │   ├── main.rs                 
│   │   ├── net.rs                 
│   │   ├── physics_blocks.rs                
│   │   ├── physics.rs                 
│   │   ├── spawn.rs                 
│   │   ├── state.rs                 
│   │   ├── suspension_contact.rs                
│   │   ├── vehicle_debug.rs                 
│   │   ├── vehicle_forces.rs                 
│   │   ├── vehicle_setup.rs                 
│   │   └── vehicle_state.rs                 
│   ├── target/             
│   ├── Cargo.lock            
│   └── Cargo.toml                    
│
├── .gitattributes
├── .gitignore
├── .nvmrc
├── package-lock.json
├── package.json
└── README.md
```

---

## 🧰 Tools & Scripts

This repository includes various tools and scripts designed to assist in car hacking endeavors:

- **CAN Bus Sniffers**: Utilities to monitor and log CAN traffic.
- **Message Injectors**: Scripts to send custom messages onto the CAN bus.
- **Hack Car**: Script simulates a code injection, manipulating the vehicle gauges, and movements.
- **Command Line**: Command line allows for unique code injection from a browser.
- **Diagnostic Tools**: Programs to interact with vehicle ECUs using standard protocols.

*Note: Ensure you have the necessary permissions and are compliant with local laws before interacting with vehicle networks.*

---

## 📝 Documentation

The `docs/` directory contains valuable resources to deepen your understanding of automotive security:

- **Research Papers**: In-depth analyses of vehicle network vulnerabilities.
- **Presentations**: Slides from conferences and workshops on car hacking.
- **Guides**: Step-by-step instructions for setting up your own car hacking lab.

---

## 📌 Prerequisites

Before using the tools, ensure you have:

- **Hardware**: A compatible CAN interface device (e.g. Raspberry Pi / Jetson)
- **Software**: Python 3.x installed on your system.
- **Permissions**: Appropriate rights to interact with vehicle networks.

## 🚀 Getting Started

To begin using the tools in this repository:

1. **Set Up Your Environment**: Ensure you have the necessary hardware (e.g., CAN interface devices) and software dependencies installed.

# 🐧 Flashing Raspberry Pi OS (Raspbian) on a Raspberry Pi

This guide walks you through flashing **Raspberry Pi OS** (formerly Raspbian) onto a microSD card and booting it on your Raspberry Pi.

---

## ✅ Requirements

- 🧠 A **Raspberry Pi** (any model)
- 💾 A **microSD card** (8GB+ recommended, Class 10/UHS-1)
- 💻 A computer with **internet access & microSD card reader or usb for mircroSD adapter**
- 🔌 A **power supply** for the Pi
- ⌨️ (Optional) Keyboard, mouse, and HDMI display

---

## 🔧 Step-by-Step Instructions

### 🥇 Step 1: Download Raspberry Pi Imager

1. Visit: [https://www.raspberrypi.com/software](https://www.raspberrypi.com/software)
2. Download and install the **Raspberry Pi Imager** for your OS (Windows/macOS/Linux)

---

### 🥈 Step 2: Insert and Select Your microSD Card

1. Insert your microSD card into your computer
2. Open **Raspberry Pi Imager**
3. Click **“Choose OS”** and select one:
   - `Raspberry Pi OS (32-bit)` (Recommended)
   - `Raspberry Pi OS Lite` (for headless setup, no GUI)

---

### 🛠️ Step 3: Configure (Optional)

Click the ⚙️ icon in the Imager to:

- Set a **hostname**
- Enable **SSH**
- Set **Wi-Fi SSID/password**
- Set **locale/timezone/keyboard**
- Create a **user account**

> ⚠️ These options save time if you're setting up a headless system.

---

### 🥉 Step 4: Flash the OS

1. Click **“Choose Storage”** → Select your SD card (Accept Updates)
2. Click **“Write”** → Wait for the flashing process to finish
3. Safely **eject** the card

---

### 🚀 Step 5: Boot the Raspberry Pi

1. Insert the flashed SD card into your Raspberry Pi
2. Plug in HDMI, keyboard, mouse, and power
3. Raspberry Pi OS will boot into the desktop or CLI

---

## 🧠 Optional: SSH & Wi-Fi (Headless Setup)

If you're not using a monitor/keyboard:

### Enable SSH

Create a blank file named `ssh` (no extension) on the **boot** partition.

### Connect to Wi-Fi

Create a file called `wpa_supplicant.conf` (in boot partition):

```bash
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
ssid="YourWiFiName"
psk="YourWiFiPassword"
}
```

Then boot the Pi and connect via:

```bash
ssh uri@<IP_ADDRESS>
or 

ssh -o IPQoS=throughput uri@<your-ip-address>
```

### Save a Key Fingerprint

Type your password and save key to your list of known hosts.

🛠 First-Time Setup Commands
Open config menu:

```bash
  sudo raspi-config
```

Update the system:

```bash
  sudo apt update && sudo apt full-upgrade -y
```

📝 Notes
Default login (if using desktop OS):

Username: pi

Password: raspberry

Use a good-quality SD card and power supply for stability

## Set Up Environment Variables

```bash
  nano ~/.bashrc
```

## Add This to Bottom of File

```s
  export NODE_ENV=production
  export PORT=5000
  export IP=<your ip goes here>
```

## Apply it Immediately (without reboot)

```bash
  source ~/.bashrc
```

## ✅ Install `nvm`

Open your terminal and run:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

> This command downloads and runs the official install script from the `nvm-sh` GitHub repo.

---

## 🔄 Step 2: Activate `nvm`

```bash
\. "$HOME/.nvm/nvm.sh"
```

## 🔍 Step 3: Verify Installation

```bash
nvm --version
```

---

## 🚀 Step 4: Install Node.js with `nvm`

```bash
nvm install 24.18.0      # Specific version
nvm use 24.18.0          # Switch to version 
```

## Set a default version:S

```bash
nvm alias default 24.18.0
```

---

<!-- ## Set Up Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh && sudo usermod -aG docker $USER && sudo apt-get install -y docker-compose-plugin

newgrp docker

sudo apt-get install postgresql-client

``` -->

---

## 🚗 Set Up Virtual CAN Bus

```bash
sudo apt-get install can-utils
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

---

# 🚀 CI/CD Pipeline Setup for Aversarial-Machine-Learning-Vehicle-Framework (GitHub Actions + Self-Hosted Runner)

This guide explains how to set up a **self-hosted GitHub Actions runner** for deploying the (<https://github.com/Avensky/Aversarial-Machine-Learning-Vehicle-Framework>) project using CI/CD on a Raspberry Pi or ARM64 device.

---

## 🔁 1. Clone the Repository and Prepare the Environment

```bash
# Create a directory recognized by Nginx
sudo mkdir -p /var/www/
cd /var/www/

# Set correct ownership and permissions
sudo chown -R $USER:$USER /var/www
sudo chmod -R 755 /var/www
```

---

## 🍴 2. Fork the Repository

- Go to: <https://github.com/Avensky/AvenLab>
- Click **Fork** and clone your forked version if needed.

---

## 🏃 3. Set Up a GitHub Self-Hosted Runner

1. Go to your fork on GitHub → **Settings** → **Actions** → **Runners**
2. Click **New self-hosted runner**
3. Choose:
   - OS: Linux
   - Architecture: ARM64 (for Raspberry Pi)
4. Follow the instructions (skip directory creation since we already did that - you should be in this directory /var/www)

---

## 📦 4. Download and Configure the Runner

Replace with the latest version from GitHub’s runner releases page (commenting out this section to avoid copy and paste, follow github's instructions):

```bash
# Download the runner ie:
# curl -o actions-runner-linux-arm64-2.324.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.324.0/actions-runner-linux-arm64-2.324.0.tar.gz

# Verify integrity

# Extract the runner
# tar xzf ./actions-runner-linux-arm64-2.324.0.tar.gz
```

---

## ⚙️ 5. Configure the Runner

```bash


# Replace the token with your actual GitHub token
# ./config.sh --url https://github.com/<your-username>/Aversarial-Machine-Learning-Vehicle-Framework --token YOUR_TOKEN_HERE
```

> 🧠 During this step, you’ll name the runner and accept default prompts.

---

## ▶️ 6. Run the Runner

```bash
# Run manually
./run.sh
```

---

## 🛠 7. Install as a Service (Recommended)

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

---

## ✅ Done

Your GitHub Actions runner is now connected. Any workflow `.yml` files you add to `.github/workflows/` in your repo will now execute using this runner.

---

# 🚀 Manually Triggering Initial GitHub Actions Workflow

After setting up your **self-hosted GitHub Actions runner**, you need to manually trigger the first workflow to verify the runner and kick off the deployment pipeline.

---

## 📂 Workflow File: `init.yml`

Your workflow uses:

```yaml
on:
  workflow_dispatch:
```

This enables **manual triggering** from the GitHub web interface.

---

## 🧭 How to Manually Trigger the Workflow

1. Go to your **GitHub repository** (your fork).
2. Click the **"Actions"** tab.
3. In the left sidebar, select **"Inital Deployment"** (or whatever you named the workflow).
4. Click the **"Run workflow"** dropdown.
5. Choose the branch (e.g., `main`), and click **"Run workflow"**.

> This will run the full pipeline on your **self-hosted runner**, executing the `backend`, `frontend`, and `build` jobs.

---

## 🧪 What Happens in the Workflow

The workflow performs these steps across 3 jobs:

### 🔧 `backend` job

- Checks out code
- Sets up Node.js
- Caches `node_modules`
- Installs dependencies
- Lints and tests backend

### 🎨 `frontend` job

- Waits for `backend` to finish
- Repeats setup and linting steps for frontend code

### 🏗 `build` job

- Waits for `frontend`
- Builds the production frontend with `npm run build`

---

✅ Once complete, the runner should have tested, linted, and built your app for deployment.

# 🌐 Install and Configure NGINX with PM2

This guide walks you through installing **PM2** and **NGINX** on a Raspberry Pi to persist and proxy a Node.js backend using GitHub Actions and virtual CAN bus.

---

## 🔧 Install PM2 for Persistent Ollama Server

pm2 start "ollama serve" --name Ollama

## 🔧 Install PM2 for Persistent Node Server

Verify your server runs then close it.

```bash
node /var/www/AMLVF/_work/Aversarial-Machine-Learning-Vehicle-Framework/Aversarial-Machine-Learning-Vehicle-Framework/server.js
```

Install pm2

```bash
npm install -g pm2
pm2 start /var/www/AMLVF/_work/Aversarial-Machine-Learning-Vehicle-Framework/Aversarial-Machine-Learning-Vehicle-Framework/server.js --name AMLVF
pm2 startup
```

## copy the startup script and run it - looks similar to this

```bash
# sudo env PATH=$PATH:/home/pi/.nvm/versions/node/v24.1.0/bin \
#     /home/pi/.nvm/versions/node/v24.1.0/lib/node_modules/pm2/bin/pm2 \ startup systemd -u pi --hp /home/pi

pm2 save
```

---

## 🌍 Install NGINX (Reverse Proxy for Frontend + API)

```bash
sudo apt update
sudo apt install nginx
```

---

## 🗂 Set Up Server Directory Permissions

```bash
sudo chown -R $USER:$USER /var/www/AMLVF
sudo chmod -R 755 /var/www/AMLVF
sudo chown -R $USER:$USER /var/www/AMLVF/_work/Aversarial-Machine-Learning-Vehicle-Framework/Aversarial-Machine-Learning-Vehicle-Framework/frontend/dist
sudo chmod -R 777 /var/www/AMLVF
```

---

## 📝 Configure NGINX Site

Edit the NGINX site configuration:

```bash
sudo nano /etc/nginx/sites-available/AMLVF
```

```t
server {
  listen 80;
  listen [::]:80;

  root /var/www/AMLVF/_work/Aversarial-Machine-Learning-Vehicle-Framework/Aversarial-Machine-Learning-Vehicle-Framework/frontend/dist;
  index index.html index.htm index.nginx-debian.html;

  server_name _;

  location / {
    try_files $uri $uri/ =404;
  }

  location /api {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_buffers 8 16k;
    proxy_buffer_size 32k;
  }

  location /socket.io/ {
    proxy_pass http://localhost:5000/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

Enable the site and tweak NGINX settings:

```bash
sudo ln -s /etc/nginx/sites-available/AMLVF /etc/nginx/sites-enabled/
sudo nano /etc/nginx/nginx.conf
```

In the `http` block, ensure:

```s
server_names_hash_bucket_size 64;
```

---

## 🔁 Remove Default, Test, and Restart NGINX

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔄 Recovery After Restart / IP Change

## Create Startup Script to Account For Ip Change

```bash
sudo nano /usr/local/bin/startup.sh
```

## Paste, Save & exit

```t
#!/bin/bash

echo "Starting AMLVF service..."
cd /var/www/AMLVF
sudo ./svc.sh start

echo "Checking for vcan0..."
if ! ip link show vcan0 &> /dev/null; then
  echo "vcan0 does not exist. Creating..."
  sudo ip link add dev vcan0 type vcan
  sudo ip link set up vcan0
else
  echo "vcan0 already exists."
fi
```

## make it executable

```bash
  sudo chmod +x /usr/local/bin/startup.sh
```

## Run it automatically on boot

```bash
sudo nano /etc/systemd/system/AMLVF.service
```

## Edit to use your username, Copy, Paste, Save

```t
[Unit]
Description=AMLVF Startup with VCAN Check
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/AMLVF
ExecStart=/bin/bash /usr/local/bin/startup.sh
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

## Reload, Enable, And Test

```bash
sudo systemctl daemon-reload
sudo systemctl enable AMLVF.service
sudo systemctl start AMLVF.service
sudo systemctl status AMLVF.service
```

# Manual Recovery From IP Change

### 1. Restart GitHub Actions Runner

```bash
cd /var/www/AMLVF
sudo ./svc.sh start
```

### 2. Restart Virtual CAN Bus

```bash
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

### 3. Restart PM2 Server

```bash
pm2 restart 0
```

---

## 🌐 Recover From IP Address Change

### Stop server

```bash
pm2 stop 0
```

### Find your new IP

```bash
hostname -I
```

### Update `server_name` in NGINX config

```bash
sudo nano /etc/nginx/sites-available/AMLVF
```

Update server_name or use server_name _;

```s
server_name <new.ip.address>;
```

### Restart NGINX

```bash
sudo nginx -t
sudo service nginx restart
```

---

# 🤝 Contributing

Contributions are welcome! If you have tools, scripts, or documentation to add:

1. **Fork the Repository**

2. **Create a New Branch**:

```bash
  git checkout -b feature/your-feature-name
```

1. **Commit Your Changes**:

```bash
  git commit -m "Add your feature"
```

1. **Push to Your Fork**:

```bash
  git push origin
```

1. **Create a Pull Request**

Please ensure your contributions adhere to the project's coding standards and include appropriate documentation.

---

## 📬 Contact

For questions, suggestions, or collaborations, please open an issue or contact [Avensky](https://github.com/Avensky).

# Acknowledgements

Project concept and execution inspired by rhysmorgan134/Can-App

Frontend inspired by Domenicobrz/R3F-in-practice

T-90M 3D model
"T-90M (With interior) [FREE]" (<https://skfb.ly/oWGUu>) by DerpDude is licensed under Creative Commons Attribution (<http://creativecommons.org/licenses/by/4.0/>).

Panzer II model
"Panzer II (Pz.Kpfw. II)" (<https://skfb.ly/oTOqy>) by vmatthew is licensed under Creative Commons Attribution (<http://creativecommons.org/licenses/by/4.0/>).

## TODO

REMOVE GIMMICKY BUTTON LOGIC, ONLY USE BUTTONS WHEN WE
WANT THEM TO BE TABBED/ ACCESSSIBLE

INTERMEDIATE FIX, MAKE GAME FULLY GAMEPAD ACCESSABLE TO AVOID KEYBOARD ISSUES

MIX OF UI BUTTONS WITH KEYBOARD CAN HAVE MANY UNWANTED CONSEQUENCES

CREATE A REUSABLE DIV TO ACT LIKE A BUTTON

```s
export function AccessibleButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode,
  onClick: () => void,
  className?: string,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={className}
    >
      {children}
    </div>
  )
}

```

✅ What’s going on:

Attribute Purpose
role="button" Tells screen readers “this acts like a button”
tabIndex={0} Makes it keyboard focusable
onKeyDown Allows Enter/Space to “click” the div
e.preventDefault() Stops Spacebar from scrolling the page

connect waveshare board to pi

connect pigtail to pi

ensure you have enough voltage converter to handle pi
get a nice thick cable thats 3m or less, the shorter the better

🔌 OBD-II (J1962) Port Pinout
  ________________________

/  1  2  3  4  5  6  7  8  \
|   9 10 11 12 13 14 15 16  |
 ---------------------------

🔌 OBD-II Pigtail to Pi HAT
OBD-II Pigtail Wire Waveshare HAT Screw Terminal
Pin 6 → (CAN High) CANH (Channel 1 or 2, you choose)
Pin 14 → (CAN Low) CANL (same channel)
Pin 4 (or 5) → (Ground) GND on the Pi (optional but recommended for clean signal)
Your HAT has two channels — pick one!
E.g. CAN0 = Channel 1 → use CANH0 and CANL0 terminals.

## plug into car

while engine is completely off
connect power cord
connect pi to obd2 port

turn the ignitions
open conenction

```s
sudo modprobe can
sudo modprobe can_raw
sudo modprobe mcp251x
sudo ip link set can0 up type can bitrate 500000
ip link show can0
```

sudo nano /boot/firmware/config.txt

Add these lines at the end (adjust your pins & oscillator if needed):

dtoverlay=mcp2515-can0,oscillator=16000000,interrupt=25
dtoverlay=mcp2515-can1,oscillator=16000000,interrupt=24

Verify spi is on
On pi desktop check Interface Options → SPI → Enable
dtparam=spi=on

Save & reboot
sudo reboot

ip link show
✅ If you see can0 or can1 → you’re good to go:
sudo ip link set can0 up type can bitrate 500000
sudo ip link set can0 up type can bitrate 500000 listen-only on
sudo ip link set can1 up type can bitrate 500000

Terminal 1
candump can0

Terminal 2
cansend can1 123#DEADBEEF

sudo nano /boot/firmware/config.txt
dtoverlay=mcp2515-can0,oscillator=16000000,interrupt=23
dtoverlay=spi-bcm2835-overlay
sudo reboot

## TODO

use a new physics engine that can handle drones planes ships and tanks

<!-- AFTER INSTALLING posgres database install wireshark in production

```bash
sudo apt update && sudo apt install wireshark -y
sudo usermod -aG wireshark $USER
newgrp wireshark
``` -->

updating schema
psql -U postgres -d amlvf -f docker/init/schema.sql

install llm
curl -fsSL <https://ollama.com/install.sh> | sh

uvicorn main:app --reload

# in the /python directory

source python/venv/bin/activate
uvicorn python/main:app --host 127.0.0.1 --port 8000 --reload
