// Wind tunnel renderer: live streamlines, pressure-colored airfoil, Cp plot,
// Cl-vs-alpha polar plot, force arrows, and an angle-of-attack indicator.
// Draws onto the tunnel canvas; numeric readouts live in DOM spans (updated
// by main.js). Imports the DOM-free numerical core.

import { analyzeAirfoil } from "../panel.js";
import { evaluatePolar, estimateAlphaCrit, polarPoint } from "../aero.js";
import { genomeToPanels, genomeFeatures } from "../genome.js";

const DEG = 180 / Math.PI;
const PARTICLE_COUNT = 320;
const FLOW_X0 = -0.2; // airfoil-space flow box
const FLOW_X1 = 1.25;
const FLOW_Y0 = -0.32;
const FLOW_Y1 = 0.32;

function cpColor(cp) {
  // Map Cp (typically [-3, +1]) to a blue(suction) -> green(0) -> red(pressure) ramp.
  const t = Math.max(0, Math.min(1, (cp + 3) / 4)); // 0=suction, 1=pressure
  if (t < 0.5) {
    const k = t / 0.5;
    // blue -> teal
    const r = Math.round(60 * k);
    const g = Math.round(120 + 120 * k);
    const b = Math.round(255 - 60 * k);
    return `rgb(${r},${g},${b})`;
  }
  const k = (t - 0.5) / 0.5;
  // teal -> red
  const r = Math.round(60 + 195 * k);
  const g = Math.round(240 - 200 * k);
  const b = Math.round(195 - 160 * k);
  return `rgb(${r},${g},${b})`;
}

export class TunnelRenderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.particles = [];
    this.airfoil = null; // { panels, cp, cl, polar, velocityField, features, cruiseAlpha, xMid, yMid }
    this.layout = null;
    this._measure();
    this._seedParticles();
  }

  _measure() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.W = Math.max(320, Math.floor(rect.width));
    this.H = Math.max(240, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Flow region: left ~70%, plots overlay top-right.
    this.flowX = 14;
    this.flowW = this.W - 28;
    this.flowY = 14;
    this.flowH = this.H - 28;
  }

  resize() {
    this._measure();
  }

  _seedParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      this.particles.push(this._spawnParticle(true));
    }
  }

  _spawnParticle(anywhere) {
    return {
      x: FLOW_X0 + Math.random() * 0.08,
      y: FLOW_Y0 + Math.random() * (FLOW_Y1 - FLOW_Y0),
      px: 0,
      py: 0,
      life: anywhere ? Math.random() * 120 : 80 + Math.random() * 160,
    };
  }

  _respawn(p) {
    const s = this._spawnParticle(false);
    p.x = s.x;
    p.y = s.y;
    p.life = s.life;
    p.px = p.x;
    p.py = p.y;
  }

  setAirfoil(genome, cruiseAlpha) {
    const panels = genomeToPanels(genome, 60);
    const features = genomeFeatures(genome);
    const res = analyzeAirfoil(panels, cruiseAlpha);
    const polar = evaluatePolar(panels, features);
    this.airfoil = {
      genome,
      panels,
      features,
      res,
      polar,
      velocityField: res ? res.velocityField : null,
      cruiseAlpha,
      cp: res ? res.cp : null,
      cl: res ? res.cl : 0,
      xMid: res ? res.xMid : panels.midpoints.map((m) => m.x),
      yMid: res ? res.yMid : panels.midpoints.map((m) => m.y),
    };
  }

  // airfoil-space -> canvas-space
  _ax(x) {
    return this.flowX + ((x - FLOW_X0) / (FLOW_X1 - FLOW_X0)) * this.flowW;
  }
  _ay(y) {
    return this.flowY + ((FLOW_Y1 - y) / (FLOW_Y1 - FLOW_Y0)) * this.flowH;
  }

  update(dt) {
    if (!this.airfoil || !this.airfoil.velocityField) return;
    const field = this.airfoil.velocityField;
    const step = Math.min(dt, 0.05) * 0.9;
    for (const p of this.particles) {
      p.px = p.x;
      p.py = p.y;
      const v = field.at(p.x, p.y);
      p.x += v.u * step;
      p.y += v.v * step;
      p.life -= 1;
      if (
        p.x > FLOW_X1 ||
        p.x < FLOW_X0 - 0.05 ||
        p.y < FLOW_Y0 ||
        p.y > FLOW_Y1 ||
        p.life <= 0
      ) {
        this._respawn(p);
      }
    }
  }

  render(showSkeleton) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawBackground();
    if (this.airfoil) {
      this._drawStreamlines();
      this._drawAirfoil(showSkeleton);
      this._drawForceArrows();
      this._drawAlphaIndicator();
      this._drawCpPlot();
      this._drawPolarPlot();
    }
  }

  _drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = "#0a0f1f";
    ctx.fillRect(this.flowX, this.flowY, this.flowW, this.flowH);
    ctx.strokeStyle = "rgba(125,211,252,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1; x += 0.25) {
      ctx.beginPath();
      ctx.moveTo(this._ax(x), this.flowY);
      ctx.lineTo(this._ax(x), this.flowY + this.flowH);
      ctx.stroke();
    }
  }

  _drawStreamlines() {
    const ctx = this.ctx;
    ctx.lineWidth = 1.2;
    for (const p of this.particles) {
      const speed = Math.hypot(p.x - p.px, p.y - p.py);
      const alpha = Math.max(0.12, Math.min(0.6, 0.1 + speed * 8));
      ctx.strokeStyle = `rgba(125,211,252,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(this._ax(p.px), this._ay(p.py));
      ctx.lineTo(this._ax(p.x), this._ay(p.y));
      ctx.stroke();
    }
  }

  _drawAirfoil(showSkeleton) {
    const ctx = this.ctx;
    const pts = this.airfoil.panels.points;
    const cp = this.airfoil.cp;
    const N = pts.length;
    // Fill body.
    ctx.beginPath();
    ctx.moveTo(this._ax(pts[0].x), this._ay(pts[0].y));
    for (let i = 1; i < N; i += 1) ctx.lineTo(this._ax(pts[i].x), this._ay(pts[i].y));
    ctx.closePath();
    ctx.fillStyle = "rgba(10,15,31,0.85)";
    ctx.fill();
    // Surface colored by Cp, per panel.
    if (cp) {
      ctx.lineWidth = 3;
      for (let i = 0; i < N; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % N];
        ctx.strokeStyle = cpColor(cp[i]);
        ctx.beginPath();
        ctx.moveTo(this._ax(a.x), this._ay(a.y));
        ctx.lineTo(this._ax(b.x), this._ay(b.y));
        ctx.stroke();
      }
    }
    if (showSkeleton) {
      const g = this.airfoil.genome;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      for (const surf of [g.upper, g.lower]) {
        ctx.beginPath();
        ctx.moveTo(this._ax(surf[0].x), this._ay(surf[0].y));
        for (let i = 1; i < surf.length; i += 1)
          ctx.lineTo(this._ax(surf[i].x), this._ay(surf[i].y));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffd86b";
      for (const surf of [g.upper, g.lower])
        for (const p of surf) {
          ctx.beginPath();
          ctx.arc(this._ax(p.x), this._ay(p.y), 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
    }
  }

  _drawForceArrows() {
    const ctx = this.ctx;
    const a = this.airfoil;
    const alpha = a.cruiseAlpha;
    // Aerodynamic center ~ quarter chord.
    const cx = this._ax(0.25);
    const cy = this._ay(0);
    const pp = polarPoint(a.polar, alpha);
    const cl = pp.cl;
    const cdv = pp.cd;
    const scale = 60;
    // Lift perpendicular to freestream: (-sin a, cos a) (screen y flipped).
    const lx = -Math.sin(alpha) * cl * scale;
    const ly = -Math.cos(alpha) * cl * scale;
    this._arrow(cx, cy, cx + lx, cy + ly, "#45f4b9", `L=${cl.toFixed(2)}`);
    // Drag along freestream (tiny proxy): along +x.
    this._arrow(cx, cy, cx + cdv * scale * 6, cy, "#ff9f6b", `D=${cdv.toFixed(3)}`);
  }

  _arrow(x0, y0, x1, y1, color, label) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const hl = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(ang - 0.4), y1 - hl * Math.sin(ang - 0.4));
    ctx.lineTo(x1 - hl * Math.cos(ang + 0.4), y1 - hl * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(label, x1 + 6, y1);
    }
  }

  _drawAlphaIndicator() {
    const ctx = this.ctx;
    const a = this.airfoil;
    const x = this.flowX + 20;
    const y = this.flowY + this.flowH - 20;
    const alpha = a.cruiseAlpha;
    const len = 46;
    ctx.strokeStyle = "rgba(219,231,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
    // freestream arrow at angle alpha (positive alpha = flow from lower-left)
    const ax = x + len / 2;
    const ay = y - Math.tan(alpha) * len;
    ctx.strokeStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y + Math.tan(alpha) * len);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`α=${(alpha * DEG).toFixed(0)}°`, x + len / 2 + 6, y + 4);
  }

  _plotFrame(x, y, w, h, title) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8,12,26,0.78)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(125,211,252,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#cfdcff";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(title, x + 6, y + 12);
    return { x, y, w, h };
  }

  _drawCpPlot() {
    const a = this.airfoil;
    if (!a.cp) return;
    const ctx = this.ctx;
    const w = 150;
    const h = 92;
    const px = this.W - w - 14;
    const py = this.H - h - 14;
    const f = this._plotFrame(px, py, w, h, "Cp (-Cp vs x/c)");
    const x0 = f.x + 8;
    const y0 = f.y + 18;
    const pw = f.w - 12;
    const ph = f.h - 24;
    // Cp range: x in [0,1], -Cp in [-1, 3] (suction up)
    const mapX = (xc) => x0 + xc * pw;
    const mapY = (ncp) => y0 + ((3 - ncp) / 4) * ph; // ncp=-Cp, suction(positive) up
    // baseline ncp=0
    ctx.strokeStyle = "rgba(125,211,252,0.15)";
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(0));
    ctx.lineTo(mapX(1), mapY(0));
    ctx.stroke();
    // upper (yMid>0) and lower sorted by x
    const upper = [];
    const lower = [];
    for (let i = 0; i < a.cp.length; i += 1) {
      (a.yMid[i] >= 0 ? upper : lower).push({ x: a.xMid[i], cp: a.cp[i] });
    }
    upper.sort((p, q) => p.x - q.x);
    lower.sort((p, q) => p.x - q.x);
    const drawLine = (arr, color, dash) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash || []);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      arr.forEach((p, i) => {
        const X = mapX(p.x);
        const Y = mapY(-p.cp);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawLine(upper, "#7dd3fc");
    drawLine(lower, "#ff9f6b", [4, 3]);
  }

  _drawPolarPlot() {
    const a = this.airfoil;
    if (!a.polar) return;
    const ctx = this.ctx;
    const w = 150;
    const h = 92;
    const px = this.W - w - 14;
    const py = this.H - h - 14 - 92 - 8;
    const f = this._plotFrame(px, py, w, h, "Cl vs α");
    const x0 = f.x + 8;
    const y0 = f.y + 16;
    const pw = f.w - 12;
    const ph = f.h - 22;
    const amax = 16 * Math.PI / 180;
    const clmax = Math.max(0.4, ...a.polar.map((p) => Math.abs(p.cl)));
    const mapA = (al) => x0 + (al / amax) * pw;
    const mapCl = (cl) => y0 + ph - ((cl + 0.1) / (clmax + 0.2)) * ph;
    // axes
    ctx.strokeStyle = "rgba(125,211,252,0.15)";
    ctx.beginPath();
    ctx.moveTo(x0, mapCl(0));
    ctx.lineTo(x0 + pw, mapCl(0));
    ctx.stroke();
    // polar curve
    ctx.strokeStyle = "#45f4b9";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    a.polar.forEach((p, i) => {
      const X = mapA(p.alpha);
      const Y = mapCl(p.cl);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    // stall point (alpha_crit)
    const ac = estimateAlphaCrit(a.features);
    ctx.fillStyle = "#ff6b81";
    ctx.beginPath();
    ctx.arc(mapA(ac), mapCl(2 * Math.PI * ac), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6b81";
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("stall", mapA(ac) + 4, mapCl(2 * Math.PI * ac) - 3);
    // cruise alpha marker
    const ca = a.cruiseAlpha;
    ctx.strokeStyle = "rgba(255,216,107,0.8)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(mapA(ca), y0);
    ctx.lineTo(mapA(ca), y0 + ph);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}