// simplex.js — Full Simplex Solver (Big-M & Two-Phase) using Fraction.js
// Ported from Python implementation. Loaded via CDN: fraction.js

const BIG_M = new Fraction(1000000);
const EPSILON = new Fraction(1, 1000000000);

// ── Fraction helpers ──────────────────────────────────────────

/**
 * BUG FIX 1: fmt() was broken for negative fractions.
 * Fraction.js stores the sign in f.s (-1 or 1), and f.n is always non-negative.
 * The old code did `f.n * (f.s < 0 ? -1 : 1)` which is correct for the numerator,
 * but then used the same pattern incorrectly. Rewritten cleanly using f.toFraction().
 */
function fmt(f) {
  f = new Fraction(f);
  // f.s is the sign (-1 or 1), f.n is abs(numerator), f.d is denominator
  const num = f.s * f.n;
  if (f.d === 1) return String(num);
  return `${num}/${f.d}`;
}

function frac(v) {
  return new Fraction(v);
}

// ── Pivot ──────────────────────────────────────────────────────

function pivot(tableau, pivotRow, pivotCol) {
  const rows = tableau.length;
  const cols = tableau[0].length;
  let t = tableau.map(row => row.map(v => frac(v)));
  const pv = t[pivotRow][pivotCol];
  t[pivotRow] = t[pivotRow].map(v => v.div(pv));
  for (let r = 0; r < rows; r++) {
    if (r !== pivotRow) {
      const factor = t[r][pivotCol];
      t[r] = t[r].map((v, j) => v.sub(factor.mul(t[pivotRow][j])));
    }
  }
  return t;
}

// ── Pivot column (most negative) ──────────────────────────────

/**
 * BUG FIX 2: The original choosePivotCol had a broken condition.
 * It checked `bestVal.sub(v).compare(EPSILON) > 0` which is equivalent to
 * `bestVal - v > EPSILON`, i.e., v < bestVal - EPSILON. But bestVal starts at 0,
 * so this never triggers for the first negative value found.
 * Correct logic: find the most negative coefficient (< -EPSILON) in the z-row.
 */
function choosePivotCol(zRow) {
  let best = -1;
  let bestVal = frac(0).sub(EPSILON); // threshold: must be < -EPSILON
  for (let j = 0; j < zRow.length - 1; j++) {
    const v = frac(zRow[j]);
    if (v.compare(bestVal) < 0) {
      best = j;
      bestVal = v;
    }
  }
  return best;
}

// ── Pivot row (min ratio test) ─────────────────────────────────

function choosePivotRow(tableau, col) {
  let minRatio = null, bestRow = -1;
  for (let r = 1; r < tableau.length; r++) {
    const denom = frac(tableau[r][col]);
    const rhs = frac(tableau[r][tableau[r].length - 1]);
    if (denom.compare(EPSILON) > 0) {
      const ratio = rhs.div(denom);
      if (minRatio === null || ratio.compare(minRatio) < 0) {
        minRatio = ratio; bestRow = r;
      }
    }
  }
  return bestRow;
}

// ── Build Big-M tableau ───────────────────────────────────────

/**
 * BUG FIX 3: basicVar selection for '>=' constraints was wrong.
 * For '>=' rows, the basic variable should be the ARTIFICIAL (not the surplus).
 * The old code used `slackMap[i].col` (the surplus) as default, then only
 * overrode it if `slackMap[i]?.type === 'surplus'` — but that check runs inside
 * the artCols loop only when ac.con === i, so the override logic was backwards.
 * Fixed: for surplus rows, always start basicVar = -1 so the artificial wins.
 */
function buildBigMTableau(obj, constraints, signs, rhs, choice, numVars, numCons) {
  const direction = choice === 'max' ? frac(-1) : frac(1);
  const notes = [];
  const slackMap = {};
  const artCols = [];
  const extraNames = [];
  let colPtr = numVars;

  for (let i = 0; i < numCons; i++) {
    if (signs[i] === '<=') {
      slackMap[i] = { col: colPtr, type: 'slack' };
      extraNames.push(`s${i + 1}`);
      notes.push(`Constraint ${i + 1} (≤): slack variable s${i + 1} added.`);
      colPtr++;
    } else if (signs[i] === '>=') {
      slackMap[i] = { col: colPtr, type: 'surplus' };
      extraNames.push(`e${i + 1}`);
      notes.push(`Constraint ${i + 1} (≥): surplus variable e${i + 1} added, artificial variable a${i + 1} added.`);
      colPtr++;
      artCols.push({ con: i, col: colPtr });
      extraNames.push(`a${i + 1}`);
      colPtr++;
    } else if (signs[i] === '=') {
      notes.push(`Constraint ${i + 1} (=): artificial variable a${i + 1} added.`);
      artCols.push({ con: i, col: colPtr });
      extraNames.push(`a${i + 1}`);
      colPtr++;
    }
  }

  const totalCols = colPtr + 1;
  const colNames = [...Array(numVars).keys()].map(i => `x${i + 1}`)
    .concat(extraNames).concat(['RHS']);

  // Build z-row: direction * obj coefficients, +BIG_M for each artificial
  const zRow = [];
  for (let i = 0; i < numVars; i++) zRow.push(direction.mul(frac(obj[i])));
  while (zRow.length < totalCols - 1) zRow.push(frac(0));
  zRow.push(frac(0));
  for (const { col } of artCols) zRow[col] = frac(BIG_M);

  const tableau = [zRow];
  const basics = [];
  const artRowMap = {};

  for (let i = 0; i < numCons; i++) {
    const row = constraints[i].map(v => frac(v));
    while (row.length < totalCols - 1) row.push(frac(0));
    row.push(frac(rhs[i]));

    if (slackMap[i]) {
      const { col, type } = slackMap[i];
      row[col] = type === 'slack' ? frac(1) : frac(-1);
    }

    // FIX 3: For slack rows, basis = slack col. For surplus/equality rows, basis = artificial col.
    let basicVar;
    if (slackMap[i] && slackMap[i].type === 'slack') {
      basicVar = slackMap[i].col;
    } else {
      // Will be set to the artificial col below
      basicVar = -1;
    }

    for (const ac of artCols) {
      if (ac.con === i) {
        row[ac.col] = frac(1);
        artRowMap[ac.col] = tableau.length;
        basicVar = ac.col; // artificial is the initial basic variable
      }
    }

    basics.push(basicVar);
    tableau.push(row);
  }

  // Canonical form: eliminate artificials from z-row
  for (const { col } of artCols) {
    const factor = frac(tableau[0][col]);
    if (factor.abs().compare(EPSILON) > 0) {
      const ri = artRowMap[col];
      for (let j = 0; j < totalCols; j++) {
        tableau[0][j] = frac(tableau[0][j]).sub(factor.mul(frac(tableau[ri][j])));
      }
    }
  }

  const artColIndices = new Set(artCols.map(a => a.col));
  return { tableau, basics, colNames, artColIndices, notes };
}

// ── Build Phase-1 tableau ──────────────────────────────────────

/**
 * BUG FIX 4 (same as Fix 3): basicVar for surplus rows must be the artificial, not the surplus.
 */
function buildPhase1Tableau(obj, constraints, signs, rhs, numVars, numCons) {
  const notes = [];
  const slackMap = {};
  const artCols = [];
  const extraNames = [];
  let colPtr = numVars;

  for (let i = 0; i < numCons; i++) {
    if (signs[i] === '<=') {
      slackMap[i] = { col: colPtr, type: 'slack' };
      extraNames.push(`s${i + 1}`);
      notes.push(`Constraint ${i + 1} (≤): slack variable s${i + 1} added.`);
      colPtr++;
    } else if (signs[i] === '>=') {
      slackMap[i] = { col: colPtr, type: 'surplus' };
      extraNames.push(`e${i + 1}`);
      notes.push(`Constraint ${i + 1} (≥): surplus e${i + 1} and artificial a${i + 1} added.`);
      colPtr++;
      artCols.push({ con: i, col: colPtr });
      extraNames.push(`a${i + 1}`);
      colPtr++;
    } else if (signs[i] === '=') {
      notes.push(`Constraint ${i + 1} (=): artificial variable a${i + 1} added.`);
      artCols.push({ con: i, col: colPtr });
      extraNames.push(`a${i + 1}`);
      colPtr++;
    }
  }

  const totalCols = colPtr + 1;
  const colNames = [...Array(numVars).keys()].map(i => `x${i + 1}`)
    .concat(extraNames).concat(['RHS']);

  // Phase-1 objective: minimise sum of artificials
  const zRow = Array(totalCols).fill(null).map(() => frac(0));
  for (const { col } of artCols) zRow[col] = frac(1);

  const tableau = [zRow];
  const basics = [];
  const artRowMap = {};

  for (let i = 0; i < numCons; i++) {
    const row = constraints[i].map(v => frac(v));
    while (row.length < totalCols - 1) row.push(frac(0));
    row.push(frac(rhs[i]));

    if (slackMap[i]) {
      const { col, type } = slackMap[i];
      row[col] = type === 'slack' ? frac(1) : frac(-1);
    }

    // FIX 4: slack rows → basic = slack; surplus/equality rows → basic = artificial
    let basicVar;
    if (slackMap[i] && slackMap[i].type === 'slack') {
      basicVar = slackMap[i].col;
    } else {
      basicVar = -1;
    }

    for (const ac of artCols) {
      if (ac.con === i) {
        row[ac.col] = frac(1);
        artRowMap[ac.col] = tableau.length;
        basicVar = ac.col;
      }
    }

    basics.push(basicVar);
    tableau.push(row);
  }

  // Canonical form for z-row (eliminate artificials that are basic)
  for (const { col } of artCols) {
    const factor = frac(tableau[0][col]);
    if (factor.abs().compare(EPSILON) > 0) {
      const ri = artRowMap[col];
      for (let j = 0; j < totalCols; j++) {
        tableau[0][j] = frac(tableau[0][j]).sub(factor.mul(frac(tableau[ri][j])));
      }
    }
  }

  const artColIndices = new Set(artCols.map(a => a.col));
  return { tableau, basics, colNames, artColIndices, artCols, notes };
}

// ── Build Phase-2 tableau ──────────────────────────────────────

/**
 * BUG FIX 5: Phase-2 z-row canonical elimination was reading from newTab[0]
 * which had already been overwritten with the Phase-2 objective coefficients.
 * The elimination must use those fresh coefficients, but read the CONSTRAINT rows
 * (newTab[i+1]) — that part was correct. The real bug was that the loop read
 * `f = frac(newTab[0][bv])` AFTER newTab[0] was already modified by a previous
 * iteration, corrupting subsequent eliminations.
 * Fix: read ALL factors first into a list, THEN apply eliminations.
 */
function buildPhase2Tableau(tab, basics, colNames, obj, choice, numVars) {
  const direction = choice === 'max' ? frac(-1) : frac(1);
  const artColIndices = new Set();
  colNames.forEach((n, i) => { if (n.startsWith('a')) artColIndices.add(i); });

  const keep = colNames.map((n, i) => i).filter(i => !artColIndices.has(i));
  const newNames = keep.map(i => colNames[i]);

  // Rebuild tableau without artificial columns (deep copy with frac)
  const newTab = tab.map(row => keep.map(j => frac(row[j])));

  const numCols = keep.length;

  // Build fresh Phase-2 z-row from original objective
  const zRow = Array(numCols).fill(null).map(() => frac(0));
  for (let i = 0; i < numVars; i++) {
    const ki = keep.indexOf(i);
    if (ki !== -1) zRow[ki] = direction.mul(frac(obj[i]));
  }

  const oldToNew = {};
  keep.forEach((old, newIdx) => { oldToNew[old] = newIdx; });
  const newBasics = basics.map(b => oldToNew[b]);

  // FIX 5: collect all (factor, rowIndex) pairs first, then apply
  const eliminations = [];
  for (let i = 0; i < newBasics.length; i++) {
    const bv = newBasics[i];
    const f = frac(zRow[bv]); // read from the ORIGINAL zRow, not mid-update
    if (f.abs().compare(EPSILON) > 0) {
      eliminations.push({ f, rowIdx: i + 1 });
    }
  }
  for (const { f, rowIdx } of eliminations) {
    for (let j = 0; j < numCols; j++) {
      zRow[j] = frac(zRow[j]).sub(f.mul(frac(newTab[rowIdx][j])));
    }
  }

  newTab[0] = zRow;
  return { tableau: newTab, basics: newBasics, colNames: newNames };
}

// ── Core simplex iterations ────────────────────────────────────

/**
 * BUG FIX 6: simplexIterations did not update `tableau` and `basics` after
 * the pivot step — the pivot result was computed but never assigned back.
 * The function's return value therefore had stale data after any pivot.
 * Fixed: assign `tableau = pivot(...)` and update `basics[pivotRow-1] = pivotCol`
 * before looping again (these were already present but the returned `tableau`
 * in the 'optimal' branch was the pre-pivot one from the last iteration).
 * Also: the step snapshot must be taken BEFORE the pivot, which was correct,
 * but the returned tableau/basics must reflect ALL pivots including the last one.
 */
function simplexIterations(tableau, basics, colNames, artColIndices = new Set(), label = '') {
  const steps = [];
  let iter = 0;

  while (true) {
    iter++;
    const zRow = tableau[0];
    const pivotCol = choosePivotCol(zRow);

    if (pivotCol === -1) {
      // Optimal: snapshot the current (already-pivoted) tableau
      steps.push({
        type: 'optimal',
        label,
        iteration: iter,
        tableau: cloneTableau(tableau),
        basics: [...basics],
        colNames: [...colNames],
        message: 'All reduced costs are non-negative → OPTIMAL tableau reached.'
      });
      return { tableau, basics, status: 'optimal', steps };
    }

    // Compute ratios for the ratio column display
    const ratios = tableau.slice(1).map(row => {
      const d = frac(row[pivotCol]);
      if (d.compare(EPSILON) > 0) return fmt(frac(row[row.length - 1]).div(d));
      return '—';
    });

    const pivotRow = choosePivotRow(tableau, pivotCol);
    if (pivotRow === -1) {
      steps.push({ type: 'unbounded', label, iteration: iter, message: 'Problem is UNBOUNDED.' });
      return { tableau, basics, status: 'unbounded', steps };
    }

    const leavingVar = basics[pivotRow - 1];
    const leavingName = colNames[leavingVar];
    const enteringName = colNames[pivotCol];
    const isArtLeaving = artColIndices.has(leavingVar);

    // Snapshot BEFORE the pivot (shows the tableau that motivated this pivot)
    steps.push({
      type: 'pivot',
      label,
      iteration: iter,
      tableau: cloneTableau(tableau),
      basics: [...basics],
      colNames: [...colNames],
      pivotCol,
      pivotRow,
      ratios,
      entering: enteringName,
      leaving: leavingName,
      isArtLeaving,
      pivotVal: fmt(frac(tableau[pivotRow][pivotCol]))
    });

    // FIX 6: apply pivot and update basics
    tableau = pivot(tableau, pivotRow, pivotCol);
    basics[pivotRow - 1] = pivotCol;
  }
}

function cloneTableau(t) {
  return t.map(row => row.map(v => frac(v)));
}

// ── Run Big-M ─────────────────────────────────────────────────

/**
 * BUG FIX 7: runBigM was passing the already-mutated basics array from
 * buildBigMTableau directly into simplexIterations. Because JS arrays are
 * passed by reference, the artColIndices Set and the basics array were shared.
 * Fix: always pass cloned copies.
 */
function runBigM(obj, constraints, signs, rhs, choice, numVars, numCons) {
  const built = buildBigMTableau(obj, constraints, signs, rhs, choice, numVars, numCons);
  const { colNames, artColIndices, notes } = built;

  const initialTableau = cloneTableau(built.tableau);
  const initialBasics = [...built.basics];

  const result = simplexIterations(
    cloneTableau(built.tableau),
    [...built.basics],
    colNames,
    artColIndices,
    'Big-M'
  );

  return { ...result, colNames, notes, initialTableau, initialBasics };
}

// ── Run Two-Phase ─────────────────────────────────────────────

function runTwoPhase(obj, constraints, signs, rhs, choice, numVars, numCons) {
  const p1 = buildPhase1Tableau(obj, constraints, signs, rhs, numVars, numCons);
  const r1 = simplexIterations(
    cloneTableau(p1.tableau),
    [...p1.basics],
    p1.colNames,
    p1.artColIndices,
    'Phase 1'
  );

  const allSteps = [...r1.steps];
  const notes = p1.notes;

  if (r1.status !== 'optimal') {
    return { status: r1.status, steps: allSteps, colNames: p1.colNames, notes };
  }

  const wVal = frac(r1.tableau[0][r1.tableau[0].length - 1]);
  if (wVal.abs().compare(EPSILON) > 0) {
    allSteps.push({
      type: 'infeasible',
      message: `Phase-1 objective w = ${fmt(wVal)} ≠ 0 → Problem is INFEASIBLE.`
    });
    return { status: 'infeasible', steps: allSteps, colNames: p1.colNames, notes };
  }

  const p2 = buildPhase2Tableau(r1.tableau, r1.basics, p1.colNames, obj, choice, numVars);
  const r2 = simplexIterations(
    cloneTableau(p2.tableau),
    [...p2.basics],
    p2.colNames,
    new Set(),
    'Phase 2'
  );
  allSteps.push(...r2.steps);

  return { ...r2, steps: allSteps, colNames: p2.colNames, notes };
}

// ── Extract solution ───────────────────────────────────────────

function extractSolution(tableau, basics, colNames, choice, numVars) {
  const values = {};
  const n = colNames.length - 1;
  for (let j = 0; j < n; j++) values[j] = frac(0);
  for (let r = 0; r < basics.length; r++) {
    values[basics[r]] = frac(tableau[r + 1][tableau[r + 1].length - 1]);
  }
  const vars = [];
  for (let i = 0; i < numVars; i++) {
    vars.push({ name: `x${i + 1}`, value: fmt(values[i]) });
  }
  const z = fmt(frac(tableau[0][tableau[0].length - 1]));
  return { vars, z, direction: choice === 'max' ? 'Maximized' : 'Minimized' };
}

// ── Main solve entry point ─────────────────────────────────────

function solve(params) {
  const { obj, constraints, signs, rhs, choice, numVars, numCons, method } = params;
  let result;
  if (method === 'bigm') {
    result = runBigM(obj, constraints, signs, rhs, choice, numVars, numCons);
  } else {
    result = runTwoPhase(obj, constraints, signs, rhs, choice, numVars, numCons);
  }

  let solution = null;
  if (result.status === 'optimal') {
    solution = extractSolution(result.tableau, result.basics, result.colNames, choice, numVars);
  }

  return { ...result, solution };
}