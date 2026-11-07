export type TransmissionMode = "manual" | "automatic";
export type VehicleDrivetrainProfile = {
  driveLayout: string;
  transmissions: readonly TransmissionMode[];
  defaultTransmission: TransmissionMode | null;
  paddleShifters: boolean;
};

const DEFAULT_PROFILE: VehicleDrivetrainProfile = {
  driveLayout: "RWD",
  transmissions: ["automatic"],
  defaultTransmission: "automatic",
  paddleShifters: false,
};

/** Editable preview capabilities per chassis. These are garage build rules,
 * not claims about a vehicle's factory transmission or live physics support. */
export const VEHICLE_DRIVETRAIN_PROFILES: Record<string, VehicleDrivetrainProfile> = {
  ae86: { driveLayout: "RWD", transmissions: ["manual", "automatic"], defaultTransmission: "manual", paddleShifters: false },
  brz: { driveLayout: "RWD", transmissions: ["manual", "automatic"], defaultTransmission: "manual", paddleShifters: true },
  camaro: { driveLayout: "RWD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  supra: { driveLayout: "RWD", transmissions: ["manual", "automatic"], defaultTransmission: "manual", paddleShifters: true },
  tank: { driveLayout: "TRACK DRIVE", transmissions: [], defaultTransmission: null, paddleShifters: false },
  sierra: { driveLayout: "4WD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  fortuner: { driveLayout: "4WD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: false },
  landcruiser: { driveLayout: "4WD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: false },
  mini: { driveLayout: "FWD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  cx30: { driveLayout: "AWD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  enforcer: { driveLayout: "AWD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  interceptor: { driveLayout: "RWD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  charger70: { driveLayout: "RWD", transmissions: ["manual", "automatic"], defaultTransmission: "automatic", paddleShifters: false },
  skyline34: { driveLayout: "AWD", transmissions: ["manual", "automatic"], defaultTransmission: "manual", paddleShifters: true },
  timecar: { driveLayout: "AWD", transmissions: ["automatic"], defaultTransmission: "automatic", paddleShifters: true },
  "hawaii-rescue": { driveLayout: "TWIN SCREW", transmissions: [], defaultTransmission: null, paddleShifters: false },
  louisiana: { driveLayout: "TWIN SCREW", transmissions: [], defaultTransmission: null, paddleShifters: false },
};

export function drivetrainProfileFor(vehicle: string): VehicleDrivetrainProfile {
  return VEHICLE_DRIVETRAIN_PROFILES[vehicle] ?? DEFAULT_PROFILE;
}
