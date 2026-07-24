// GA: population initialization, evaluation (polar + fitness per genome), and
// one generation of evolution (elitism + tournament selection + crossover +
// mutation). DOM-free.

import {
  randomGenome,
  repairGenome,
  genomeFeatures,
  genomeToPanels,
  crossover,
  mutate,
} from "./genome.js";
import { evaluatePolar, computeFitness } from "./aero.js";

const FIT_FLOOR = -1.0;

export function initPopulation(size, rng = Math.random) {
  const pop = [];
  for (let i = 0; i < size; i += 1) pop.push(repairGenome(randomGenome(rng)));
  return pop;
}

// Evaluate every genome: features, polar, and composite fitness. Non-finite
// fitnesses are floored so the GA never sees NaN.
export function evaluatePopulation(population, opts, refs) {
  const fitnesses = [];
  const metrics = [];
  for (const genome of population) {
    const features = genomeFeatures(genome);
    const panels = genomeToPanels(genome, 40);
    const polar = evaluatePolar(panels, features);
    let fitness = computeFitness(polar, features, opts, refs);
    if (!Number.isFinite(fitness)) fitness = FIT_FLOOR;
    fitnesses.push(fitness);
    metrics.push({ features, polar, fitness });
  }
  return { fitnesses, metrics };
}

// Tournament selection: return the index of the best of `k` random samples.
export function tournamentSelect(fitnesses, k, rng = Math.random) {
  let best = -1;
  let bestFit = -Infinity;
  for (let i = 0; i < k; i += 1) {
    const idx = Math.floor(rng() * fitnesses.length);
    if (fitnesses[idx] > bestFit) {
      bestFit = fitnesses[idx];
      best = idx;
    }
  }
  return best;
}

// Evolve one generation. Top `eliteCount` genomes carry over by reference; the
// rest are bred via tournament selection + crossover + mutation.
export function evolve(population, fitnesses, params, rng = Math.random) {
  const size = population.length;
  const { eliteCount, tournamentSize, mutationRate } = params;

  // Rank by fitness.
  const order = fitnesses
    .map((f, i) => [f, i])
    .sort((a, b) => b[0] - a[0]);
  const eliteIdx = new Set(order.slice(0, eliteCount).map((o) => o[1]));

  const next = [];
  // Elites carry over unchanged (by reference).
  for (const o of order.slice(0, eliteCount)) next.push(population[o[1]]);

  // Breed the rest.
  while (next.length < size) {
    const ai = tournamentSelect(fitnesses, tournamentSize, rng);
    const bi = tournamentSelect(fitnesses, tournamentSize, rng);
    const child = crossover(population[ai], population[bi], rng);
    next.push(mutate(child, mutationRate, rng));
  }

  // Defensive: elites set is not strictly needed beyond ordering, but keep the
  // contract explicit (elites first, unchanged).
  void eliteIdx;
  return next;
}