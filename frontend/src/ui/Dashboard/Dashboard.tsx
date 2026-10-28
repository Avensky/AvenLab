import {memo,useEffect} from "react";
import {useShallow} from "zustand/react/shallow";
import {startVehicleTelemetry,useVehicleTelemetryStore} from "../../store/vehicleTelemetryStore";
import {usePreferencesStore} from "../../store/preferencesStore";
import Speedometer from "./Speedometer";
import Revolutions from "./Revolutions";
import FuelTemp from "./FuelTemp";
import {MPH_TO_KPH} from "./gaugeGeometry";
import {displayPower} from "./dashboardModel";
import {ResourceRing} from "./ResourceRings";
import "./dashboard.css";

// Position/yaw and unrelated controls must not redraw all three instrument faces.
const SpeedInstrument=memo(function SpeedInstrument(){
 const d=useVehicleTelemetryStore(useShallow(s=>({speed:s.data.speedKph,cluster:s.data.clusterMask,fields:s.data.config.clusterFields,condition:s.data.conditionFraction}))),units=usePreferencesStore(s=>s.speedUnit);
 return <div className="dashboard-speed"><Speedometer speedKph={d.speed} unit={units==='mph'?'MPH':'KM/H'} clusterMask={d.cluster} clusterFields={d.fields}/><ResourceRing kind="speed" fraction={d.condition}/></div>;
});
const RpmInstrument=memo(function RpmInstrument(){
 const d=useVehicleTelemetryStore(useShallow(s=>({rpm:s.data.rpm,gear:s.data.gear,speedKph:s.data.speedKph,engineOn:s.data.engineOn,signal:s.data.signal,resourceMask:s.data.resourceMask,cabinMask:s.data.cabinMask,cockpitMask:s.data.cockpitMask,vehicleMask:s.data.vehicleMask,clusterMask:s.data.clusterMask,config:s.data.config,boost:s.data.boostFraction,boostActive:s.data.boostActive}))),units=usePreferencesStore(s=>s.speedUnit);
 const unit=units==='mph'?'MPH':'KM/H',speed=d.speedKph===null?null:units==='mph'?d.speedKph/MPH_TO_KPH:d.speedKph,park=d.cockpitMask!==null&&Boolean(d.cockpitMask&64)&&((d.cockpitMask>>>7)&15)===8;
 return <div className="dashboard-rpm"><Revolutions rpm={d.rpm} gear={d.gear} maxRpm={d.config.maxRpm} redlineRpm={d.config.redlineRpm} speed={speed} unit={unit} power={displayPower(d)} vehicleMask={d.vehicleMask} clusterMask={d.clusterMask} park={park}/><ResourceRing kind="rpm" fraction={d.boost} active={d.boostActive}/></div>;
});
const FuelInstrument=memo(function FuelInstrument(){
 const d=useVehicleTelemetryStore(useShallow(s=>({fuel:s.data.fuelLiters,temp:s.data.tempC,config:s.data.config,cluster:s.data.clusterMask,resourceMask:s.data.resourceMask,engineOn:s.data.engineOn,signal:s.data.signal,cabinMask:s.data.cabinMask,abs:s.data.absEnabled,tcs:s.data.tcsEnabled,cockpit:s.data.cockpitMask,ultimate:s.data.ultimateFraction})));
 return <FuelTemp fuel={d.fuel} temp={d.temp} config={d.config} clusterMask={d.cluster} resourceMask={d.resourceMask} power={displayPower(d)} absEnabled={d.abs} tcsEnabled={d.tcs} live={d.signal==='live'} cockpitMask={d.cockpit} ultimate={d.ultimate}/>;
});
export default function Dashboard(){
 const signal=useVehicleTelemetryStore(s=>s.data.signal);useEffect(startVehicleTelemetry,[]);
 return <section className="driving-dashboard" data-signal={signal} aria-label="Vehicle instruments"><div className="dashboard-cluster"><SpeedInstrument/><RpmInstrument/><FuelInstrument/></div></section>;
}
