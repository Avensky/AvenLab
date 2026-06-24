import { Suspense } from 'react';
import type { PropsWithChildren } from 'react';

interface SelectionScreenProps {
    playerId: string
    VehicleComponent: React.ComponentType<{ playerId: string; children?: React.ReactNode }>
    MapComponent: React.ComponentType
}
export default function SelectionScreen({ playerId, children, VehicleComponent, MapComponent }: PropsWithChildren<SelectionScreenProps>) {
    // console.log('SelecionScreen')
    return (
        <Suspense fallback={null}>
            <VehicleComponent playerId={playerId} >
            </VehicleComponent>
            {children}
            <MapComponent />
        </Suspense>
    );
}
