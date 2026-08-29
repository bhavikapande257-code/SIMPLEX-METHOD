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
      <td><input type="text" class="g-a1" data-row="${i}" value="0" /></td>
      <td style="padding:0 0.3rem;font-family:'EB Garamond',serif;font-weight:700;color:var(--navy);">x₁ +</td>
      <td><input type="text" class="g-a2" data-row="${i}" value="0" /></td>
      <td style="padding:0 0.3rem;font-family:'EB Garamond',serif;font-weight:700;color:var(--navy);">x₂</td>
      <td>
        <select class="g-sign" data-row="${i}">
          <option value="leq">≤</option>
          <option value="geq">≥</option>
          <option value="eq">=</option>
        </select>
      </td>
      <td><input type="text" class="g-rhs" data-row="${i}" value="0" /></td>
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
function gLineSegment(a,b,rhs,maxX,maxY){
  const pts=[];
  if(Math.abs(b)>1e-10){const y0=rhs/b,yX=(rhs-a*maxX)/b;if(y0>=0&&y0<=maxY)pts.push({x:0,y:y0});if(yX>=0&&yX<=maxY)pts.push({x:maxX,y:yX});}
  if(Math.abs(a)>1e-10){const x0=rhs/a,xY=(rhs-b*maxY)/a;if(x0>=0&&x0<=maxX)pts.push({x:x0,y:0});if(xY>=0&&xY<=maxX)pts.push({x:xY,y:maxY});}
  const u=[];pts.forEach(q=>{if(!u.some(p=>Math.abs(p.x-q.x)<1e-8&&Math.abs(p.y-q.y)<1e-8))u.push(q);});
  if(u.length<=2)return u;let best=[u[0],u[1]],d=-1;for(let i=0;i<u.length;i++)for(let j=i+1;j<u.length;j++){const dd=(u[i].x-u[j].x)**2+(u[i].y-u[j].y)**2;if(dd>d){d=dd;best=[u[i],u[j]];}}return best;
}

function gConstraintLabel(c){
  const sign=c.sign==='leq'?'≤':c.sign==='geq'?'≥':'=';
  if(Math.abs(c.a2)<1e-10)return `x₁ ${sign} ${gFmt(c.rhs/c.a1)}`;
  if(Math.abs(c.a1)<1e-10)return `x₂ ${sign} ${gFmt(c.rhs/c.a2)}`;
  return `${gFmt(c.a1)}x₁ ${c.a2<0?'−':'+'} ${gFmt(Math.abs(c.a2))}x₂ ${sign} ${gFmt(c.rhs)}`;
}

// Places a text label near a target point, nudging it up/down when it would
// overlap a previously-placed label on the same canvas.
function gPlaceLabel(ctx,text,x,y,placed,align){
  align=align||'left';
  const w=ctx.measureText(text).width,h=12;
  const boxFor=yy=>({x:align==='right'?x-w:(align==='center'?x-w/2:x),y:yy-h,w,h:h+4});
  const overlaps=(a,b)=>!(a.x+a.w<b.x||b.x+b.w<a.x||a.y+a.h<b.y||b.y+b.h<a.y);
  const offsets=[0,13,-13,26,-26,39,-39,52,-52];
  let box=boxFor(y),chosen=y;
  for(const off of offsets){const cand=boxFor(y+off);if(!placed.some(p=>overlaps(cand,p))){box=cand;chosen=y+off;break;}}
  placed.push(box);
  ctx.textAlign=align;
  ctx.fillText(text,x,chosen);
}

function gDrawArrow(ctx,x1,y1,x2,y2,size=7){
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath();ctx.moveTo(x2,y2);
  ctx.lineTo(x2-size*Math.cos(a-Math.PI/6),y2-size*Math.sin(a-Math.PI/6));
  ctx.lineTo(x2-size*Math.cos(a+Math.PI/6),y2-size*Math.sin(a+Math.PI/6));
  ctx.closePath();ctx.fill();
}

function gNiceStep(v){
  if(v<=20)return 2;
  if(v<=40)return 5;
  if(v<=100)return 10;
  return Math.pow(10,Math.floor(Math.log10(v))-1);
}

function gDrawHatchedRegion(ctx,hull,X,Y){
  if(hull.length<3)return;
  ctx.save();
  ctx.beginPath();hull.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.closePath();
  ctx.fillStyle='rgba(221,213,197,0.48)';ctx.fill();ctx.clip();
  const xs=hull.map(p=>X(p.x)),ys=hull.map(p=>Y(p.y));
  const minX=Math.min(...xs)-40,maxX=Math.max(...xs)+40,minY=Math.min(...ys)-40,maxY=Math.max(...ys)+40;
  const span=(maxX-minX)+(maxY-minY);
  ctx.strokeStyle='rgba(90,80,64,0.20)';ctx.lineWidth=0.7;
  for(let k=-span;k<span;k+=7){ctx.beginPath();ctx.moveTo(minX+k,minY);ctx.lineTo(minX+k+span,maxY);ctx.stroke();}
  ctx.restore();
  ctx.save();ctx.beginPath();hull.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.closePath();
  ctx.strokeStyle='rgba(90,80,64,0.28)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
}

function drawGraph() {
  const canvas=gEl('gCanvas');if(!canvas)return;
  const W=Math.min(canvas.parentElement.clientWidth-4,680),H=W,dpr=window.devicePixelRatio||1;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  const {constraints,feasibleRegion,solution,objCoeffs,objective}=gState;

  const all=[...feasibleRegion,{x:0,y:0}];
  constraints.forEach(c=>{if(Math.abs(c.a1)>1e-10)all.push({x:c.rhs/c.a1,y:0});if(Math.abs(c.a2)>1e-10)all.push({x:0,y:c.rhs/c.a2});});
  const finite=all.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-1e-8&&p.y>=-1e-8);
  const rawX=Math.max(5,...finite.map(p=>p.x)),rawY=Math.max(5,...finite.map(p=>p.y));
  const stepX=gNiceStep(rawX),stepY=gNiceStep(rawY);
  const maxX=Math.max(stepX*3,Math.ceil(rawX/stepX)*stepX+stepX),maxY=Math.max(stepY*3,Math.ceil(rawY/stepY)*stepY+stepY);
  const pad={l:66,r:28,t:38,b:58},pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
  const X=x=>pad.l+(x/maxX)*pw,Y=y=>pad.t+ph-(y/maxY)*ph;

  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(26,39,68,0.055)';ctx.lineWidth=1;
  for(let x=0;x<=maxX+1e-9;x+=stepX){const gx=X(x);ctx.beginPath();ctx.moveTo(gx,pad.t);ctx.lineTo(gx,pad.t+ph);ctx.stroke();}
  for(let y=0;y<=maxY+1e-9;y+=stepY){const gy=Y(y);ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(pad.l+pw,gy);ctx.stroke();}

  gDrawHatchedRegion(ctx,convexHull(feasibleRegion),X,Y);

  // Tracks label boxes already drawn on this canvas so later labels avoid them.
  const placedLabels=[];

  const lineColours=['#1657c8','#d83a2e','#2b8a3e','#7b4ab5','#d28b20','#168a8a'];
  constraints.forEach((c,i)=>{
    const pts=gLineSegment(c.a1,c.a2,c.rhs,maxX,maxY);if(pts.length!==2)return;
    ctx.strokeStyle=lineColours[i%lineColours.length];ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(X(pts[0].x),Y(pts[0].y));ctx.lineTo(X(pts[1].x),Y(pts[1].y));ctx.stroke();
    const t=Math.min(.74,Math.max(.27,.40+i*.13));
    const lx=pts[0].x+(pts[1].x-pts[0].x)*t,ly=pts[0].y+(pts[1].y-pts[0].y)*t;
    ctx.fillStyle=lineColours[i%lineColours.length];ctx.font='bold 10px Lato,sans-serif';
    gPlaceLabel(ctx,gConstraintLabel(c),Math.min(W-170,X(lx)+5),Math.max(16,Y(ly)-5),placedLabels,'left');
  });

  if(solution&&(Math.abs(objCoeffs[0])>1e-10||Math.abs(objCoeffs[1])>1e-10)){
    const z=solution.value,pts=gLineSegment(objCoeffs[0],objCoeffs[1],z,maxX,maxY);
    if(pts.length===2){
      ctx.strokeStyle='#7b3fb3';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(X(pts[0].x),Y(pts[0].y));ctx.lineTo(X(pts[1].x),Y(pts[1].y));ctx.stroke();ctx.setLineDash([]);
      const q=pts[0].x>pts[1].x?pts[0]:pts[1];ctx.fillStyle='#7b3fb3';ctx.font='bold 10px Lato,sans-serif';
      gPlaceLabel(ctx,`${objective==='max'?'Max':'Min'} Z = ${gFmt(objCoeffs[0])}x₁ ${objCoeffs[1]<0?'−':'+'} ${gFmt(Math.abs(objCoeffs[1]))}x₂ = ${gFmt(z)}`,Math.min(W-230,X(q.x)-95),Math.max(18,Y(q.y)-8),placedLabels,'left');
    }
  }

  ctx.strokeStyle='#111';ctx.fillStyle='#111';ctx.lineWidth=1.8;
  ctx.beginPath();ctx.moveTo(X(0),Y(0));ctx.lineTo(X(0),pad.t+4);ctx.stroke();gDrawArrow(ctx,X(0),pad.t+12,X(0),pad.t+2);
  ctx.beginPath();ctx.moveTo(X(0),Y(0));ctx.lineTo(pad.l+pw-3,Y(0));ctx.stroke();gDrawArrow(ctx,pad.l+pw-12,Y(0),pad.l+pw-2,Y(0));
  ctx.font='bold 14px Lato,sans-serif';ctx.textAlign='left';ctx.fillText('x₁',W-31,Y(0)+27);ctx.fillText('x₂',X(0)-31,20);

  ctx.font='10px Lato,sans-serif';ctx.fillStyle='rgba(26,39,68,0.72)';ctx.textAlign='center';
  for(let x=stepX;x<maxX-1e-9;x+=stepX)ctx.fillText(gFmt(x),X(x),Y(0)+17);
  ctx.textAlign='right';for(let y=stepY;y<maxY-1e-9;y+=stepY)ctx.fillText(gFmt(y),X(0)-7,Y(y)+3);

  feasibleRegion.forEach(v=>{
    const isOpt=solution&&Math.abs(v.x-solution.point.x)<1e-7&&Math.abs(v.y-solution.point.y)<1e-7;
    ctx.fillStyle='#111';ctx.beginPath();ctx.arc(X(v.x),Y(v.y),isOpt?3.5:3,0,2*Math.PI);ctx.fill();
    ctx.fillStyle=isOpt?'#d32620':'#222';ctx.font=isOpt?'bold 11px Lato,sans-serif':'10px Lato,sans-serif';
    const dx=X(v.x)>W-105?-75:7;
    gPlaceLabel(ctx,'('+gFmt(v.x)+', '+gFmt(v.y)+')',X(v.x)+dx,Math.max(15,Y(v.y)-7),placedLabels,'left');
  });

  if(solution){
    const px=solution.point.x,py=solution.point.y;ctx.fillStyle='#e22f25';ctx.beginPath();ctx.arc(X(px),Y(py),8,0,2*Math.PI);ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#d32620';ctx.font='bold 11px Lato,sans-serif';
    gPlaceLabel(ctx,'Optimal Point ('+gFmt(px)+', '+gFmt(py)+')',Math.min(W-165,X(px)+10),Math.max(16,Y(py)-10),placedLabels,'left');
  }

  const legendX=W-190,legendY=48;ctx.fillStyle='rgba(255,255,255,.94)';ctx.strokeStyle='rgba(26,39,68,.22)';ctx.lineWidth=1;ctx.fillRect(legendX,legendY,170,58);ctx.strokeRect(legendX,legendY,170,58);
  ctx.fillStyle='#111';ctx.font='9px Lato,sans-serif';ctx.textAlign='left';
  constraints.slice(0,3).forEach((c,i)=>{ctx.strokeStyle=lineColours[i];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(legendX+8,legendY+13+i*14);ctx.lineTo(legendX+25,legendY+13+i*14);ctx.stroke();ctx.fillStyle='#222';ctx.fillText('C'+(i+1),legendX+31,legendY+16+i*14);});
  ctx.fillStyle='rgba(221,213,197,.8)';ctx.fillRect(legendX+88,legendY+8,16,10);ctx.fillStyle='#222';ctx.fillText('Feasible',legendX+109,legendY+17);
}
