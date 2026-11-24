import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Euler, Quaternion, Vector3 } from 'three';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';

const packs = [
  ['makehuman_system_poses', 'MakeHuman · System'],
  ['poses01', 'MakeHuman · Sitting'],
  ['poses02', 'MakeHuman · Sports'],
  ['poses03', 'MakeHuman · Standing'],
  ['poses04', 'MakeHuman · Dramatic and fantasy'],
  ['poses05', 'MakeHuman · Fighting'],
];
const loader = new BVHLoader();
const vec = v => v.toArray().map(n => Number(n.toFixed(4)));
const angles = q => vec(new Vector3().setFromEuler(new Euler().setFromQuaternion(q)));

function samplePose(text) {
  const { skeleton: { bones }, clip } = loader.parse(text);
  const joints = new Map(bones.map(bone => [bone.name, bone]));
  const root = bones[0];
  const joint = name => {
    const bone = joints.get(name);
    if (!bone) throw new Error('Missing MakeHuman joint ' + name);
    return bone;
  };
  const position = name => joint(name).getWorldPosition(new Vector3());
  const axis = position('head').sub(position('foot.L'));
  const basis = Math.abs(axis.z) > Math.abs(axis.y)
    ? new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
    : new Quaternion();
  const point = name => position(name).applyQuaternion(basis);
  const direction = (from, to) => point(to).sub(point(from)).normalize();
  const rotation = name => basis.clone().multiply(joint(name).getWorldQuaternion(new Quaternion())).multiply(basis.clone().invert());
  const floorJoints = bones.filter(bone => /^(foot\.|toe\d-\d\.)/.test(bone.name));
  const floor = () => Math.min(...floorJoints.map(bone => point(bone.name).y));
  const restFloor = floor();
  const restHips = point(root.name);
  const restFeet = ['L', 'R'].map(side => point('foot.' + side));
  const scale = 1.55 / (point('head').y - restFloor);

  // Some exporters write the full local offset into each position channel.
  // BVHLoader adds the hierarchy offset, so remove the extra copy for those files.
  const positionTracks = clip.tracks.filter(track => track.name.endsWith('.position') && track.name !== root.name + '.position');
  const absoluteOffsets = positionTracks.filter(track => {
    const offset = joint(track.name.slice(0, -'.position'.length)).position;
    const channel = new Vector3().fromArray(track.values).sub(offset);
    return channel.distanceToSquared(offset) < channel.lengthSq();
  }).length > positionTracks.length / 2;

  // Tracks have literal joint names, including periods. Sample frame zero
  // directly so generic Three.js property binding never parses those names.
  for (const track of clip.tracks) {
    const split = track.name.lastIndexOf('.');
    const bone = joint(track.name.slice(0, split));
    if (track.name.endsWith('.position')) {
      const sampled = new Vector3().fromArray(track.values);
      if (absoluteOffsets) sampled.sub(bone.position);
      bone.position.copy(sampled);
    } else bone.quaternion.fromArray(track.values);
  }
  root.updateMatrixWorld(true);

  const lift = restFloor - floor();
  const hips = point(root.name).sub(restHips);
  const rise = Number(((hips.y + lift) * scale).toFixed(4));
  const torso = rotation('spine01');
  const pose = { rise, torso: angles(torso), head: angles(rotation('head').multiply(torso.clone().invert())),
    feet: {}, knees: {}, footFacing: {} };
  for (const [index, side] of ['L', 'R'].entries()) {
    const slot = side.toLowerCase();
    const arm = (name) => name + '.' + side;
    const wrist = arm('wrist');
    const middle = direction(wrist, arm('finger3-1'));
    const across = point(arm('finger2-1')).sub(point(arm('finger5-1')));
    const hand = index === 0 ? 'left' : 'right';
    pose[hand] = [vec(direction(arm('upperarm01'), arm('lowerarm01'))), vec(direction(arm('lowerarm01'), wrist))];
    pose[hand + 'Palm'] = [vec(middle), vec(middle.clone().cross(across).normalize().multiplyScalar(index === 0 ? 1 : -1))];
    const foot = arm('foot');
    const ankleOffset = point(foot).sub(restFeet[index]).sub(new Vector3(hips.x, -lift, hips.z));
    pose.feet[slot] = vec(ankleOffset.multiplyScalar(scale));
    pose.knees[slot] = vec(direction(arm('upperleg02'), arm('lowerleg01')));
    pose.footFacing[slot] = angles(rotation(foot));
  }
  return pose;
}

const [input, output = new URL('../src/game/characters/makehumanPoses.ts', import.meta.url)] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/import-makehuman-poses.mjs EXTRACTED_PACKS_DIR [OUTPUT.ts]');

const groups = [];
for (const [pack, group] of packs) {
  const directory = resolve(input, pack);
  const metadata = JSON.parse(await readFile(join(directory, 'packs', pack + '.json'), 'utf8'));
  const poses = [];
  for (const folder of (await readdir(join(directory, 'poses'))).sort()) {
    const poseDir = join(directory, 'poses', folder);
    for (const file of (await readdir(poseDir)).filter(name => name.endsWith('.bvh')).sort()) {
      const slug = file.slice(0, -4);
      const asset = metadata[slug];
      if (asset?.license !== 'CC0') throw new Error('Expected CC0 attribution for ' + slug);
      const text = await readFile(join(poseDir, file), 'utf8');
      const name = slug.replace(/_/g, ' ').replace(/(\D)(\d+)\b/g, '$1 $2').replace(/^./, c => c.toUpperCase());
      poses.push({ id: 'pose-mh-' + pack + '-' + slug, name, author: asset.author, pose: samplePose(text) });
    }
  }
  if (poses.length !== Object.keys(metadata).length) throw new Error('Incomplete pack ' + pack);
  groups.push({ group, pack, poses });
}
const json = groups.map(({ poses, ...group }) => JSON.stringify(group).slice(0, -1)
  + ',"poses":[\n' + poses.map(pose => '  ' + JSON.stringify(pose)).join(',\n') + '\n]}').join(',\n');
await writeFile(output, '// Generated by scripts/import-makehuman-poses.mjs.\n'
  + 'import type { CharacterPose } from "./posePack";\n\n'
  + 'export const MAKEHUMAN_POSE_GROUPS = [\n' + json + '\n]'
  + ' satisfies readonly { group: string; pack: string; poses: readonly CharacterPose[] }[];\n');
console.log('Imported %d poses in %d packs', groups.reduce((count, group) => count + group.poses.length, 0), groups.length);
