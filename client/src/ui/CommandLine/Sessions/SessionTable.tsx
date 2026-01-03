import Filter from "../Filter";
import SessionCandidates from './SessionCandidates';
import ViewSession from '../ViewFrames';
import ViewRaw from '../ViewRawFrames';
import ViewPlayback from "../Playback/ViewPlayback";
// import VehicleManager from "../Vehicles/VehicleManager";
import SessionSnapshots from "../SessionSnapshots";

interface Props {
    sessionId: number;
    activeTab: 'candidates' | 'logs' | 'raw' | 'playback' | 'snapshots';
    isPlaying: boolean;
    onScrub: (time: number) => void;
}

export const SessionTable = ({ sessionId, activeTab, isPlaying, onScrub }: Props) => {
    return (
        <div>
            {activeTab === 'candidates' && (<SessionCandidates sessionId={sessionId} />)}
            {activeTab === 'logs' && (
                <>
                    <Filter />
                    <ViewSession type="logs" />
                </>
            )}
            {activeTab === 'raw' && (
                <>
                    <Filter />
                    <ViewRaw type="raw" />
                </>
            )}
            {activeTab === 'playback' && (
                <>
                    <Filter />
                    <ViewPlayback
                        type="logs"
                        isPlaying={isPlaying}
                        onScrub={onScrub}
                    />
                </>
            )}
            {activeTab === 'snapshots' && (
                <SessionSnapshots sessionId={sessionId} />
            )}
        </div>
    );
};
