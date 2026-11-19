import { useState } from "react";
import { useCharacterPreviewStore } from "./characterPreviewStore";
import { CHARACTER_POSE_GROUPS, POSE_MOTION_GROUPS, POSE_SEQUENCE_ID } from "./posePack";

const poseOptions = CHARACTER_POSE_GROUPS.map(({ group, poses }) => <optgroup key={group} label={group}>
  {poses.map(pose => <option key={pose.id} value={pose.id}>{pose.name}</option>)}
</optgroup>);

function previewPose(id: string) {
  useCharacterPreviewStore.setState({ emote: { id }, playbackPaused: false });
}

export function CharacterPosePack({ disabled }: { disabled: boolean }) {
  const [from, setFrom] = useState<string>("pose-neutral");
  const [motion, setMotion] = useState<string>("010");
  const [to, setTo] = useState<string>("pose-weight-shift");
  const active = useCharacterPreviewStore(state => state.emote?.id);

  return <>
    <h2>Pose pack</h2>
    <div className="character-emote-results">
      <label className="character-setting" data-controller-row>Start pose
        <select className="menu-control" aria-label="Start pose" value={from} onChange={event => setFrom(event.target.value)}>
          {poseOptions}
        </select>
      </label>
      <button type="button" className="menu-control" data-controller-row disabled={disabled} onClick={() => previewPose(from)}>Hold start pose</button>
      <label className="character-setting" data-controller-row>Animation
        <select className="menu-control" aria-label="Animation" value={motion} onChange={event => setMotion(event.target.value)}>
          {POSE_MOTION_GROUPS.map(({ group, motions }) => <optgroup key={group} label={group}>
            {motions.map(emote => <option key={emote.id} value={emote.id}>{emote.name}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className="character-setting" data-controller-row>End pose
        <select className="menu-control" aria-label="End pose" value={to} onChange={event => setTo(event.target.value)}>
          {poseOptions}
        </select>
      </label>
      <button type="button" className="menu-control" data-controller-row disabled={disabled} onClick={() => previewPose(to)}>Hold end pose</button>
      <button type="button" className="menu-control" data-controller-row disabled={disabled} onClick={() =>
        useCharacterPreviewStore.setState({ emote: { id: POSE_SEQUENCE_ID, sequence: { from, motion, to } }, playbackPaused: false })
      }>Play sequence</button>
      <button type="button" className="menu-control" data-controller-row disabled={disabled || !active} onClick={() =>
        useCharacterPreviewStore.setState({ emote: null, playbackPaused: false })
      }>Return to idle</button>
    </div>
  </>;
}
