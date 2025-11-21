# AvenLab

AvenLab is a real-time vehicle simulation and ML engine powered by a Rust/Rappier physics core and a React Three Fiber frontend. It supports deterministic backend physics, multiplayer networking, dataset recording, and tools for autonomous control, reinforcement learning, and CAN-bus modeling.

Avenlab/
│
├── client/          # React Three Fiber frontend
├── server/          # Node.js + Rapier backend physics & multiplayer
├── shared/          # Shared types (TS), vehicle config, constants
│
├── models/          # .glb / .fbx vehicle models
├── maps/            # 3D environments (city, desert)
│
├── docs/            # Diagrams, design docs, specs
├── scripts/         # Dev tools, asset converters, stress tests
│
└── package.json

shared/
│
├── types/
│   ├── VehicleSnapshot.ts
│   ├── InputPacket.ts
│   ├── AbilityState.ts
│   ├── MatchConfig.ts
│   └── VehicleConfig.ts
│
├── constants/
│   ├── TICK_RATE.ts
│   ├── NET_INTERVAL.ts
│   └── VEHICLE_TYPES.ts
│
└── helpers/
    ├── math.ts
    └── smoothing.ts

server/
│
├── core/
│   ├── gameLoop.ts        # Runs at 60Hz or 120Hz
│   ├── physicsEngine.ts   # Rapier world, step simulation
│   ├── entities/          # Core objects in the physics world
│   │   ├── VehicleEntity.ts
│   │   ├── Player.ts
│   │   └── AbilityProjectile.ts
│   ├── match/
│   │   ├── RoomManager.ts
│   │   ├── MatchState.ts
│   │   └── SpawnSystem.ts
│   └── abilities/
│       ├── BaseAbility.ts
│       ├── EMPPulse.ts
│       ├── RamBoost.ts
│       └── DriftMode.ts
│
├── vehicles/
│   ├── BaseVehicle.ts
│   ├── Humvee.ts
│   ├── Tank.ts
│   ├── FRS.ts
│   ├── OverwatchCar.ts
│   └── configs/           # JSON or static TS config files
│       └── humveeConfig.ts
│
├── net/
│   ├── sockets.ts         # Socket.IO server
│   ├── messageTypes.ts
│   ├── interpolation.ts   # (for clients)
│   └── snapshots.ts
│
├── util/
│   ├── logger.ts
│   ├── throttledLoop.ts
│   └── uuid.ts
│
└── index.ts               # Server entrypoint

client/
│
├── src/
│   ├── net/               # WebSockets, state sync
│   │   ├── socket.ts
│   │   └── snapshotBuffer.ts
│   │
│   ├── state/             # Zustand global store
│   │   ├── gameState.ts
│   │   ├── vehicleState.ts
│   │   ├── uiState.ts
│   │   └── inputState.ts
│   │
│   ├── controllers/       # Gamepad, keyboard, touch
│   │   ├── GamepadController.ts
│   │   ├── KeyboardController.ts
│   │   └── TouchController.ts
│   │
│   ├── vehicles/          # Visuals only
│   │   ├── BaseVehicleRenderer.tsx
│   │   ├── HumveeRenderer.tsx
│   │   ├── TankRenderer.tsx
│   │   └── VehicleFactory.tsx
│   │
│   ├── scenes/
│   │   ├── MainMenu.tsx
│   │   ├── VehicleSelect.tsx
│   │   ├── ArenaScene.tsx
│   │   ├── CityScene.tsx
│   │   └── TrainingScene.tsx
│   │
│   ├── render/
│   │   ├── CameraController.tsx
│   │   ├── Lighting.tsx
│   │   ├── Effects.tsx
│   │   └── LoadEnvironment.tsx
│   │
│   ├── ui/
│   │   ├── HUD.tsx
│   │   ├── AbilityIcons.tsx
│   │   ├── HealthBar.tsx
│   │   └── Menu.tsx
│   │
│   ├── assets/
│   │   ├── models/        # Client-side .glb optimized models
│   │   ├── textures/
│   │   ├── sounds/
│   │   └── shaders/
│   │
│   └── App.tsx
│
└── package.json

# AvenLab  

### Real-Time Vehicle Simulation, Machine Learning, and Autonomous Systems Research Platform

AvenLab is a next-generation vehicle simulation and machine-learning engine designed for real-time physics, autonomous control, and multiplayer environments. Built with a modern architecture using a Rust-powered physics backend (Rappier), a React Three Fiber visualization frontend, and a modular networking layer, AvenLab enables high-performance experimentation across robotics, vehicle dynamics, and AI-driven behavior learning.

---

## 🔥 Core Features  

- **Real-Time Physics Engine** powered by Rappier  
- **Backend-Driven Simulation** for deterministic multiplayer  
- **Neural & ML Integration** for vehicle control, CAN-signal interpretation, and reinforcement learning  
- **Modular Architecture** supporting multiple vehicle types (cars, tanks, multi-axle platforms)  
- **High-Performance Visualization** using React Three Fiber  
- **Socket-Based Networking** for live state syncing  
- **Recording & Replay System** for dataset generation and training  
- **Self-Driving Research Tools** (future)

---

## 🎯 Project Goals  

- Develop a research-grade environment for vehicle dynamics  
- Explore adversarial ML for CAN bus interpretation and autonomous driving  
- Provide a flexible platform for physics-based multiplayer games  
- Support ML-based controllers and reinforcement learning  
- Build a translatable sim-to-real pipeline  

---

## 🗂 Tech Stack  

- **Backend Physics:** Rust + Rappier  
- **Frontend Visualization:** React Three Fiber  
- **Networking:** Socket.IO (with optional WebRTC)  
- **ML Pipeline:** Python, PyTorch, custom datasets  
- **Deployment:** Node.js, Vite, Nginx, Docker  

---

## 🌐 Demo  

Coming soon at **<https://avensky.com/avenlab>**

---

## 📄 License  

MIT License  
