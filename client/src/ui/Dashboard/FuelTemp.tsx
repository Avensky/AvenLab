
import React from 'react'
import type { VehicleConfig } from '../../store'
import { FuelGauge, TempGauge } from '.'

interface FuelTempProps {
  fuel: number // Expect fuel as a number
  temp: number // Expect temp as a number
  size: number
  engineOn: boolean
  engineStarting: boolean
  vehicleConfig: VehicleConfig
}
// export function FuelTemp({ fuel, temp }: FuelTempProps): JSX.Element {
export default function FuelTemp({ fuel, temp, size, engineOn, engineStarting, vehicleConfig }: FuelTempProps): React.JSX.Element {
  // console.log('Fuel', fuel)
  // console.log('FuelCapacity', fuelCapacity)

  // Ensure values are valid and within expected ranges
  // const safeFuel = isNaN(fuel) ? 0 : fuel;
  // const safeTemp = isNaN(temp) ? 100 : temp;

  // const clampedFuel = Math.max(-500, Math.min(0, safeFuel * -1));
  // const clampedTemp = Math.max(100, Math.min(280, safeTemp));

  // What is low fuel
  const fuelCapacity = vehicleConfig.fuelCapacity
  const lowFuel = fuelCapacity * .25;
  return (

    <div className='fuel-temp' style={{ width: size, height: size }}>


      {/* ⚡ Warning Icons */}
      {engineStarting && (
        <div className="warning-icons">
          <img src="/images/seat-belt.svg" className="warning-icon seat-belt cranking" />
          <span className="warning-text crimson brake cranking">BRAKE</span>
          <img src="/images/car-battery.svg" className="warning-icon battery cranking" />
          <img src="/images/car-oil.svg" className="warning-icon oil cranking" />
          <img src="/images/engine.svg" className="warning-icon engine cranking" />
          <img src="/images/steering.svg" className="warning-icon steering cranking" />
          <span className="warning-text orange steering-text cranking">!</span>
          <span className="warning-text orange engine-text cranking">CHECK</span>
          <span className="warning-text orange abs cranking">ABS</span>
        </div>
      )}

      {(fuel < lowFuel) && (<img src="/images/gas-station-low.svg" className="warning-icon low-fuel" />)}

      <div className='fuel-gauge-wrapper'>
        <FuelGauge
          fuel={fuel}
          fuelCapacity={fuelCapacity}
          scale={size * .75}
          engineOn={engineOn}
        />
      </div>
      <div className='temp-gauge-wrapper'>
        <TempGauge
          temp={temp}
          min={vehicleConfig.engineTemp.min}
          overheat={vehicleConfig.engineTemp.overheat}
          critical={vehicleConfig.engineTemp.critical}
          scale={size * .75}
          engineOn={engineOn}
        />
      </div>
    </div>
  )
}
