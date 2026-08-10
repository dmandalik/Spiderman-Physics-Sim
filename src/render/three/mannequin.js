// A body built out of solid geometry, posed from the same rig the flat version
// used. This is the stand in until a real skinned mesh is dropped in, and it is
// already doing the thing that matters: real volume, real lighting, real depth
// between the near and far side of the body.
//
// Bone lengths never change, so every piece is built once at its exact size and
// only ever moved. Nothing is rebuilt per frame.

import * as THREE from 'three';
import { BODY, HERO_HEIGHT, RENDER_SCALE } from '../rig.js';

const HEIGHT = HERO_HEIGHT * RENDER_SCALE;
const UP = new THREE.Vector3(0, 1, 0);

// Depth offsets in metres. The far side of the body sits behind the torso and
// the near side in front, so the two sides genuinely occlude rather than being
// faked with darker paint the way the flat version did it.
const FAR = -0.55;
const NEAR = 0.55;

const SUIT = {
  red: new THREE.MeshStandardMaterial({ color: 0xc8121f, roughness: 0.48, metalness: 0.05 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x1a3799, roughness: 0.52, metalness: 0.05 }),
  eye: new THREE.MeshStandardMaterial({
    color: 0xf2f6ff,
    roughness: 0.25,
    emissive: 0x2a3550,
    emissiveIntensity: 0.6,
  }),
  emblem: new THREE.MeshStandardMaterial({ color: 0x0a0c14, roughness: 0.6 }),
};

export function createMannequin() {
  const root = new THREE.Group();

  const parts = {
    hips: bone(root, BODY.waist - BODY.pelvis, BODY.waistWidth, BODY.hipWidth, SUIT.blue),
    belly: bone(root, BODY.chest - BODY.waist, BODY.chestWidth, BODY.waistWidth, SUIT.red),
    chest: bone(root, BODY.neck - BODY.chest, BODY.neckWidth, BODY.chestWidth, SUIT.red),

    webArm: limb(root, SUIT.blue, SUIT.red),
    freeArm: limb(root, SUIT.blue, SUIT.red),
    legs: [legParts(root), legParts(root)],

    head: head(root),
  };

  joint(root, BODY.chestWidth, SUIT.red, parts, 'chestBall');
  joint(root, BODY.waistWidth, SUIT.red, parts, 'waistBall');

  return {
    object: root,

    apply(pose) {
      const [pelvis, waist, chest, neck] = pose.spine;

      place(parts.hips, pelvis, waist, 0, 0);
      place(parts.belly, waist, chest, 0, 0);
      place(parts.chest, chest, neck, 0, 0);
      parts.waistBall.position.set(waist.x, waist.y, 0);
      parts.chestBall.position.set(chest.x, chest.y, 0);

      poseLimb(parts.freeArm, pose.freeArm, FAR);
      poseLimb(parts.webArm, pose.webArm, NEAR);
      poseLeg(parts.legs[0], pose.legs[0], FAR);
      poseLeg(parts.legs[1], pose.legs[1], NEAR);

      parts.head.group.position.set(pose.head.x, pose.head.y, 0.1);
      parts.head.group.quaternion.setFromUnitVectors(UP, unit(pose.up));
    },
  };
}

// A tapered segment plus a ball at its far end, so joints stay round when the
// limb folds. Built at a fixed length because IK never stretches a bone.
function bone(parent, span, topWidth, bottomWidth, material) {
  const length = Math.abs(span) * HEIGHT;
  const geometry = new THREE.CylinderGeometry(
    topWidth * HEIGHT,
    bottomWidth * HEIGHT,
    length,
    14,
    1,
  );
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

function joint(parent, radius, material, into, key) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * HEIGHT, 14, 10), material);
  parent.add(mesh);
  if (into) into[key] = mesh;
  return mesh;
}

function limb(parent, sleeve, glove) {
  return {
    upper: bone(parent, BODY.upperArm, BODY.armWidth * 0.85, BODY.armWidth, sleeve),
    lower: bone(parent, BODY.forearm, BODY.wristWidth, BODY.armWidth * 0.85, sleeve),
    elbow: joint(parent, BODY.armWidth * 0.85, sleeve),
    hand: joint(parent, BODY.handRadius, glove),
  };
}

function legParts(parent) {
  return {
    upper: bone(parent, BODY.thigh, BODY.thighWidth * 0.78, BODY.thighWidth, SUIT.blue),
    lower: bone(parent, BODY.shin, BODY.ankleWidth, BODY.thighWidth * 0.78, SUIT.blue),
    knee: joint(parent, BODY.thighWidth * 0.78, SUIT.blue),
    foot: bone(parent, BODY.footLength, BODY.ankleWidth * 0.8, BODY.ankleWidth, SUIT.red),
  };
}

function head(parent) {
  const group = new THREE.Group();
  parent.add(group);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(BODY.headRadius * HEIGHT, 24, 18), SUIT.red);
  skull.scale.set(0.94, 1.06, 0.96);
  group.add(skull);

  // Angled almonds, tilted in toward the nose. Flattened spheres rather than
  // decals so they catch the moonlight along with everything else.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(BODY.headRadius * HEIGHT * 0.42, 16, 12),
      SUIT.eye,
    );
    eye.scale.set(1, 0.62, 0.4);
    eye.position.set(side * BODY.headRadius * HEIGHT * 0.4, BODY.headRadius * HEIGHT * 0.12, BODY.headRadius * HEIGHT * 0.78);
    eye.rotation.z = -side * 0.38;
    group.add(eye);
  }

  return { group };
}

function poseLimb(part, joints, z) {
  const [shoulder, elbow, hand] = joints;
  place(part.upper, shoulder, elbow, z, z);
  place(part.lower, elbow, hand, z, z);
  part.elbow.position.set(elbow.x, elbow.y, z);
  part.hand.position.set(hand.x, hand.y, z);
}

function poseLeg(part, joints, z) {
  const [hip, knee, ankle] = joints;
  place(part.upper, hip, knee, z, z);
  place(part.lower, knee, ankle, z, z);
  part.knee.position.set(knee.x, knee.y, z);

  // The foot carries on along the shin, so it swings with the leg for free.
  const along = unit({ x: ankle.x - knee.x, y: ankle.y - knee.y });
  place(
    part.foot,
    ankle,
    { x: ankle.x + along.x * BODY.footLength * HEIGHT, y: ankle.y + along.y * BODY.footLength * HEIGHT },
    z,
    z,
  );
}

const midpoint = new THREE.Vector3();
const direction = new THREE.Vector3();

// Cylinders are built along Y and centred on the origin, so a bone is placed by
// dropping it on the midpoint and rotating Y onto the line between the joints.
function place(mesh, a, b, za, zb) {
  midpoint.set((a.x + b.x) / 2, (a.y + b.y) / 2, (za + zb) / 2);
  mesh.position.copy(midpoint);

  direction.set(b.x - a.x, b.y - a.y, zb - za);
  if (direction.lengthSq() < 1e-12) return;
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
}

function unit(v) {
  const length = Math.hypot(v.x, v.y) || 1;
  return new THREE.Vector3(v.x / length, v.y / length, 0);
}
