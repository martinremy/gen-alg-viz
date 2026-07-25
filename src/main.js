// Bootstrap: builds the fixed fitness references, initializes the population,
// runs the render loop (tunnel animates every frame; generations advance on a
// fixed cadence), wires controls, and updates the DOM stats/readouts.

import { setupControls } from "./controls.js";
import { initPopulation, evaluatePopulation, evolveWithLineage } from "./ga.js";
import { computeReferences, estimateAlphaCrit, polarPoint } from "./aero.js";
import { repairGenome, genomeToPanels } from "./genome.js";
import { TunnelRenderer } from "./viz/tunnel.js";
import { ZooRenderer } from "./viz/zoo.js";

const DEG = 180 / Math.PI;
const POP_SIZE = 14;
const REF_ALPHA = 4 * Math.PI / 180;

const tunnelCanvas = document.getElementById("tunnelCanvas");
const zooCanvas = document.getElementById("zooCanvas");
const tunnelCtx = tunnelCanvas.getContext("2d");
const zooCtx = zooCanvas.getContext("2d");

const tunnel = new TunnelRenderer(tunnelCanvas, tunnelCtx);
const zoo = new ZooRenderer(zooCanvas, zooCtx);

// Fixed reference airfoil: 6 control points per surface, symmetric.
function refGenome() {
  const g = {
    upper: [
      { x: 0, y: 0 },
      { x: 0.2, y: 0.05 },
      { x: 0.4, y: 0.07 },
      { x: 0.6, y: 0.07 },
      { x: 0.8, y: 0.05 },
      { x: 1, y: 0 },
    ],
    lower: [
      { x: 0, y: 0 },
      { x: 0.2, y: -0.05 },
      { x: 0.4, y: -0.06 },
      { x: 0.6, y: -0.06 },
      { x: 0.8, y: -0.04 },
      { x: 1, y: 0 },
    ],
  };
  return repairGenome(g);
}

const refs = computeReferences(genomeToPanels(refGenome(), 60), REF_ALPHA);

const state = {
  cruiseAlpha: REF_ALPHA,
  wLift: 0.5,
  wDrag: 0.5,
  stallTarget: 12 * Math.PI / 180,
  mutationRate: 0.08,
  speed: 1.5,
  playing: true,
  showSkeleton: false,
  stepOnce: false,
};

let population = initPopulation(POP_SIZE, Math.random);
let metrics = null;
let fitnesses = null;
let generation = 0;
let selectedIndex = 0;
let bestIndex = 0;
let lineage = null;
let genChangeTime = 0;
let genAccum = 0; // seconds toward next generation
let lastT = performance.now();

function currentOpts() {
  return {
    cruiseAlpha: state.cruiseAlpha,
    wLift: state.wLift,
    wDrag: state.wDrag,
    stallTarget: state.stallTarget,
  };
}

function evaluate() {
  const res = evaluatePopulation(population, currentOpts(), refs);
  fitnesses = res.fitnesses;
  metrics = res.metrics;
  // Best index.
  bestIndex = 0;
  let bf = -Infinity;
  for (let i = 0; i < fitnesses.length; i += 1) {
    if (fitnesses[i] > bf) {
      bf = fitnesses[i];
      bestIndex = i;
    }
  }
  if (selectedIndex < 0 || selectedIndex >= population.length) selectedIndex = bestIndex;
  tunnel.setAirfoil(population[selectedIndex], state.cruiseAlpha);
}

function evolveOne() {
  const res = evolveWithLineage(
    population,
    fitnesses,
    { eliteCount: 2, tournamentSize: 3, mutationRate: state.mutationRate },
    Math.random,
  );
  population = res.population;
  lineage = res.lineage;
  generation += 1;
  genChangeTime = performance.now();
  evaluate();
}

function reset() {
  population = initPopulation(POP_SIZE, Math.random);
  generation = 0;
  selectedIndex = 0;
  genAccum = 0;
  lineage = null;
  genChangeTime = 0;
  evaluate();
}

setupControls(state, (kind) => {
  if (kind === "objective") {
    // Re-evaluate current population with new objective; keep tunnel in sync.
    evaluate();
  } else if (kind === "reset") {
    reset();
  } else if (kind === "action") {
    if (state.stepOnce && !state.playing) {
      evolveOne();
      state.stepOnce = false;
    }
  }
  // "evolution" param changes apply on the next generation; nothing to do now.
});

// Zoo click selects a candidate for the wind tunnel.
zooCanvas.addEventListener("click", (e) => {
  const rect = zooCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const n = population.length;
  const { cols, rows } = zoo._layout(n);
  const pad = 8;
  const cellW = (zoo.W - pad * (cols + 1)) / cols;
  const cellH = (zoo.H - pad * (rows + 1)) / rows;
  for (let i = 0; i < n; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (cellW + pad);
    const y = pad + r * (cellH + pad);
    if (mx >= x && mx <= x + cellW && my >= y && my <= y + cellH) {
      selectedIndex = i;
      tunnel.setAirfoil(population[i], state.cruiseAlpha);
      return;
    }
  }
});

window.addEventListener("resize", () => {
  tunnel.resize();
  zoo.resize();
});

function updateStats() {
  document.getElementById("statGeneration").textContent = String(generation);
  let sum = 0;
  for (const f of fitnesses) sum += f;
  document.getElementById("statAvgFitness").textContent = (sum / fitnesses.length).toFixed(3);
  document.getElementById("statBestFitness").textContent =
    fitnesses[bestIndex].toFixed(3);
  // Tunnel readouts for the selected airfoil.
  const m = metrics[selectedIndex];
  const a = tunnel.airfoil;
  const pp = a && a.polar ? polarPoint(a.polar, state.cruiseAlpha) : { cl: 0, cd: 0 };
  document.getElementById("rCl").textContent = pp.cl.toFixed(3);
  const cd = pp.cd;
  document.getElementById("rCd").textContent = cd.toFixed(4);
  document.getElementById("rLD").textContent = cd > 1e-6 ? (pp.cl / cd).toFixed(2) : "0";
  document.getElementById("rCamber").textContent = (m.features.camber * 100).toFixed(1) + "%";
  document.getElementById("rThickness").textContent = (m.features.thickness * 100).toFixed(1) + "%";
  document.getElementById("rAlphaCrit").textContent = (estimateAlphaCrit(m.features) * DEG).toFixed(0) + "°";
}

evaluate();

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  // Generation cadence (decoupled from render).
  if (state.playing) {
    genAccum += dt;
    const period = 1 / Math.max(0.1, state.speed);
    if (genAccum >= period) {
      genAccum -= period;
      evolveOne();
    }
  }
  tunnel.update(dt);
  tunnel.render(state.showSkeleton);
  const genAge = genChangeTime > 0 ? (now - genChangeTime) / 1000 : 0;
  zoo.render(population, metrics, selectedIndex, bestIndex, lineage, genAge);
  updateStats();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);