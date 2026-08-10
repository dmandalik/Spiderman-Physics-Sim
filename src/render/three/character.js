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
};

// How far the body is turned about whatever direction it is pointing. Zero
// puts him square to the camera, which flattens every limb into the screen
// plane. A three quarter turn reads as depth and shows both the emblem and the
// profile, which is the angle comic panels use for exactly this reason.
const BODY_ROLL = -1.05; // radians

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
  const missing = Object.keys(WANTED).filter((key) => !bones[key]);

  if (missing.length) {
    console.warn(
      `${url} loaded but the skeleton is missing ${missing.join(', ')}. ` +
        `Staying on the mannequin. Bones found: ${listBones(gltf.scene).join(', ')}`,
    );
    return mannequin;
  }

  return skinned(gltf.scene, bones);
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
function skinned(scene, bones) {
  const root = new THREE.Group();
  root.add(scene);

  // Mixamo characters face +Z and are authored at their own scale in their own
  // units. Turn him to face the way he travels and resize him to the height the
  // rig assumes, measured off the model rather than trusted from the exporter.
  scene.rotation.y = -Math.PI / 2;
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(scene);
  const modelHeight = bounds.max.y - bounds.min.y;
  if (modelHeight > 1e-6) scene.scale.setScalar(HERO_HEIGHT * RENDER_SCALE / modelHeight);

  // Extreme poses push vertices far outside the bind pose bounding box, and a
  // skinned mesh culled on that box vanishes at exactly the wrong moment.
  scene.traverse((node) => {
    if (node.isMesh) node.frustumCulled = false;
  });

  // Each bone's rest direction is the direction to its child in the bind pose.
  // Reading it rather than assuming an axis is what makes this work across
  // exporters that disagree about which way is down the bone.
  const rest = new Map();
  for (const [key, bone] of Object.entries(bones)) {
    const child = bone.children.find((node) => node.isBone);
    if (child && child.position.lengthSq() > 1e-12) {
      rest.set(key, child.position.clone().normalize());
    }
  }

  // Where the hips sit once everything is scaled and turned. Rotating a bone
  // never moves the bone itself, so this offset is measured once and holds.
  scene.updateMatrixWorld(true);
  const hipsOffset = bones.hips.getWorldPosition(new THREE.Vector3());

  const chains = [
    ['leftArm', 'leftForearm', 'leftHand'],
    ['rightArm', 'rightForearm', 'rightHand'],
    ['leftThigh', 'leftShin', 'leftFoot'],
    ['rightThigh', 'rightShin', 'rightFoot'],
  ];

  const world = new THREE.Quaternion();
  const parent = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const target = new THREE.Vector3();

  // Point a bone down the line between the two joints the rig solved. Setting
  // the world orientation means a bone does not inherit its parent's error, so
  // aiming the hips does not drag the legs off target.
  function aim(key, from, to) {
    const bone = bones[key];
    const axis = rest.get(key);
    if (!bone || !axis) return;

    target.set(to.x - from.x, to.y - from.y, 0);
    if (target.lengthSq() < 1e-10) return;
    target.normalize();

    // Ancestors must be current or this reads last frame's parent orientation
    // and the whole skeleton lags a frame behind the physics.
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(parent);

    // setFromUnitVectors gives the shortest rotation onto the aim, which says
    // nothing about the twist around it. Left alone, every bone lands at some
    // arbitrary roll and the body ends up facing the camera with its limbs
    // splayed flat. Rotating about the aim axis afterwards fixes the twist
    // without disturbing where the bone points.
    world.setFromUnitVectors(axis, target);
    roll.setFromAxisAngle(target, BODY_ROLL);
    world.premultiply(roll);

    bone.quaternion.copy(parent.invert().multiply(world));
  }

  return {
    object: root,

    apply(pose) {
      const [pelvis, waist, chest, neck] = pose.spine;

      root.position.set(pelvis.x - hipsOffset.x, pelvis.y - hipsOffset.y, -hipsOffset.z);

      // Strictly top down. Every aim depends on its parent already being right.
      aim('hips', pelvis, waist);
      aim('spine', waist, chest);
      aim('chest', chest, neck);
      aim('neck', neck, pose.head);

      const limbs = [pose.freeArm, pose.webArm, pose.legs[0], pose.legs[1]];
      for (const [index, chain] of chains.entries()) {
        const [a, b, c] = limbs[index];
        aim(chain[0], a, b);
        aim(chain[1], b, c);
      }
    },
  };
}
