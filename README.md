# Airfoil Evolution Lab

A single-page, zero-dependency HTML + JavaScript app that visualizes a
genetic algorithm evolving 2D airfoil (wing cross-section) shapes. A live
aerodynamics fitness function — a 2D inviscid panel method evaluated across
an angle-of-attack polar — drives the evolution. The user can reshape the
optimization objective at runtime (cruise angle of attack, lift weight, drag
weight, stall margin) and watch the population re-optimize.

## Run it

The app uses ES modules, which browsers won't load over `file://`, so serve
it with any static file server. For example, with Python:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

Pure-logic modules (linear algebra, geometry, the panel solver, aerodynamics,
genome, GA) are unit-tested with Node's built-in test runner — no dependencies
required.

```bash
npm test
```

## Tech

Vanilla JavaScript (ES modules), Canvas 2D, `node --test`. No external
libraries, no build step.