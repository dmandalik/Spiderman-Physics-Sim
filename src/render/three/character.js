// Loads a rigged character if one has been dropped in, and falls back to the
// mannequin if not. Nothing else in the project needs to know which is running.
//
// Auto riggers do not agree on bone names. Meshy, Mixamo and Blender all export
// slightly different skeletons, so bones are found by matching against the
// names each of them tends to use rather than by assuming one convention. If
// the match fails we say so loudly and keep the mannequin, because a half
// mapped skeleton looks far worse than no skeleton at all.

import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import { createMannequin } from './mannequin.js';
import { HERO_HEIGHT, RENDER_SCALE } from '../rig.js';

// Ordered by how specific they are. First hit wins.
const WANTED = {
  hips: ['hips', 'pelvis'],
  spine: ['spine1', 'spine_01', 'spine'],
  chest: ['chest', 'spine2', 'upperchest'],
  neck: ['neck'],
  head: ['head'],
  leftArm: ['leftarm', 'upperarm_l', 'arm_l', 'l_upperarm'],
  leftForearm: ['leftforearm', 'lowerarm_l', 'forearm_l'],
  leftHand: ['lefthand', 'hand_l'],
  rightArm: ['rightarm', 'upperarm_r', 'arm_r', 'r_upperarm'],
  rightForearm: ['rightforearm', 'lowerarm_r', 'forearm_r'],
  rightHand: ['righthand', 'hand_r'],
  leftThigh: ['leftupleg', 'thigh_l', 'upleg_l', 'leftthigh'],
  leftShin: ['leftleg', 'calf_l', 'shin_l', 'leftshin'],
  leftFoot: ['leftfoot', 'foot_l'],
  rightThigh: ['rightupleg', 'thigh_r', 'upleg_r', 'rightthigh'],
  rightShin: ['rightleg', 'calf_r', 'shin_r', 'rightshin'],
  rightFoot: ['rightfoot', 'foot_r'],
  leftShoulder: ['leftshoulder', 'clavicle_l', 'shoulder_l'],
  rightShoulder: ['rightshoulder', 'clavicle_r', 'shoulder_r'],
};

// Which way the body faces. Mixamo characters are authored facing +Z, so this
// swings him toward the way he travels while keeping enough of his front to the
// camera to read the emblem. Square to the camera flattens every limb into the
// screen plane; square to travel hides the suit.
const FACING = 1.0; // radians about Y

// How fast each bone chases its target, in units of e-folds per second. The
// hips lead and everything downstream trails, which is what turns a set of
// correct joint angles into motion that looks like a body rather than a rig.
// This single table is most of the difference between fluid and mechanical.
const RESPONSE = {
  hips: 30,
  spine: 22,
  chest: 18,
  neck: 13,
  leftShoulder: 17,
  rightShoulder: 17,
  leftArm: 20,
  rightArm: 20,
  leftForearm: 15,
  rightForearm: 15,
  leftThigh: 19,
  rightThigh: 19,
  leftShin: 14,
  rightShin: 14,
  leftFoot: 11,
  rightFoot: 11,
};

// How far each bone gets swept back against the direction of travel, as a
// fraction of its aim. Plain lag is symmetric and only ever arrives late; this
// is what actually makes a limb stream behind him. Extremities catch the most
// air, which is why the numbers grow toward the ends of every chain.
//
// The right arm is deliberately zero. That is the web arm, and dragging it off
// target would break the one thing worth protecting, which is that the hand
// genuinely holds the web rather than approximately holds it.
const DRAG = {
  hips: 0,
  spine: 0.04,
  chest: 0.05,
  neck: 0.13,
  leftShoulder: 0.09,
  rightShoulder: 0,
  leftArm: 0.16,
  rightArm: 0,
  leftForearm: 0.3,
  rightForearm: 0,
  leftThigh: 0.14,
  rightThigh: 0.17,
  leftShin: 0.3,
  rightShin: 0.34,
  leftFoot: 0.42,
  rightFoot: 0.46,
};

// Speed at which the sweep reaches full strength.
const DRAG_FULL_SPEED = 30; // m/s

// The model's own clip runs underneath the solver at a fraction of speed. It
// only ever reaches bones the IK does not claim, which is fingers, the lower
// spine and the head, so it adds detail without ever fighting the physics.
const SECONDARY_RATE = 0.45;

// Bones worth driving if they exist, but not worth refusing a model over.
const OPTIONAL = new Set(['leftShoulder', 'rightShoulder']);

export async function createCharacter(url = 'assets/hero.glb') {
  const mannequin = createMannequin();

  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(url);
  } catch {
    // No file yet is the normal case, not an error worth shouting about.
    return mannequin;
  }

  const bones = findBones(gltf.scene);
  const missing = Object.keys(WANTED).filter((key) => !bones[key] && !OPTIONAL.has(key));

  if (missing.length) {
    console.warn(
      `${url} loaded but the skeleton is missing ${missing.join(', ')}. ` +
        `Staying on the mannequin. Bones found: ${listBones(gltf.scene).join(', ')}`,
    );
    return mannequin;
  }

  return skinned(gltf.scene, bones, gltf.animations || []);
}

function findBones(scene) {
  const byName = new Map();
  scene.traverse((node) => {
    if (node.isBone) byName.set(normalise(node.name), node);
  });

  const found = {};
  for (const [key, candidates] of Object.entries(WANTED)) {
    for (const candidate of candidates) {
      for (const [name, bone] of byName) {
        // endsWith rather than equals, so prefixes like mixamorig: fall away.
        if (name.endsWith(candidate)) {
          found[key] = bone;
          break;
        }
      }
      if (found[key]) break;
    }
  }
  return found;
}

// Sketchfab appends a node index to every bone on export, so `mixamorig:Hips`
// arrives as `mixamorig:Hips_64`. Strip that before anything else or nothing
// matches. Separators go too, which is what lets the `mixamorig:` prefix fall
// away under an endsWith test.
const normalise = (name) =>
  name
    .toLowerCase()
    .replace(/_\d+$/, '')
    .replace(/[\s_.:|-]/g, '');

function listBones(scene) {
  const names = [];
  scene.traverse((node) => node.isBone && names.push(node.name));
  return names;
}

// Drives the skeleton by aiming each bone down the line between the two joints
// the rig already solved. The rest direction is taken from the bind pose, so
// this works without knowing which axis the exporter treated as "down the bone".
// Picks the clip most likely to look like swinging, since the useful one is
// rarely first and is named differently in every export.
function pickClip(clips) {
  return clips.find((clip) => /swing|air|fall|jump/i.test(clip.name)) || clips[0] || null;
}

function skinned(scene, bones, clips) {
  const root = new THREE.Group();
  root.add(scene);

  // Turn him to face the way he travels and resize him to the height the rig
  // assumes, measured off the model rather than trusted from the exporter.
  scene.rotation.y = FACING;
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(scene);
  const modelHeight = bounds.max.y - bounds.min.y;
  if (modelHeight > 1e-6) scene.scale.setScalar(HERO_HEIGHT * RENDER_SCALE / modelHeight);

  // Extreme poses push vertices far outside the bind pose bounding box, and a
  // skinned mesh culled on that box vanishes at exactly the wrong moment.
  scene.traverse((node) => {
    if (node.isMesh) node.frustumCulled = false;
  });

  // Everything about a bone's resting state, captured once after the model has
  // been turned and scaled.
  //
  // `bind` is the world orientation the mesh was skinned against, and `restDir`
  // is where the bone points in that state. Posing is then a minimal swing from
  // restDir onto wherever the physics wants the bone, applied on top of bind.
  // Keeping bind rather than building an orientation from scratch is the whole
  // trick: it preserves the twist the skin expects, so shoulders and knees
  // deform instead of collapsing.
  scene.updateMatrixWorld(true);

  const setup = new Map();
  for (const [key, bone] of Object.entries(bones)) {
    const child = bone.children.find((node) => node.isBone);
    if (!child || child.position.lengthSq() < 1e-12) continue;

    const bind = bone.getWorldQuaternion(new THREE.Quaternion());
    const restDir = child.position.clone().normalize().applyQuaternion(bind).normalize();

    setup.set(key, {
      bind,
      restDir,
      // Seeded to the rest direction so the first frame eases out of the bind
      // pose rather than snapping from it.
      smoothed: restDir.clone(),
      rate: RESPONSE[key] ?? 18,
      drag: DRAG[key] ?? 0,
    });
  }

  // Where the hips sit once everything is scaled and turned. Rotating a bone
  // never moves the bone itself, so this offset is measured once and holds.
  scene.updateMatrixWorld(true);
  const hipsOffset = bones.hips.getWorldPosition(new THREE.Vector3());

  // upper, lower, tip, then the clavicle that carries the chain, if there is
  // one. Arms are listed free side first to match the order the rig hands them
  // over in, so the web arm always lands on the side nearest the camera.
  // The clip is stripped down to rotation only. Its position tracks would drive
  // the hips, which would fight the root placement and walk him off his own
  // centre of mass.
  let mixer = null;
  const clip = pickClip(clips);
  if (clip) {
    clip.tracks = clip.tracks.filter((track) => track.name.endsWith('.quaternion'));
    mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(clip).play();
  }

  const chains = [
    ['leftArm', 'leftForearm', null, 'leftShoulder'],
    ['rightArm', 'rightForearm', null, 'rightShoulder'],
    ['leftThigh', 'leftShin', 'leftFoot', null],
    ['rightThigh', 'rightShin', 'rightFoot', null],
  ];

  const world = new THREE.Quaternion();
  const swing = new THREE.Quaternion();
  const parent = new THREE.Quaternion();
  const target = new THREE.Vector3();
  const drift = new THREE.Vector3();

  // Swing a bone from where it rests onto the line between the two joints the
  // rig solved, keeping its bind twist. Setting the world orientation rather
  // than a local one means a bone never inherits its parent's error, so aiming
  // the hips does not drag the legs off target.
  function aim(key, from, to, dt, flow) {
    const bone = bones[key];
    const state = setup.get(key);
    if (!bone || !state) return;

    target.set(to.x - from.x, to.y - from.y, 0);
    if (target.lengthSq() < 1e-10) return;
    target.normalize();

    // Sweep the aim back against the direction of travel. Lag alone makes a
    // limb arrive late wherever it is going; this makes it stream behind him,
    // which is the part that actually looks like moving through air.
    if (flow && state.drag) {
      target.addScaledVector(flow, -state.drag);
      if (target.lengthSq() < 1e-10) return;
      target.normalize();
    }

    // Each bone chases its target at its own rate, so the hips arrive first and
    // the extremities trail. Frame rate independent, so the follow through is
    // the same on a 60 Hz laptop and a 240 Hz monitor.
    state.smoothed.lerp(target, 1 - Math.exp(-state.rate * dt)).normalize();

    // Ancestors must be current or this reads last frame's parent orientation
    // and the skeleton lags a frame behind the physics.
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(parent);

    swing.setFromUnitVectors(state.restDir, state.smoothed);
    world.copy(swing).multiply(state.bind);

    bone.quaternion.copy(parent.invert().multiply(world));
  }

  return {
    object: root,

    apply(pose, dt = 1 / 60, velocity = null) {
      const step = Math.min(Math.max(dt, 1 / 1000), 1 / 15);
      const [pelvis, waist, chest, neck] = pose.spine;

      // The clip runs first so the IK lands on top of it and wins every bone it
      // cares about, leaving the clip the fingers, lower spine and head.
      if (mixer) mixer.update(step * SECONDARY_RATE);

      root.position.set(pelvis.x - hipsOffset.x, pelvis.y - hipsOffset.y, -hipsOffset.z);

      // Direction of travel, faded in with speed so a slow hang has no sweep at
      // all and a fast swing has all of it.
      let flow = null;
      if (velocity) {
        const speed = Math.hypot(velocity.x, velocity.y);
        if (speed > 1) {
          const strength = Math.min(speed / DRAG_FULL_SPEED, 1);
          flow = drift.set(velocity.x / speed, velocity.y / speed, 0).multiplyScalar(strength);
        }
      }

      // Strictly top down. Every aim depends on its parent already being right.
      aim('hips', pelvis, waist, step, flow);
      aim('spine', waist, chest, step, flow);
      aim('chest', chest, neck, step, flow);
      aim('neck', neck, pose.head, step, flow);

      const limbs = [pose.freeArm, pose.webArm, pose.legs[0], pose.legs[1]];
      for (const [index, chain] of chains.entries()) {
        const [a, b, c] = limbs[index];

        // Clavicles point from the base of the neck out to the shoulder. Left
        // unaimed they keep their bind angle against a torso that has moved,
        // which is what pinches the deltoid at extreme reaches.
        if (chain[3]) aim(chain[3], chest, a, step, flow);

        aim(chain[0], a, b, step, flow);
        aim(chain[1], b, c, step, flow);

        // Feet carry on along the shin, so they follow the leg instead of
        // dangling at whatever the bind pose left them at.
        if (chain[2]) aim(chain[2], b, c, step, flow);
      }
    },
  };
}
