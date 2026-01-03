import React from 'react'
import { FuelTemp, Speedometer, Revolutions } from '.'
import { useStore } from '../../store'

export default function Dashboard(): React.JSX.Element {

  const vehicleConfig = useStore(state => state.vehicleConfig);
  const physicsData = useStore(state => state.physicsData);
  const controls = useStore(state => state.controls);
  const size = 100; // use for scaling entire dash

  // console.log('vehicleConfig', vehicleConfig)
  // console.log('physicsData', physicsData)
  if (!physicsData || !vehicleConfig || !controls) return <></>
  const engineOn = controls.engineOn;
  const { speed, rpm, fuel, temp, gear, engineStarting } = physicsData

  return (
    <div className="dashboard-wrapper">

      <div className='dashboard'>

        {/* Speedometer */}
        <div className='speedometer-wrapper'
          // overlap 15% into RPM
          style={{ marginRight: `-${size * 0.15}px`, }} >
          <Speedometer speed={speed} scale={size} maxSpeed={vehicleConfig.clusterSpeed} />
        </div>

        {/* Revolutions in center */}
        <div className='revolutions-wrapper'>
          <Revolutions engineOn={engineOn} speed={speed} scale={size * 1.1} value={rpm / 1000} gear={gear} />
        </div>

        {/* FuelTemp */}
        <div className='fuel-temp-wrapper'
          // overlap 15% into RPM
          style={{ marginLeft: `-${size * 0.15}px` }} >
          <FuelTemp engineStarting={engineStarting} engineOn={engineOn} size={size} fuel={fuel} temp={temp} vehicleConfig={vehicleConfig} />
        </div>
      </div>
    </div>
  )
}
