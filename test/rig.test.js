import test from 'node:test';
import assert from 'node:assert/strict';

import { distance, length, normalize } from '../src/physics/vec.js';
import { solveTwoBone, targetUp, poseHero, poseTargets, HERO_HEIGHT, RENDER_SCALE } from '../src/render/rig.js';

const root = { x: 0, y: 0 };

test('the hand lands on the target when the arm can reach', () => {
  for (const target of [
    { x: 1, y: 0 },
    { x: 0, y: -1.4 },
    { x: -0.8, y: 0.9 },
    { x: 0.3, y: 0.2 },
  ]) {
    const { tip } = solveTwoBone(root, target, 1, 1);
    assert.ok(distance(tip, target) < 1e-6, `missed ${JSON.stringify(target)}`);
  }
});

test('the bones never change length', () => {
  for (const target of [
    { x: 1.2, y: 0.4 },
    { x: 9, y: 9 },
    { x: 0.05, y: 0 },
    { x: 0, y: 0 },
  ]) {
    const { joint, tip } = solveTwoBone(root, target, 0.7, 0.9);
    assert.ok(Math.abs(distance(root, joint) - 0.7) < 1e-6);
    assert.ok(Math.abs(distance(joint, tip) - 0.9) < 1e-3);
  }
});

test('an arm too short just straightens and points', () => {
  const target = { x: 40, y: 0 };
  const { joint, tip } = solveTwoBone(root, target, 1, 1);

  assert.ok(Math.abs(distance(root, tip) - 2) < 1e-9, 'should stop at full reach');
  assert.ok(Math.abs(joint.y) < 1e-9, 'a straight arm has no bend');
});

test('the elbow flips with the bend direction', () => {
  const target = { x: 1, y: 0 };
  const left = solveTwoBone(root, target, 1, 1, 1);
  const right = solveTwoBone(root, target, 1, 1, -1);

  assert.ok(left.joint.y > 0 !== right.joint.y > 0);
});

test('hanging from a web he lines up with the web', () => {
  const pos = { x: 0, y: 0 };
  const web = { attached: true, anchor: { x: 30, y: 40 } };

  const up = targetUp(pos, { x: 5, y: 0 }, web);

  assert.ok(distance(up, normalize({ x: 30, y: 40 })) < 1e-9);
});

test('in free flight he goes head first along his velocity', () => {
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const up = targetUp({ x: 0, y: 0 }, { x: 0, y: -30 }, free);

  assert.ok(up.y < -0.99, 'a dive should put his head at the bottom');
});

test('standing still he stays upright', () => {
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const up = targetUp({ x: 0, y: 0 }, { x: 0.1, y: 0 }, free);

  assert.deepEqual(up, { x: 0, y: 1 });
});

test('the web hand actually holds the web', () => {
  const pos = { x: 0, y: 50 };
  const web = { attached: true, anchor: { x: 12, y: 62 }, restLength: 17 };
  const pose = poseHero({ pos, vel: { x: 20, y: 4 }, web, up: targetUp(pos, { x: 20, y: 4 }, web) });

  const hand = pose.webArm[2];
  // The anchor is well past arm's length, so the arm should be straight and
  // aimed at it rather than stuck to it.
  const alongWeb = normalize({ x: web.anchor.x - pos.x, y: web.anchor.y - pos.y });
  const alongArm = normalize({ x: hand.x - pose.webArm[0].x, y: hand.y - pose.webArm[0].y });

  assert.ok(alongArm.x * alongWeb.x + alongArm.y * alongWeb.y > 0.9, 'arm points off the web');
});

test('the pose is built around the physics position', () => {
  const pos = { x: 100, y: 60 };
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const pose = poseHero({ pos, vel: { x: 0, y: 0 }, web: free, up: { x: 0, y: 1 } });
  const [pelvis, , , neck] = pose.spine;

  assert.ok(pose.head.y > neck.y, 'head above the shoulders');
  assert.ok(neck.y > pos.y, 'shoulders above the centre of mass');
  assert.ok(pelvis.y < pos.y, 'pelvis below it');
  assert.equal(pose.height, HERO_HEIGHT * RENDER_SCALE);
});

test('the spine bows when he leans and straightens when he does not', () => {
  const pos = { x: 0, y: 60 };
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const base = { pos, vel: { x: 0, y: 0 }, web: free, up: { x: 0, y: 1 } };

  const straight = poseHero({ ...base, lean: 0 });
  const bowed = poseHero({ ...base, lean: 1 });

  assert.ok(Math.abs(straight.spine[1].x - pos.x) < 1e-9, 'no lean should mean no bow');
  assert.ok(Math.abs(bowed.spine[1].x - pos.x) > 0.1, 'the waist should swing out');
});

test('shoulders and hips counter rotate', () => {
  const pos = { x: 0, y: 60 };
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const pose = poseHero({ pos, vel: { x: 0, y: 0 }, web: free, up: { x: 0, y: 1 }, twist: 0.5 });

  const shoulderTilt = pose.webArm[0].y - pose.spine[2].y;
  const hipTilt = pose.legs[1][0].y - pose.spine[0].y;

  assert.ok(shoulderTilt * hipTilt < 0, 'the two axes should tilt opposite ways');
});

test('every limb is a three joint chain', () => {
  const pos = { x: 0, y: 60 };
  const web = { attached: true, anchor: { x: 20, y: 90 }, restLength: 36 };
  const pose = poseHero({ pos, vel: { x: 18, y: 2 }, web, up: { x: 0, y: 1 } });

  for (const chain of [pose.webArm, pose.freeArm, ...pose.legs]) {
    assert.equal(chain.length, 3);
    assert.ok(chain.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  assert.equal(pose.spine.length, 4);
});

test('the targets react to what the physics is doing', () => {
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const still = poseTargets({ pos: { x: 0, y: 60 }, vel: { x: 0, y: 0 }, web: free });
  const fast = poseTargets({ pos: { x: 0, y: 60 }, vel: { x: 40, y: 0 }, web: free });

  assert.equal(still.tuck, 0);
  assert.equal(fast.tuck, 1, 'flat out should be fully tucked');
});

test('going faster tucks the legs up', () => {
  const pos = { x: 0, y: 60 };
  const free = { attached: false, anchor: { x: 0, y: 0 } };
  const feet = (speed) => {
    const { tuck } = poseTargets({ pos, vel: { x: speed, y: 0 }, web: free });
    const pose = poseHero({ pos, vel: { x: speed, y: 0 }, web: free, up: { x: 0, y: 1 }, tuck });
    return pose.legs.map(([, , foot]) => length({ x: foot.x - pos.x, y: foot.y - pos.y }));
  };

  const slow = feet(1);
  const fast = feet(40);

  assert.ok(fast[0] < slow[0] && fast[1] < slow[1], 'fast feet should be pulled in closer');
});
