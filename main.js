import * as THREE from 'three';
let bodies = [];
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById("canvas-container");
  if (container) {
    container.appendChild(renderer.domElement);
  } else {
    console.error("Canvas container not found!");
  }
});
camera.position.z = 5;
// === Lighting ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0x222222);
scene.add(ambientLight);


const G = 6.67430e-11;
let bodyCount = 0;

// === Body Class ===
// Defines an object with mass, position, velocity, and a visible trail
class Body {
  constructor({ name, mass, radius, color, position, velocity }) {
    this.name = name;
    this.mass = mass;
    this.radius = radius;
    this.velocity = velocity.clone();
    this.position = position.clone();
    this.acceleration = new THREE.Vector3();

    //  sphere
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

    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trailGeometry.setDrawRange(0, this.trail.length);
    this.trailGeometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
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
      const forceMag = G * bi.mass * bj.mass / (dist * dist);
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








// === UI Handling ===
// Handles user input for adding new celestial bodies dynamically
document.getElementById("add-body").addEventListener("click", () => {
  const container = document.getElementById("body-form");
  const idPrefix = `body-${bodyCount}`;

  const block = document.createElement("div");
  block.classList.add("object-block");
  block.setAttribute("data-body-id", idPrefix); // for easy deletion tracking

  block.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span class="body-name" contenteditable="false" style="cursor: pointer; font-weight: bold;">Body ${bodyCount += 1}</span>
      <button type="button" class="delete-body" style="color: red; background: none; border: none; font-size: 1.2em;">×</button>
    </div>
    <label>Color: <input type="color" id="${idPrefix}-color" value="#ffffff" /></label>
    <label>Radius: <input type="number" id="${idPrefix}-radius" value="0.2" /></label>
    <label>Mass: <input type="number" id="${idPrefix}-mass" value="1e24" /></label>
    <label>Position X: <input type="number" id="${idPrefix}-x" value="${bodyCount * 3}" /></label>
    <label>Position Y: <input type="number" id="${idPrefix}-y" value="0" /></label>
    <label>Position Z: <input type="number" id="${idPrefix}-z" value="0" /></label>
    <label>Velocity X: <input type="number" id="${idPrefix}-vx" value="0" /></label>
    <label>Velocity Y: <input type="number" id="${idPrefix}-vy" value="0" /></label>
    <label>Velocity Z: <input type="number" id="${idPrefix}-vz" value="0" /></label>
  `;

  container.appendChild(block);

  // Editable name toggle
  const nameEl = block.querySelector('.body-name');
  nameEl.addEventListener('click', () => {
    nameEl.contentEditable = true;
    nameEl.focus();
  });
  nameEl.addEventListener('blur', () => {
    nameEl.contentEditable = false;
  });

  // Delete body UI block
  const deleteButton = block.querySelector('.delete-body');
  deleteButton.addEventListener('click', () => {
    block.remove();
    bodyCount -= 1;
  });

  bodyCount++;
});


// === Simulation Start ===
// Gathers form input values and initializes Body objects
document.getElementById("start-simulation").addEventListener("click", () => {
  // 1️⃣ Reset the global bodies array
  bodies = [];

  // 3️⃣ Clear the scene and re-add camera & lights
  scene.clear();
  scene.add(camera);
  scene.add(light);
  scene.add(ambientLight);

  // 2️⃣ Loop over each .object-block in the DOM
  const blocks = document.querySelectorAll(".object-block");
  blocks.forEach((block, i) => {
    const prefix = block.getAttribute("data-body-id");
    const nameEl = block.querySelector(".body-name");
    const name = nameEl ? nameEl.innerText.trim() : `Body ${i + 1}`;

    // Read inputs from THIS block only
    const mass   = parseFloat(block.querySelector(`#${prefix}-mass`).value);
    const radius = parseFloat(block.querySelector(`#${prefix}-radius`).value);
    const color  = new THREE.Color(block.querySelector(`#${prefix}-color`).value);
    const x      = parseFloat(block.querySelector(`#${prefix}-x`).value);
    const y      = parseFloat(block.querySelector(`#${prefix}-y`).value);
    const z      = parseFloat(block.querySelector(`#${prefix}-z`).value);
    const vx     = parseFloat(block.querySelector(`#${prefix}-vx`).value);
    const vy     = parseFloat(block.querySelector(`#${prefix}-vy`).value);
    const vz     = parseFloat(block.querySelector(`#${prefix}-vz`).value);

    // Instantiate the Body
    const body = new Body({
      name,
      mass,
      radius,
      color,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(vx, vy, vz),
    });

    // Optional: compute a trail length from circular‐orbit approximation
    const r = body.position.length();
    const v = body.velocity.length() || 1;
    body.maxTrailLength = Math.floor((2 * Math.PI * r / v) / 3600);

    bodies.push(body);
  });

  // Finally, (re)start the simulation loop
  runSimulation(bodies);
});


// === Animation Loop ===
// Computes gravity and updates body positions on each frame
function runSimulation(bodies) {
  function animate() {
    requestAnimationFrame(animate);
    computeGravitationalForces(bodies);
    for (let body of bodies) body.update(3600);
    renderer.render(scene, camera);
  }
  animate();
}
