import { create } from "zustand";
export const useFittingTurnStore = create<{ characterYaw: number; vehicleYaw: number; dragging: boolean; suppressClickUntil: number }>(() => ({ characterYaw: 0, vehicleYaw: 0, dragging: false, suppressClickUntil: 0 }));
export const turnCharacter = (direction: number) => useFittingTurnStore.setState(s => ({ characterYaw: s.characterYaw + direction * Math.PI / 12 }));
export const turnVehicle = (direction: number) => useFittingTurnStore.setState(s => ({ vehicleYaw: s.vehicleYaw + direction * Math.PI / 12 }));
