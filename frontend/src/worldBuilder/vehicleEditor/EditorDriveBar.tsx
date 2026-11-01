import { useLayoutStore } from "../state/layoutStore";
import { useSocialStore } from '../../store/social/socialStore';
import { useNetworkStore } from '../../store/session/networkStore';
import { useInputStore } from '../../store/input/inputStore';
import { useUIStore } from '../../store/menus/uiStore';
import { useBuilderStore } from '../state/builderStore';
import { useVehicleEditorStore } from './vehicleEditorStore';
import './vehicleEditor.css';
export function EditorDriveBar() {
    const active = useSocialStore(s => s.view?.alpha?.active);
    const connected = useNetworkStore(s => s.connected);
    if (active?.mode !== 'editor' || !connected)
        return null;
    return <div className="ve-drive-bar"><span>EDITOR TEST DRIVE</span><button onClick={() => {
            useInputStore.getState().releaseControls();
            useBuilderStore.setState({ workspace: 'vehicle' });
            useUIStore.getState().setOverlay('world_builder');
        }}>EDIT VEHICLE</button><button onClick={() => {
            useVehicleEditorStore.getState().setView('chase');
            useBuilderStore.setState({ workspace: 'layout', presentation: 'workspace' });
            useUIStore.getState().setOverlay('world_builder');
        }}>WORLD EDITOR</button><button onClick={() => {
            useInputStore.getState().releaseControls();
            useVehicleEditorStore.getState().setView('chase');
            useBuilderStore.setState({ workspace: 'layout', presentation: 'hud' });
            useLayoutStore.setState({view:'3d'});
            useUIStore.getState().setOverlay('world_builder');
        }}>BUILD IN WORLD</button></div>;
}
