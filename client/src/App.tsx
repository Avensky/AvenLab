// import { OrbitControls } from "@react-three/drei";
// import { OrbitControls, useGLTF } from "@react-three/drei";
// import { WorldRenderer } from "./components/WorldRenderer";
import { ModeSwitcher } from "./components/ModeSwitcher";
// import { useSnapshots } from "./hooks/useSnapshots";
import { usePlayerInput } from "./controls/usePlayerInput";
import { FullscreenCanvas } from "./layout/FullscreenCanvas";
// import { CityScene } from "./scenes/CityScene";
// import { HeightfieldGeneratorPanel } from "./tools/HeightfieldGeneratorPanel";
// import { CityHeightfield } from "./scenes/CityHeightfield";
// import { CityBuildingColliders } from "./scenes/CityBuildingColliders";
// import heightfieldJSON from '../../server/data/city-heightfield-v4.json'
// import { useSnapshotStore } from "./store/store";
// import { BuildingColliderExporter } from "./tools/BuildingColliderExporter";
// import { VehicleScene } from "./scenes/VehicleScene";
import { connectRustServer } from "./net/rustSocket";
// import { NetworkWorld } from "./scenes/NetworkWorld";
import { DebugOverlay } from "./ui/DebugOverlay";
// import { DebugVisualizer } from "./components/DebugVisualizer";
// import { GroundPlane } from "./scenes/GroundPlane";
import { useEffect } from 'react';
// import { useState, useEffect } from 'react';
// import { Canvas } from '@react-three/fiber'
// import { Layers } from 'three';
// import { levelLayer, useStore } from './store'
// import type { VehicleConfig, CanFrame, Snapshots } from './store'
// import { Pedals, Steering, ControlsPanel, Menu, Help, CommandLine, Dashboard } from './ui';
// import { Ae86, Camaro, Tank, TimesSquare, Rtx, Brz } from './models';
// import { GameScene, SelectionScreen, SelectionUI } from './components'
// import { Keyboard, HideMouse, GameController } from './controls';
// import { Cameras } from "./effects"
// import camera from '/images/camera4.svg'
// import socket from './socket';
import './App.css';
import { VehicleScene } from "./scenes/VehicleScene";
import { CityScene } from "./scenes/CityScene";
// import { useThrottledEmitControls } from './hooks/useThrottleEmitControls';
// import PlaybackControls from './ui/CommandLine/Playback/PlaybackControls';


export default function App() {

  // const [vehicleIndex, setVehicleIndex] = useState(0);
  // const [mapIndex, setMapIndex] = useState(0);

  // const screen = useSnapshotStore.getState().screen;
  // const playerId = useSnapshotStore.getState().playerId;
  // const menu = useSnapshotStore.getState().menu;

  // const vehicleOptions = [
  //   { type: '2015-scion-frs', name: 'FR-S', component: Brz },
  //   // { type: '2020-toyota-gt86', name: 'GT86', component: Gt86 },
  //   { type: '1986-toyota-ae86', name: 'AE86', component: Ae86 },
  //   { type: '2017-chevrolet-camaro', name: 'Camaro', component: Camaro },
  //   { type: 'tank', name: 'Tank', component: Tank },
  // ];

  // const mapOptions = [
  //   { type: 'rtx', name: 'Night Life', component: Rtx },
  //   { type: 'timesquare', name: 'Time Square', component: TimesSquare },
  // ];

  usePlayerInput(); // 
  useEffect(() => { connectRustServer(); }, []);


  return (
    <div className="canvas-wrapper">
      {/* overlays */}
      <ModeSwitcher />
      <DebugOverlay />

      {/* Canvas */}
      <FullscreenCanvas>
        {/* YOU */}
        <CityScene />
        <VehicleScene />
        {/* <DebugVisualizer /> */}

        {/* <Suspense fallback={null}>
          {screen === 'selection-screen' && (
            <SelectionScreen
              playerId={playerId}
              VehicleComponent={vehicleOptions[vehicleIndex].component}
              MapComponent={mapOptions[mapIndex].component}
            ><Cameras /></SelectionScreen>
          )}
          {screen === 'game-screen' && (
            <GameScene
              playerId={playerId!}
              VehicleComponent={vehicleOptions[vehicleIndex].component}
              MapComponent={mapOptions[mapIndex].component}
            ><Cameras /></GameScene>
          )}
        </Suspense> */}
        {/* <OrbitControls /> */}
      </FullscreenCanvas>

      {/* <GroundPlane /> */}

      {/* UI  */}
      {/* <div className="ui"> */}
        {/* <div className='ui-left'>
          <div className='ui-top flex'>
            {!menu && <button
              style={{ background: 'transparent', fontSize: '2rem' }}
              onClick={() => { }}
            >⚙️</button>}

            <PlaybackControls />
          </div>
          <div className='ui-bottom'>
            <CommandLine cmdEvents={cmdEvents} />
            <Steering />
          </div>
        </div> */}

        {/* <Dashboard /> */}
        {/* <div className='ui-center'> */}
          {/* {screen === 'selection-screen' && (
            <SelectionUI
              handleVehicleNext={() => setVehicleIndex((prev) => (prev + 1) % vehicleOptions.length)}
              handleVehiclePrev={() => setVehicleIndex((prev) => (prev - 1 + vehicleOptions.length) % vehicleOptions.length)}
              handleMapNext={() => setMapIndex((prev) => (prev + 1) % mapOptions.length)}
              handleMapPrev={() => setMapIndex((prev) => (prev - 1 + mapOptions.length) % mapOptions.length)}
              vehicleName={vehicleOptions[vehicleIndex].name}
              mapName={mapOptions[mapIndex].name}
              handleSpawn={() => {
                // const vehicle = vehicleOptions[vehicleIndex].type;
                // const map = mapOptions[mapIndex].type;
                // socket.emit('spawnPlayer', { vehicle, map });
                // useSnapshotStore.getState() to close menu
              }}
            />
          )} */}
        {/* </div> */}


        {/* <div className='ui-right'>
          <div className='ui-top flex'>
            <div className='flex items-start text-sm overflow-visible relative z-50 px-1 py-1'>

              <div className="control-wrapper live flex justify-center items-center">
                Live Can:
                <button
                  className={`control ${liveCan ? 'switch-on' : 'switch-off'}`}
                  onClick={toggleLiveCan}
                  style={{
                    backgroundColor: liveCan ? '#0f0' : '#333',
                    border: '2px solid #000',
                    borderRadius: '16px',
                    width: '50px',
                    height: '25px',
                    position: 'relative'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: liveCan ? '26px' : '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s'
                    }}
                  />
                </button>
              </div>
              <div className='cmd-control-wrapper opacity-50'>
                <button
                  onContextMenu={(e) => e.preventDefault()}
                  className={`cmd-control`}
                  style={{ backgroundImage: `url(${camera})` }}
                // onClick={() => }
                />
              </div>
            </div>
          </div> */}
          {/* <div className='ui-bottom'> */}
            {/* <ControlsPanel /> */}
            {/* <Pedals /> */}
          {/* </div> */}
        {/* </div> */}
      {/* </div> */}


      {/* <Menu
          onLeaveGame={() => {
            useStore.getState().set({ camera: 'GALLERY' });// 👈 set camera mode
            useStore.getState().set((state) => ({ booleans: { ...state.booleans, menu: false } }));// 👈 set menu mode
            useStore.getState().setRotatingCamera({ angle: 0 });
            useStore.getState().setScreen('selection-screen');
            useStore.getState().setPhysicsData(null);
            useStore.getState().setVehicleConfig(null);
            socket.emit('spawnPlayer', { reset: true });
          }}
        /> */}


      {/* <Help /> */}
      {/* <Keyboard /> */}
      {/* <GameController /> */}
      {/* <HideMouse /> */}

      {/* <HeightfieldGeneratorPanel /> */}
      {/* <BuildingColliderExporter /> */}
      {/* <Grid infiniteGrid args={[10, 10]} /> */}
      {/* OTHER PLAYERS */}
      {/* <NetworkWorld />          */}
      {/* {mode === "glb" && <CityScene />} */}
      {/* {mode === "geometry" && <CityHeightfield data={heightfieldJSON} />} */}
      {/* {mode === "collider" && <CityBuildingColliders glb={scene} />} */}
      {/* <WorldRenderer /> */}

    </div>
  );
}
