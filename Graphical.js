// ============================================================
//  GRAPHICAL METHOD SOLVER — Two Variables
//  graphical.js
// ============================================================

'use strict';

// ── State ────────────────────────────────────────────────────
let gState = {
  numCons: 2,
  objective: 'max',
  objCoeffs: [],       // [c1, c2]
  constraints: [],     // [{a1, a2, sign, rhs}]
  vertices: [],
  feasibleRegion: [],
  solution: null,
  steps: [],
  canvas: null,
  ctx: null,
};

// ── Utility ──────────────────────────────────────────────────
function gParseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function gFmt(n) {
  if (n === undefined || n === null) return '?';
  if (Number.isInteger(n)) return String(n);
  // Show up to 4 decimals, strip trailing zeros
  return parseFloat(n.toFixed(4)).toString();
}

// ── DOM helpers ──────────────────────────────────────────────
function gShow(id) { document.getElementById(id).style.display = ''; }
function gHide(id) { document.getElementById(id).style.display = 'none'; }
function gEl(id)   { return document.getElementById(id); }

// ── Generate Input Fields ────────────────────────────────────
function gGenerateForm() {
  gState.numCons = parseInt(gEl('gNumCons').value) || 2;
  gState.objective = document.querySelector('input[name="gObjective"]:checked').value;

  // Build constraints table
  const tbody = gEl('gConBody');
  tbody.innerHTML = '';

  for (let i = 0; i < gState.numCons; i++) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="row-label">C${i + 1}</td>
      <td><input type="text" class="g-a1" data-row="${i}" value="1" /></td>
      <td style="padding:0 0.3rem;font-family:'EB Garamond',serif;font-weight:700;color:var(--navy);">x₁ +</td>
      <td><input type="text" class="g-a2" data-row="${i}" value="1" /></td>
      <td style="padding:0 0.3rem;font-family:'EB Garamond',serif;font-weight:700;color:var(--navy);">x₂</td>
      <td>
        <select class="g-sign" data-row="${i}">
          <option value="leq">≤</option>
          <option value="geq">≥</option>
          <option value="eq">=</option>
        </select>
      </td>
      <td><input type="text" class="g-rhs" data-row="${i}" value="${(i + 1) * 4}" /></td>
    `;
    tbody.appendChild(row);
  }

  gShow('gFormArea');
  gEl('gFormArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Solve ────────────────────────────────────────────────────
function gSolve() {
  // Collect objective
  const c1 = gParseNum(gEl('gObj1').value);
  const c2 = gParseNum(gEl('gObj2').value);
  gState.objCoeffs = [c1, c2];
  gState.objective = document.querySelector('input[name="gObjective"]:checked').value;

  // Collect constraints
  const a1s = document.querySelectorAll('.g-a1');
  const a2s = document.querySelectorAll('.g-a2');
  const signs = document.querySelectorAll('.g-sign');
  const rhss = document.querySelectorAll('.g-rhs');

  gState.constraints = [];
  for (let i = 0; i < gState.numCons; i++) {
    gState.constraints.push({
      a1: gParseNum(a1s[i].value),
      a2: gParseNum(a2s[i].value),
      sign: signs[i].value,
      rhs: gParseNum(rhss[i].value),
    });
  }

  // Always add x1≥0, x2≥0 as non-negativity
  const cons = [...gState.constraints];

  // Compute intersection points (corner points of feasible region)
  const vertices = computeVertices(cons);
  gState.vertices = vertices;

  // Filter feasible vertices
  const feasible = vertices.filter(v => isFeasible(v, cons));
  gState.feasibleRegion = feasible;

  // Build steps
  gState.steps = buildSteps(cons, feasible, [c1, c2], gState.objective);

  // Find optimal
  gState.solution = findOptimal(feasible, [c1, c2], gState.objective);

  // Render
  renderGResults();
}

// ── Geometry ─────────────────────────────────────────────────
function lineIntersect(a1, b1, c1, a2, b2, c2) {
  // Solves: a1*x + b1*y = c1
  //         a2*x + b2*y = c2
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-10) return null;
  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;
  if (!isFinite(x) || !isFinite(y)) return null;
  return { x, y };
}

function constraintToLine(c) {
  // a1*x + a2*y sign rhs  → a1*x + a2*y = rhs
  return { a: c.a1, b: c.a2, c: c.rhs };
}

function computeVertices(cons) {
  const pts = [];
  const lines = cons.map(constraintToLine);

  // Add axis lines: x=0 (a=1,b=0,c=0) and y=0 (a=0,b=1,c=0)
  const axisLines = [
    { a: 1, b: 0, c: 0 }, // x1 = 0
    { a: 0, b: 1, c: 0 }, // x2 = 0
  ];
  const allLines = [...lines, ...axisLines];

  for (let i = 0; i < allLines.length; i++) {
    for (let j = i + 1; j < allLines.length; j++) {
      const pt = lineIntersect(allLines[i].a, allLines[i].b, allLines[i].c,
        allLines[j].a, allLines[j].b, allLines[j].c);
      if (pt && pt.x >= -1e-9 && pt.y >= -1e-9) {
        pts.push({ x: Math.max(0, pt.x), y: Math.max(0, pt.y) });
      }
    }
  }

  // Also check axis intercepts per constraint
  for (const l of lines) {
    if (Math.abs(l.a) > 1e-10) {
      const x = l.c / l.a;
      if (x >= -1e-9) pts.push({ x: Math.max(0, x), y: 0 });
    }
    if (Math.abs(l.b) > 1e-10) {
      const y = l.c / l.b;
      if (y >= -1e-9) pts.push({ x: 0, y: Math.max(0, y) });
    }
  }

  // Origin
  pts.push({ x: 0, y: 0 });

  // Deduplicate
  const unique = [];
  for (const p of pts) {
    if (!unique.some(u => Math.abs(u.x - p.x) < 1e-8 && Math.abs(u.y - p.y) < 1e-8))
      unique.push(p);
  }
  return unique;
}

function satisfies(pt, c) {
  const lhs = c.a1 * pt.x + c.a2 * pt.y;
  if (c.sign === 'leq') return lhs <= c.rhs + 1e-8;
  if (c.sign === 'geq') return lhs >= c.rhs - 1e-8;
  return Math.abs(lhs - c.rhs) <= 1e-8;
}

function isFeasible(pt, cons) {
  return cons.every(c => satisfies(pt, c));
}

function evalObj(pt, coeffs) {
  return coeffs[0] * pt.x + coeffs[1] * pt.y;
}

function findOptimal(feasible, coeffs, dir) {
  if (!feasible.length) return null;
  let best = feasible[0];
  let bestVal = evalObj(best, coeffs);
  for (const pt of feasible) {
    const v = evalObj(pt, coeffs);
    if (dir === 'max' ? v > bestVal : v < bestVal) {
      best = pt; bestVal = v;
    }
  }
  return { point: best, value: bestVal };
}

// Sort vertices in convex order for polygon drawing
function convexHull(pts) {
  if (pts.length < 3) return pts;
  // Find centroid
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

// ── Step Builder ─────────────────────────────────────────────
function buildSteps(cons, feasible, coeffs, dir) {
  const steps = [];

  steps.push({
    type: 'setup',
    title: 'Step 1 — Plot the Constraint Lines',
    body: `Each constraint boundary is a straight line. We plot all <strong>${cons.length}</strong> constraint line(s) plus the non-negativity conditions x₁ ≥ 0 and x₂ ≥ 0 on the x₁–x₂ plane.`,
    detail: cons.map((c, i) => {
      const lhs = `${gFmt(c.a1)}x₁ + ${gFmt(c.a2)}x₂`;
      const sign = c.sign === 'leq' ? '≤' : c.sign === 'geq' ? '≥' : '=';
      return `C${i + 1}: ${lhs} ${sign} ${gFmt(c.rhs)}`;
    })
  });

  steps.push({
    type: 'region',
    title: 'Step 2 — Identify the Feasible Region',
    body: `The feasible region is the intersection of all half-planes defined by the constraints (including x₁ ≥ 0, x₂ ≥ 0). For each constraint, choose a test point (e.g., the origin) to determine which side of the boundary line satisfies the inequality.`,
    detail: cons.map((c, i) => {
      const lhs0 = c.a1 * 0 + c.a2 * 0;
      const sign = c.sign === 'leq' ? '≤' : c.sign === 'geq' ? '≥' : '=';
      const test = satisfies({ x: 0, y: 0 }, c);
      return `C${i + 1}: At origin → ${gFmt(lhs0)} ${sign} ${gFmt(c.rhs)} → <strong style="color:${test ? 'var(--accent-enter)' : 'var(--accent-leave)'}">${test ? 'Satisfied ✓' : 'Not satisfied ✗'}</strong>`;
    })
  });

  const corners = feasible.map((v, i) => {
    const z = evalObj(v, coeffs);
    return `V${i + 1}: (${gFmt(v.x)}, ${gFmt(v.y)}) → Z = ${gFmt(coeffs[0])}×${gFmt(v.x)} + ${gFmt(coeffs[1])}×${gFmt(v.y)} = <strong>${gFmt(z)}</strong>`;
  });

  steps.push({
    type: 'corners',
    title: 'Step 3 — Find Corner Points (Vertices)',
    body: `The optimal solution always occurs at a <em>corner point</em> (vertex) of the feasible region. Corner points are found by solving pairs of boundary-line equations simultaneously.`,
    detail: feasible.length
      ? [`Found ${feasible.length} feasible vertex/vertices:`].concat(corners)
      : ['No feasible vertices found — the problem may be infeasible.']
  });

  steps.push({
    type: 'evaluate',
    title: 'Step 4 — Evaluate Objective at Each Corner',
    body: `We evaluate Z = ${gFmt(coeffs[0])}x₁ + ${gFmt(coeffs[1])}x₂ at every corner point, then select the vertex that gives the <strong>${dir === 'max' ? 'maximum' : 'minimum'}</strong> value.`,
    detail: corners
  });

  return steps;
}

// ── Render Results ────────────────────────────────────────────
function renderGResults() {
  const area = gEl('gResultsInner');
  area.innerHTML = '';
  gShow('gResults');

  const { objCoeffs, objective, constraints, feasibleRegion, steps, solution } = gState;
  const dir = objective === 'max' ? 'Maximise' : 'Minimise';

  // Problem Summary
  area.innerHTML += `
    <div class="panel">
      <div class="panel-title">Problem Summary</div>
      <p style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;margin-bottom:1rem;color:var(--navy)">
        ${dir} Z = ${gFmt(objCoeffs[0])}x₁ + ${gFmt(objCoeffs[1])}x₂
      </p>
      <p style="font-size:0.78rem;color:var(--muted);margin-bottom:0.6rem;letter-spacing:1px;text-transform:uppercase;font-weight:500">Subject to:</p>
      ${constraints.map((c, i) => {
        const sign = c.sign === 'leq' ? '≤' : c.sign === 'geq' ? '≥' : '=';
        return `<p style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:var(--text);margin-bottom:0.3rem">
          C${i + 1}: ${gFmt(c.a1)}x₁ + ${gFmt(c.a2)}x₂ ${sign} ${gFmt(c.rhs)}</p>`;
      }).join('')}
      <p style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:var(--muted);margin-top:0.6rem">x₁ ≥ 0,  x₂ ≥ 0</p>
    </div>`;

  // Steps
  for (const step of steps) {
    area.innerHTML += `
      <div class="panel">
        <div class="panel-title">${step.title}</div>
        <p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:${step.detail?.length ? '1rem' : '0'}">${step.body}</p>
        ${step.detail ? `<ul class="notes-list">${step.detail.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
      </div>`;
  }

  // Graph
  area.innerHTML += `
    <div class="panel">
      <div class="panel-title">Step 5 — Graphical Representation</div>
      <canvas id="gCanvas" style="width:100%;max-width:640px;display:block;margin:0 auto;border:1.5px solid var(--rule);background:#fff;"></canvas>
      <div id="gLegend" style="margin-top:1.2rem;display:flex;flex-wrap:wrap;gap:0.8rem;justify-content:center;font-size:0.8rem;color:var(--muted);"></div>
    </div>`;

  // Result banner
  if (!feasibleRegion.length) {
    area.innerHTML += `<div class="result-banner infeasible"><span class="banner-icon">🚫</span><div>
      <strong>Problem is Infeasible</strong><br>
      <span style="font-size:0.85rem">No feasible region exists — constraints are contradictory.</span>
    </div></div>`;
  } else if (!solution) {
    area.innerHTML += `<div class="result-banner unbounded"><span class="banner-icon">♾️</span><div>
      <strong>Problem may be Unbounded</strong><br>
      <span style="font-size:0.85rem">No finite optimal vertex found.</span>
    </div></div>`;
  } else {
    area.innerHTML += `<div class="result-banner optimal"><span class="banner-icon">✅</span><div>
      <strong>Optimal solution found</strong><br>
      <span style="font-size:0.85rem">The objective is optimized at a corner point of the feasible region.</span>
    </div></div>`;

    area.innerHTML += `
      <div class="panel">
        <div class="panel-title">Optimal Solution</div>
        <div class="solution-grid">
          <div class="solution-card"><div class="var-name">x₁</div><div class="var-val">${gFmt(solution.point.x)}</div></div>
          <div class="solution-card"><div class="var-name">x₂</div><div class="var-val">${gFmt(solution.point.y)}</div></div>
          <div class="solution-card z-card"><div class="var-name">Z (${objective})</div><div class="var-val">${gFmt(solution.value)}</div></div>
        </div>
        <p style="font-size:0.82rem;color:var(--muted);margin-top:1rem;line-height:1.6;">
          The optimal point <strong>(${gFmt(solution.point.x)}, ${gFmt(solution.point.y)})</strong> is a vertex of the feasible polygon.
          It was selected because it gives the <strong>${objective === 'max' ? 'highest' : 'lowest'}</strong> objective value
          among all <strong>${feasibleRegion.length}</strong> corner point(s).
        </p>
      </div>`;
  }

  gEl('gResults').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Draw graph after DOM settles
  setTimeout(drawGraph, 60);
}

// ── Canvas Drawing ───────────────────────────────────────────
function drawGraph() {
  const canvas = gEl('gCanvas');
  if (!canvas) return;

  // Retina sizing
  const W = Math.min(canvas.parentElement.clientWidth - 4, 640);
  const H = W;
  canvas.width  = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const { constraints, feasibleRegion, solution, objCoeffs, objective } = gState;

  // Determine axis bounds
  const allPts = [...feasibleRegion];
  // Also include intercepts for bounds
  for (const c of constraints) {
    if (Math.abs(c.a1) > 1e-10) allPts.push({ x: c.rhs / c.a1, y: 0 });
    if (Math.abs(c.a2) > 1e-10) allPts.push({ x: 0, y: c.rhs / c.a2 });
  }
  allPts.push({ x: 0, y: 0 });

  let maxX = Math.max(...allPts.map(p => p.x), 5);
  let maxY = Math.max(...allPts.map(p => p.y), 5);
  maxX *= 1.25; maxY *= 1.25;

  // If OBJ line visible: also clamp direction along objective
  const pad = { top: 40, right: 40, bottom: 55, left: 55 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const toCanvasX = x => pad.left + (x / maxX) * plotW;
  const toCanvasY = y => pad.top + plotH - (y / maxY) * plotH;

  // Background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(26,39,68,0.05)';
  ctx.lineWidth = 1;
  const gridCount = 8;
  for (let i = 0; i <= gridCount; i++) {
    const gx = toCanvasX(i * maxX / gridCount);
    const gy = toCanvasY(i * maxY / gridCount);
    ctx.beginPath(); ctx.moveTo(gx, pad.top); ctx.lineTo(gx, pad.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + plotW, gy); ctx.stroke();
  }

  // Feasible region fill
  if (feasibleRegion.length >= 3) {
    const hull = convexHull(feasibleRegion);
    ctx.beginPath();
    ctx.moveTo(toCanvasX(hull[0].x), toCanvasY(hull[0].y));
    for (let i = 1; i < hull.length; i++) ctx.lineTo(toCanvasX(hull[i].x), toCanvasY(hull[i].y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(42,122,78,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(42,122,78,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (feasibleRegion.length === 2) {
    // Line segment
    ctx.beginPath();
    ctx.moveTo(toCanvasX(feasibleRegion[0].x), toCanvasY(feasibleRegion[0].y));
    ctx.lineTo(toCanvasX(feasibleRegion[1].x), toCanvasY(feasibleRegion[1].y));
    ctx.strokeStyle = 'rgba(42,122,78,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Constraint lines
  const colors = ['#1a2744','#b8922a','#2a7a4e','#7a2a7a','#2a5a7a','#b83232'];
  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i];
    const color = colors[i % colors.length];
    // Draw line across the visible domain
    let pts2 = [];
    // At x=0: y = (rhs - a1*0)/a2
    if (Math.abs(c.a2) > 1e-10) pts2.push({ x: 0, y: c.rhs / c.a2 });
    // At y=0: x = rhs/a1
    if (Math.abs(c.a1) > 1e-10) pts2.push({ x: c.rhs / c.a1, y: 0 });
    // At x=maxX: y = (rhs - a1*maxX)/a2
    if (Math.abs(c.a2) > 1e-10) pts2.push({ x: maxX, y: (c.rhs - c.a1 * maxX) / c.a2 });
    // At y=maxY: x = (rhs - a2*maxY)/a1
    if (Math.abs(c.a1) > 1e-10) pts2.push({ x: (c.rhs - c.a2 * maxY) / c.a1, y: maxY });
    // Clamp to viewport
    pts2 = pts2.filter(p => p.x >= -0.01 && p.x <= maxX + 0.01 && p.y >= -0.01 && p.y <= maxY + 0.01);

    if (pts2.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(pts2[0].x), toCanvasY(pts2[0].y));
      ctx.lineTo(toCanvasX(pts2[pts2.length - 1].x), toCanvasY(pts2[pts2.length - 1].y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label the line
      const midX = (pts2[0].x + pts2[pts2.length - 1].x) / 2;
      const midY = (pts2[0].y + pts2[pts2.length - 1].y) / 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 11px "Lato", sans-serif';
      ctx.fillText(`C${i + 1}`, toCanvasX(midX) + 4, toCanvasY(midY) - 4);
    }
  }

  // Objective function iso-line through optimal (if exists)
  if (solution) {
    const z = solution.value;
    const [c1, c2] = objCoeffs;
    // c1*x + c2*y = z  →  at x=0: y=z/c2; at y=0: x=z/c1
    let optPts = [];
    if (Math.abs(c2) > 1e-10) {
      optPts.push({ x: 0, y: z / c2 });
      optPts.push({ x: maxX, y: (z - c1 * maxX) / c2 });
    } else if (Math.abs(c1) > 1e-10) {
      optPts.push({ x: z / c1, y: 0 });
      optPts.push({ x: z / c1, y: maxY });
    }
    optPts = optPts.filter(p => p.x >= -0.01 && p.x <= maxX + 0.01 && p.y >= -0.01 && p.y <= maxY + 0.01);
    if (optPts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(optPts[0].x), toCanvasY(optPts[0].y));
      ctx.lineTo(toCanvasX(optPts[optPts.length - 1].x), toCanvasY(optPts[optPts.length - 1].y));
      ctx.strokeStyle = 'rgba(184,50,50,0.75)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(184,50,50,0.85)';
      ctx.font = 'bold 10px "Lato", sans-serif';
      ctx.fillText(`Z=${gFmt(z)}`, toCanvasX(optPts[0].x) + 4, toCanvasY(optPts[0].y) - 5);
    }
  }

  // Axes
  ctx.strokeStyle = 'rgba(26,39,68,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + plotH + 12); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad.left - 12, pad.top + plotH); ctx.lineTo(pad.left + plotW, pad.top + plotH); ctx.stroke();

  // Axis labels
  ctx.fillStyle = 'rgba(26,39,68,0.85)';
  ctx.font = 'bold 13px "Lato", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('x₁', pad.left + plotW + 12, pad.top + plotH + 5);
  ctx.save(); ctx.translate(pad.left - 12, pad.top - 10); ctx.fillText('x₂', 0, 0); ctx.restore();

  // Tick labels
  ctx.font = '10px "Lato", sans-serif';
  ctx.fillStyle = 'rgba(26,39,68,0.5)';
  ctx.textAlign = 'center';
  for (let i = 1; i <= gridCount; i++) {
    const val = (i * maxX / gridCount);
    if (val <= maxX) {
      const px = toCanvasX(val);
      ctx.fillText(gFmt(parseFloat(val.toFixed(2))), px, pad.top + plotH + 14);
    }
    const val2 = (i * maxY / gridCount);
    if (val2 <= maxY) {
      const py = toCanvasY(val2);
      ctx.textAlign = 'right';
      ctx.fillText(gFmt(parseFloat(val2.toFixed(2))), pad.left - 5, py + 3);
      ctx.textAlign = 'center';
    }
  }

  // Corner point dots
  for (let i = 0; i < feasibleRegion.length; i++) {
    const v = feasibleRegion[i];
    const cx2 = toCanvasX(v.x), cy2 = toCanvasY(v.y);
    const isOpt = solution && Math.abs(v.x - solution.point.x) < 1e-7 && Math.abs(v.y - solution.point.y) < 1e-7;

    ctx.beginPath();
    ctx.arc(cx2, cy2, isOpt ? 7 : 5, 0, 2 * Math.PI);
    ctx.fillStyle = isOpt ? '#b83232' : 'rgba(26,39,68,0.85)';
    ctx.fill();
    if (isOpt) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = isOpt ? '#b83232' : 'rgba(26,39,68,0.75)';
    ctx.font = isOpt ? 'bold 11px "Lato", sans-serif' : '10px "Lato", sans-serif';
    ctx.textAlign = 'left';
    const labelX = cx2 + 8;
    const labelY = cy2 - 6;
    ctx.fillText(`V${i + 1}(${gFmt(v.x)}, ${gFmt(v.y)})`, labelX, labelY);
  }

  // Legend
  const legend = gEl('gLegend');
  const legendItems = constraints.map((_, i) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;">
      <span style="width:20px;height:3px;background:${colors[i % colors.length]};display:inline-block;"></span> C${i+1}
    </span>`
  );
  legendItems.push(`<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:20px;height:3px;background:rgba(42,122,78,0.5);display:inline-block;border-top:2px dashed rgba(42,122,78,0.5);"></span> Feasible Region</span>`);
  if (solution) legendItems.push(`<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:20px;height:3px;background:rgba(184,50,50,0.75);display:inline-block;border-top:2px dashed rgba(184,50,50,0.6);"></span> Optimal Iso-line (Z=${gFmt(solution.value)})</span>`);
  legend.innerHTML = legendItems.join('');
}