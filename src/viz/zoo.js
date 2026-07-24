// Population zoo renderer: a grid of candidate airfoils, each with a few
// static streamlines computed once per generation (cached per genome), framed
// by fitness. Updates when the population changes; cheap to redraw each frame.

import { analyzeAirfoil } from "../panel.js";
import { genomeFeatures, genomeToPanels } from "../genome.js";

const DISPLAY_ALPHA = 4 * Math.PI / 180;
const STREAMLINES = 9;
const STEPS = 48;

// Trace a static streamline through a velocity field from a starting point.
function traceStreamline(field, x0, y0) {
  const pts = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  const step = 0.022;
  for (let i = 0; i < STEPS; i += 1) {
    const v = field.at(x, y);
    x += v.u * step;
    y += v.v * step;
    if (x > 1.25 || x < -0.25 || y < -0.35 || y > 0.35) break;
    pts.push({ x, y });
  }
  return pts;
}

function cellStreamlines(panels) {
  const res = analyzeAirfoil(panels, DISPLAY_ALPHA);
  if (!res) return [];
  const field = res.velocityField;
  const lines = [];
  for (let i = 0; i < STREAMLINES; i += 1) {
    const y0 = -0.28 + (i / (STREAMLINES - 1)) * 0.56;
    lines.push(traceStreamline(field, -0.2, y0));
  }
  return lines;
}

export class ZooRenderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.cache = new Map(); // genome -> { lines, panels, features }
    this._measure();
  }

  _measure() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.W = Math.max(320, Math.floor(rect.width));
    this.H = Math.max(160, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  resize() {
    this._measure();
  }

  _layout(n) {
    const cols = n <= 7 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    return { cols, rows };
  }

  _getCellData(genome) {
    // Cache by genome object identity.
    let key;
    for (const k of this.cache.keys()) if (k === genome) key = k;
    if (!key) key = genome;
    let entry = this.cache.get(key);
    if (!entry) {
      const panels = genomeToPanels(genome, 50);
      const features = genomeFeatures(genome);
      const lines = cellStreamlines(panels);
      entry = { lines, panels, features };
      this.cache.set(key, entry);
      // Bound cache size.
      if (this.cache.size > 64) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
    }
    return entry;
  }

  render(population, metrics, selectedIndex, bestIndex) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    const n = population.length;
    if (!n) return;
    const { cols, rows } = this._layout(n);
    const pad = 8;
    const cellW = (this.W - pad * (cols + 1)) / cols;
    const cellH = (this.H - pad * (rows + 1)) / rows;
    // Fitness normalization for framing.
    let fmin = Infinity;
    let fmax = -Infinity;
    for (const m of metrics) {
      if (m.fitness < fmin) fmin = m.fitness;
      if (m.fitness > fmax) fmax = m.fitness;
    }
    const frange = fmax - fmin || 1;

    for (let i = 0; i < n; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = pad + c * (cellW + pad);
      const y = pad + r * (cellH + pad);
      const data = this._getCellData(population[i]);
      const fnorm = (metrics[i].fitness - fmin) / frange; // 0..1
      this._drawCell(x, y, cellW, cellH, data, fnorm, i === selectedIndex, i === bestIndex);
    }
  }

  _drawCell(x, y, w, h, data, fnorm, selected, best) {
    const ctx = this.ctx;
    // Frame by fitness.
    ctx.fillStyle = "rgba(8,12,26,0.9)";
    ctx.fillRect(x, y, w, h);
    const glow = Math.round(40 + fnorm * 160);
    ctx.strokeStyle = best
      ? "#45f4b9"
      : selected
        ? "#ffd86b"
        : `rgba(${glow},${glow + 40},255,0.5)`;
    ctx.lineWidth = best || selected ? 2.4 : 1 + fnorm * 1.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Airfoil-space -> cell mapping.
    const fx0 = x + 8;
    const fy0 = y + 8;
    const fw = w - 16;
    const fh = h - 16;
    const X0 = -0.2;
    const X1 = 1.25;
    const Y0 = -0.32;
    const Y1 = 0.32;
    const ax = (gx) => fx0 + ((gx - X0) / (X1 - X0)) * fw;
    const ay = (gy) => fy0 + ((Y1 - gy) / (Y1 - Y0)) * fh;

    // Streamlines.
    ctx.strokeStyle = "rgba(125,211,252,0.35)";
    ctx.lineWidth = 0.8;
    for (const line of data.lines) {
      ctx.beginPath();
      line.forEach((p, i) => {
        const cx = ax(p.x);
        const cy = ay(p.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }

    // Silhouette.
    const pts = data.panels.points;
    ctx.beginPath();
    ctx.moveTo(ax(pts[0].x), ay(pts[0].y));
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(ax(pts[i].x), ay(pts[i].y));
    ctx.closePath();
    ctx.fillStyle = "rgba(69,244,185,0.18)";
    ctx.fill();
    ctx.strokeStyle = best ? "#45f4b9" : "rgba(207,220,255,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (best) {
      ctx.fillStyle = "#45f4b9";
      ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("BEST", x + 4, y + 11);
    }
  }
}