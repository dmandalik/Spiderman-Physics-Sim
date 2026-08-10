// The WebGL layer. A transparent canvas sitting over the 2D one, holding an
// orthographic camera locked to exactly the same view.
//
// Only the character lives here. Sky, city, web and HUD stay on the 2D canvas
// underneath, which is why the whole city still costs almost nothing to draw.

import * as THREE from 'three';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();

  // Orthographic, not perspective. A perspective camera would give the figure
  // its own vanishing point, which would disagree with the flat parallax city
  // behind it and read as a cutout pasted on.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.z = 600;

  addLights(scene);

  return {
    scene,

    resize(width, height, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
    },

    // Match the 2D camera exactly. It maps metres to pixels by `zoom`, so half
    // the viewport in pixels divided by zoom is half the frustum in metres.
    sync(view) {
      camera.left = -view.width / 2 / view.zoom;
      camera.right = view.width / 2 / view.zoom;
      camera.top = view.height / 2 / view.zoom;
      camera.bottom = -view.height / 2 / view.zoom;
      camera.position.x = view.pos.x;
      camera.position.y = view.pos.y;
      camera.updateProjectionMatrix();
    },

    render() {
      renderer.render(scene, camera);
    },
  };
}

// Lit to agree with the painted scene rather than to be physically correct.
// The moon is up and to the left, the rooftop neon is cyan, and the street
// throws warm sodium light up from below.
function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x070c18, 1.1));

  const moon = new THREE.DirectionalLight(0xdfe9ff, 2.4);
  moon.position.set(-1, 1.4, 1.2);
  scene.add(moon);

  const neon = new THREE.DirectionalLight(0x4de2ff, 1.1);
  neon.position.set(1.2, -0.3, -0.6);
  scene.add(neon);

  const street = new THREE.DirectionalLight(0xffb46a, 0.55);
  street.position.set(0.3, -1, 0.4);
  scene.add(street);
}
