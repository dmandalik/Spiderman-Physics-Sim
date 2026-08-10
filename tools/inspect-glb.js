// Prints what is actually inside a GLB, so the skeleton can be mapped without
// guessing. Node only, no dependencies.
//
//   node tools/inspect-glb.js assets/hero.glb
//
// A GLB is a 12 byte header followed by chunks. The first chunk is the glTF
// JSON, which is all we need: it lists every node, every skin, and which nodes
// those skins use as joints.

import { readFile } from 'node:fs/promises';

const file = process.argv[2] || 'assets/hero.glb';
const buffer = await readFile(file).catch(() => null);

if (!buffer) {
  console.error(`cannot read ${file}`);
  process.exit(1);
}

if (buffer.readUInt32LE(0) !== 0x46546c67) {
  console.error(`${file} is not a GLB (bad magic). A .gltf file is JSON, read it directly.`);
  process.exit(1);
}

// Header is magic, version, total length. Then chunk length, chunk type, data.
const chunkLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + chunkLength).toString('utf8'));

const nodes = gltf.nodes || [];
const skins = gltf.skins || [];

console.log(`file        ${file}  (${(buffer.length / 1e6).toFixed(1)} MB)`);
console.log(`generator   ${gltf.asset?.generator || 'unknown'}`);
console.log(`nodes       ${nodes.length}`);
console.log(`meshes      ${(gltf.meshes || []).length}`);
console.log(`materials   ${(gltf.materials || []).length}`);
console.log(`images      ${(gltf.images || []).length}`);
console.log(`animations  ${(gltf.animations || []).length}`);
console.log(`skins       ${skins.length}`);

if (!skins.length) {
  console.log('\nNo skin. This mesh has no skeleton, so it cannot be posed.');
  process.exit(0);
}

for (const [index, skin] of skins.entries()) {
  const joints = skin.joints || [];
  console.log(`\nskin ${index}: ${joints.length} joints`);

  // Print as a tree, since the hierarchy is what tells us which bone is which
  // when the names are unhelpful.
  // Child index to parent index, so depth is a plain walk up the chain.
  const parents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parents.set(child, index);
  });

  // Walk the tree rather than the joints array, which is in no useful order.
  const isJoint = new Set(joints);
  const roots = joints.filter((joint) => {
    for (let at = parents.get(joint); at !== undefined; at = parents.get(at)) {
      if (isJoint.has(at)) return false;
    }
    return true;
  });

  const walk = (joint, depth) => {
    console.log(`  ${'  '.repeat(depth)}${nodes[joint]?.name ?? `node ${joint}`}`);
    for (const child of nodes[joint]?.children || []) {
      if (isJoint.has(child)) walk(child, depth + 1);
    }
  };
  for (const root of roots) walk(root, 0);
}

if (gltf.animations?.length) {
  console.log('\nanimations');
  for (const clip of gltf.animations) console.log(`  ${clip.name || '(unnamed)'}`);
}
