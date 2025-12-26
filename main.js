import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
let bodies = [];
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("canvas-container");
  if (container) {
    container.appendChild(renderer.domElement);
  } else {
    console.error("Canvas container not found!");
  }
});

const COLLISION_COOLDOWN_FRAMES = 3;
let TIME_STEP = 10; // 10 second per frame
const G = 6.6743e-11;
let bodyCount = 0;
let isPaused = true;
const MAX_BODIES = 200; // maximum allowed bodies
let simulationRunning = true;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // smoothen motion?
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 100;

const timeStepSlider = document.getElementById("time-step-slider");
const timeStepValue = document.getElementById("time-step-value");
timeStepSlider.addEventListener("input", () => {
  TIME_STEP = Number(timeStepSlider.value);
  timeStepValue.textContent = TIME_STEP;
});
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");

zoomInBtn.addEventListener("click", () => {
  camera.position.multiplyScalar(0.9);
  controls.update();
});

zoomOutBtn.addEventListener("click", () => {
  camera.position.multiplyScalar(1.1);
  controls.update();
});

camera.position.set(0, 0, 20);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0x222222);
scene.add(ambientLight);

const pauseBtn = document.getElementById("pause-btn");
const resumeBtn = document.getElementById("resume-btn");
pauseBtn.addEventListener("click", () => {
  isPaused = true;
  pauseBtn.style.display = "none";
  resumeBtn.style.display = "";
});

resumeBtn.addEventListener("click", () => {
  isPaused = false;
  resumeBtn.style.display = "none";
  pauseBtn.style.display = "";
});

class Body {
  constructor({ name, mass, radius, color, position, velocity }) {
    this.collisionCooldown = 0;
    this.name = name;
    this.mass = mass;
    this.radius = radius;
    this.velocity = velocity.clone();
    this.position = position.clone();
    this.acceleration = new THREE.Vector3();

    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    // trail - should be about 1 rotation. In future might make it dynamically calculated too but idc rn
    this.trail = [];
    this.maxTrailLength = 500;
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailMaterial = new THREE.LineBasicMaterial({ color });
    this.trailLine = new THREE.Line(this.trailGeometry, this.trailMaterial);
    scene.add(this.trailLine);
  }

  applyForce(force) {
    const a = force.clone().divideScalar(this.mass);
    this.acceleration.add(a);
  }

  updateTrail() {
    this.trail.push(this.position.clone());
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    const positions = new Float32Array(this.trail.length * 3);
    for (let i = 0; i < this.trail.length; i++) {
      positions.set([this.trail[i].x, this.trail[i].y, this.trail[i].z], i * 3);
    }

    this.trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.trailGeometry.setDrawRange(0, this.trail.length);
    this.trailGeometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    if (this.collisionCooldown > 0) {
      this.collisionCooldown--;
    }
    this.velocity.add(this.acceleration.clone().multiplyScalar(dt));
    this.position.add(this.velocity.clone().multiplyScalar(dt));
    this.mesh.position.copy(this.position);
    this.updateTrail();
    this.acceleration.set(0, 0, 0);
  }
}

// Force Computation
// Applies Newton's Law of Gravitation between all unique body pairs
function computeGravitationalForces(bodies) {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const bi = bodies[i];
      const bj = bodies[j];

      const r = new THREE.Vector3().subVectors(bj.position, bi.position);
      const dist = r.length() + 1e-6;
      const forceMag = (G * bi.mass * bj.mass) / (dist * dist);
      const force = r.normalize().multiplyScalar(forceMag);

      bi.applyForce(force);
      bj.applyForce(force.clone().negate());
    }
  }
}
/*
This program is conceptually pretty simple. We define our constant of gravitation, then create the function to house our calculation for the given planet.
Our function creates a 3 dimensional vector so that we can calculate forces in each direction. A problem I will run into in this will be the fact that 
*/

// === Collision & Fragmentation ===
function handleCollisions(bodies) {
  const fragments = [];

  // mark bodies to remove
  const toRemove = new Set();

  // check every pair once
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i],
        B = bodies[j];
      if (A.collisionCooldown > 0 || B.collisionCooldown > 0) continue;
      const dist = A.position.distanceTo(B.position);
//colision check
      if (dist < A.radius + B.radius) {
        // Find combined momentum
        const totalMass = A.mass + B.mass;
        const velocity = A.velocity
          .clone()
          .multiplyScalar(A.mass)
          .add(B.velocity.clone().multiplyScalar(B.mass))
          .divideScalar(totalMass);

        //  Random Number of fragments, sorry, only so much I can calculate
        const N = Math.floor(Math.random() * 10)+5;
        const totalVolume = Math.pow(A.radius, 3) + Math.pow(B.radius, 3);
        const fragRadius = Math.cbrt(totalVolume / N);
        for (let k = 0; k < N; k++) {
          const angle = (k / N) * Math.PI * 2;
          const offset = new THREE.Vector3(
            Math.cos(angle),
            Math.sin(angle),
            Math.random() - 0.5
          ).multiplyScalar((A.radius + B.radius) * 0.5);

          // each fragment gets a fraction of original mass
          const m = totalMass / N;
          const r = Math.cbrt(m) * 0.1;

          // small random velocity kick
          const vKick = offset
            .clone()
            .normalize()
            .multiplyScalar(velocity.length() * 0.2);

          fragments.push(
            new Body({
              name: `Frag`,
              mass: totalMass / N, 
              radius: fragRadius*0.1,
              color: 0xff6600,
              position: A.position.clone().add(offset),
              velocity: velocity.clone().add(vKick),
            })
          );
        }

        // mark originals for removal
        toRemove.add(A);
        toRemove.add(B);
      }
    }
  }

  // remove bodies marked for removal
  for (let b of toRemove) {
    const idx = bodies.indexOf(b);
    if (idx !== -1) {
      // dispose mesh and trail if needed
      scene.remove(b.mesh);
      scene.remove(b.trailLine);
      bodies.splice(idx, 1);
    }
  }

  // add the new frags!
  bodies.push(...fragments);
}

// Random Color Hex
function generateRandomHexColor() {
  while (true) {
    const h = Math.random() * 360; 
    if (h >= 20 && h <= 40) continue; // exclude browns! No-one wants ugle colours!
    const s = Math.random() * 50 + 50; // saturation 50–100
    const l = Math.random() * 40 + 30; // lightness 30–70
    return hslToHex(h, s, l);
  }
}

// HSL to HEX: hacky script to use what I know. My b
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

//  UI Handling 
document.getElementById("add-body").addEventListener("click", () => {
  const container = document.getElementById("body-form");
  const idPrefix = `body-${bodyCount}`;

  const block = document.createElement("div");
  block.classList.add("object-block");
  block.setAttribute("data-body-id", idPrefix); // for easy deletion tracking

  block.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span class="body-name" contenteditable="false" style="cursor: pointer; font-weight: bold;">Body ${(bodyCount += 1)}</span>
      <button type="button" class="delete-body" style="color: red; background: none; border: none; font-size: 1.2em;">×</button>
    </div>
    <label>Color: <input type="color" id="${idPrefix}-color" value="${generateRandomHexColor()}" /></label>
    <label>Radius: <input type="number" id="${idPrefix}-radius" value="0.2" /></label>
    <label>Mass: <input type="number" id="${idPrefix}-mass" value="1e4" /></label>
    <label>Position X: <input type="number" id="${idPrefix}-x" value="${
    (bodyCount - 1) * 3
  }" /></label>
    <label>Position Y: <input type="number" id="${idPrefix}-y" value="0" /></label>
    <label>Position Z: <input type="number" id="${idPrefix}-z" value="0" /></label>,
    <label>Velocity X: <input type="number" id="${idPrefix}-vx" value="0" /></label>
    <label>Velocity Y: <input type="number" id="${idPrefix}-vy" value="0" /></label>
    <label>Velocity Z: <input type="number" id="${idPrefix}-vz" value="0" /></label>
  `;

  container.appendChild(block);

  // Editable name toggle
  const nameEl = block.querySelector(".body-name");
  nameEl.addEventListener("click", () => {
    nameEl.contentEditable = true;
    nameEl.focus();
  });
  nameEl.addEventListener("blur", () => {
    nameEl.contentEditable = false;
  });

  const deleteButton = block.querySelector(".delete-body");
  deleteButton.addEventListener("click", () => {
    block.remove();
    bodyCount -= 1;
  });
});

// Starts our Simulation
document.getElementById("start-simulation").addEventListener("click", () => {
 
  simulationRunning = true; 
  bodies = [];

  // Completely clear out the scene, then re‐add camera and lights
  scene.clear();
  scene.add(camera);
  scene.add(light);
  scene.add(ambientLight);

  const blocks = document.querySelectorAll(".object-block");
  blocks.forEach((block, i) => {
    const prefix = block.getAttribute("data-body-id");
    const nameEl = block.querySelector(".body-name");
    const name = nameEl ? nameEl.innerText.trim() : `Body ${i + 1}`;

    const mass = parseFloat(block.querySelector(`#${prefix}-mass`).value);
    const radius = parseFloat(block.querySelector(`#${prefix}-radius`).value);
    const color = new THREE.Color(
      block.querySelector(`#${prefix}-color`).value
    );
    const x = parseFloat(block.querySelector(`#${prefix}-x`).value);
    const y = parseFloat(block.querySelector(`#${prefix}-y`).value);
    const z = parseFloat(block.querySelector(`#${prefix}-z`).value);
    const vx = parseFloat(block.querySelector(`#${prefix}-vx`).value) * 0.0001;
    const vy = parseFloat(block.querySelector(`#${prefix}-vy`).value) * 0.0001;
    const vz = parseFloat(block.querySelector(`#${prefix}-vz`).value) * 0.0001;

    const body = new Body({
      name,
      mass,
      radius,
      color,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(vx, vy, vz),
    });

    const r = body.position.length();
    const v = body.velocity.length() || 1; // avoid division by 0
    body.maxTrailLength = Math.floor((2 * Math.PI * r) / v / 3600);

    bodies.push(body);
  });

  runSimulation(bodies);
});

// Animation Loop
// Computes gravity and updates body positions on each frame
function runSimulation(bodies) {
  // draw the scene once at t=0
  renderer.render(scene, camera);

  function animate() {
    if (!simulationRunning) return;

    // Abort if too many bodies
    if (bodies.length > MAX_BODIES) {
      simulationRunning = false;
      alert(`Simulation aborted: exceeded ${MAX_BODIES} bodies.`);
      return;
    }
    requestAnimationFrame(animate);

    if (!isPaused) {
      computeGravitationalForces(bodies);
      handleCollisions(bodies);
      bodies.forEach((body) => body.update(TIME_STEP));
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}
