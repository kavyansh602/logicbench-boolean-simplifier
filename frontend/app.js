// ─────────────────────────────────────────────────────────────────────────────
// LogicBench  ·  app.js
// Quine-McCluskey + Petrick's Method Boolean Minimiser
// ─────────────────────────────────────────────────────────────────────────────

// State: 16 cells — 0 = zero, 1 = one, 2 = don't-care (X)
const cells = new Array(16).fill(0);
let hoveredPiMask = null;
let lastRes = null;
let typing = false;   // true while the user edits the expression box

// Colour palette for PI loops (index → CSS class suffix)
const LOOP_COLOR_COUNT = 5;

const GRAY_ROWS = [0, 1, 3, 2];   // AB: 00, 01, 11, 10
const GRAY_COLS = [0, 1, 3, 2];   // CD: 00, 01, 11, 10
const ROW_LABELS = ['00', '01', '11', '10'];
const COL_LABELS = ['00', '01', '11', '10'];

// ─── Preset Loader ───────────────────────────────────────────────────────────
function loadPreset(name) {
    cells.fill(0);
    switch (name) {
        case 'default':
            [0, 1, 2, 5, 6, 7, 8, 9, 10, 14].forEach(i => cells[i] = 1);
            [4, 15].forEach(i => cells[i] = 2);
            break;
        case 'bcd7':
            [0, 2, 3, 5, 6, 7, 8, 9].forEach(i => cells[i] = 1);
            [10, 11, 12, 13, 14, 15].forEach(i => cells[i] = 2);
            break;
        case 'prime':
            [2, 3, 5, 7, 11, 13].forEach(i => cells[i] = 1);
            break;
        case 'xor':
            [1, 2, 4, 7, 8, 11, 13, 14].forEach(i => cells[i] = 1);
            break;
        // 'clear' leaves all zeros
    }
    updateAll();
}

// ─── Expression Parser ───────────────────────────────────────────────────────
// Accepts: A'B + C(D ^ A) · !A & (B | C) · A AND NOT B · Σm(1,3,7) + d(5) · F(A,B,C,D) = ...
// Precedence: NOT (' ! ~) > AND (* & · or juxtaposition) > XOR (^ ⊕) > OR (+ | ∨)
function compileExpr(src) {
    const toks = [], re = /\s*([()'!~¬+|∨*&·∧^⊕]|[A-Za-z]+|[01])/y;
    for (let pos = 0; pos < src.length;) {
        re.lastIndex = pos;
        const m = re.exec(src);
        if (!m) {
            if (/^\s*$/.test(src.slice(pos))) break;
            throw new Error(`Unexpected "${src.slice(pos).trim()[0]}"`);
        }
        pos = re.lastIndex;
        const t = m[1];
        if (/^[A-Za-z]+$/.test(t)) {
            const kw = { AND: '&', OR: '+', NOT: '!', XOR: '^' }[t.toUpperCase()];
            if (kw) toks.push(kw);
            else for (const ch of t.toUpperCase()) {
                if (!'ABCD'.includes(ch)) throw new Error(`Variable "${ch}" not supported (use A–D)`);
                toks.push(ch);
            }
        } else toks.push(t);
    }
    let i = 0;
    const peek = () => toks[i];
    const starts = t => t !== undefined && /^[A-D01(!~¬]$/.test(t);
    const inSet = (t, set) => t !== undefined && set.includes(t);

    function pOr() {
        let l = pXor();
        while (inSet(peek(), '+|∨')) { i++; const a = l, r = pXor(); l = v => a(v) | r(v); }
        return l;
    }
    function pXor() {
        let l = pAnd();
        while (inSet(peek(), '^⊕')) { i++; const a = l, r = pAnd(); l = v => a(v) ^ r(v); }
        return l;
    }
    function pAnd() {
        let l = pNot();
        for (;;) {
            if (inSet(peek(), '*&·∧')) i++;
            else if (!starts(peek())) break;
            const a = l, r = pNot(); l = v => a(v) & r(v);
        }
        return l;
    }
    function pNot() {
        if (inSet(peek(), '!~¬')) { i++; const x = pNot(); return v => x(v) ^ 1; }
        let a = pAtom();
        while (peek() === "'") { i++; const x = a; a = v => x(v) ^ 1; }
        return a;
    }
    function pAtom() {
        const t = peek();
        i++;
        if (t === '(') {
            const e = pOr();
            if (peek() !== ')') throw new Error('Missing closing ")"');
            i++;
            return e;
        }
        if (t === '0' || t === '1') return () => +t;
        if (t && 'ABCD'.includes(t) && /^[A-D]$/.test(t)) { const sh = 3 - 'ABCD'.indexOf(t); return v => (v >> sh) & 1; }
        throw new Error(t === undefined ? 'Expression ends unexpectedly' : `Unexpected "${t}"`);
    }
    if (!toks.length) throw new Error('Enter an expression');
    const f = pOr();
    if (i < toks.length) throw new Error(`Unexpected "${toks[i]}"`);
    return f;
}

function parseInput(src) {
    const body = src.trim().replace(/^F\s*(\([^)]*\))?\s*=\s*/i, '');
    const mm = body.match(/^[Σ∑]?\s*m\s*\(([^)]*)\)\s*(?:\+\s*[Σ∑]?\s*d\s*\(([^)]*)\))?$/i);
    if (mm) {
        const nums = t => (t || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
            const v = Number(x);
            if (!Number.isInteger(v) || v < 0 || v > 15) throw new Error(`"${x}" is not a minterm in 0–15`);
            return v;
        });
        const c = new Array(16).fill(0);
        nums(mm[2]).forEach(k => c[k] = 2);
        nums(mm[1]).forEach(k => c[k] = 1);
        return c;
    }
    const f = compileExpr(body);
    return Array.from({ length: 16 }, (_, k) => f(k));
}

// ─── Quine-McCluskey Solver ───────────────────────────────────────────────────
function solveQM() {
    const minterms  = [];
    const dontCares = [];
    cells.forEach((v, i) => {
        if (v === 1) minterms.push(i);
        else if (v === 2) dontCares.push(i);
    });

    if (minterms.length === 0)
        return { expr: '0', pis: [], selected: [] };

    if (minterms.length + dontCares.length === 16)
        return {
            expr: '1',
            pis: [{ mask: '----', expr: '1', cov: [...Array(16).keys()], essential: true, selected: true }],
            selected: [{ mask: '----', expr: '1', cov: [...Array(16).keys()] }]
        };

    const allTerms = [...minterms, ...dontCares].sort((a, b) => a - b);
    let groups = {};
    allTerms.forEach(m => {
        const bin  = m.toString(2).padStart(4, '0');
        const ones = bin.split('').filter(c => c === '1').length;
        if (!groups[ones]) groups[ones] = {};
        groups[ones][bin] = new Set([m]);
    });

    const primeImplicants = {};

    while (Object.keys(groups).length > 0) {
        const nextGroups = {};
        const combined   = new Set();
        const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);

        for (let i = 0; i < keys.length - 1; i++) {
            const g1 = keys[i], g2 = keys[i + 1];
            if (g2 - g1 !== 1) continue;
            for (const [t1, cov1] of Object.entries(groups[g1])) {
                for (const [t2, cov2] of Object.entries(groups[g2])) {
                    let diff = 0, merged = '';
                    for (let b = 0; b < 4; b++) {
                        if (t1[b] !== t2[b]) { diff++; merged += '-'; }
                        else merged += t1[b];
                    }
                    if (diff === 1) {
                        combined.add(t1); combined.add(t2);
                        const ones = merged.split('').filter(c => c === '1').length;
                        if (!nextGroups[ones]) nextGroups[ones] = {};
                        if (!nextGroups[ones][merged]) nextGroups[ones][merged] = new Set();
                        cov1.forEach(x => nextGroups[ones][merged].add(x));
                        cov2.forEach(x => nextGroups[ones][merged].add(x));
                    }
                }
            }
        }

        for (const grp of Object.values(groups))
            for (const [term, cov] of Object.entries(grp))
                if (!combined.has(term))
                    primeImplicants[term] = Array.from(cov).sort((a, b) => a - b);

        groups = nextGroups;
    }

    const vars = ['A', 'B', 'C', 'D'];
    const maskToExpr = mask => {
        if (mask === '----') return '1';
        return mask.split('')
            .map((b, i) => b === '1' ? vars[i] : (b === '0' ? vars[i] + "'" : ''))
            .join('');
    };

    // Essential PI selection
    const uncovered    = new Set(minterms);
    const essentialMasks = new Set();
    minterms.forEach(m => {
        const covering = Object.keys(primeImplicants).filter(mask => primeImplicants[mask].includes(m));
        if (covering.length === 1) essentialMasks.add(covering[0]);
    });

    const selectedMasks = new Set(essentialMasks);
    essentialMasks.forEach(mask => primeImplicants[mask].forEach(m => uncovered.delete(m)));

    // Exact minimum cover of the remaining minterms (branch & bound):
    // fewest product terms first, then fewest literals.
    const litCount = mask => 4 - mask.split('').filter(c => c === '-').length;
    const pool = Object.keys(primeImplicants).filter(k => !selectedMasks.has(k));
    let best = null;
    (function search(unc, chosen, lits) {
        if (!unc.length) {
            if (!best || chosen.length < best.n || (chosen.length === best.n && lits < best.l))
                best = { n: chosen.length, l: lits, set: chosen };
            return;
        }
        if (best && (chosen.length + 1 > best.n || (chosen.length + 1 === best.n && lits >= best.l))) return;
        const m = unc[0];
        for (const k of pool.filter(k => primeImplicants[k].includes(m))) {
            search(unc.filter(x => !primeImplicants[k].includes(x)), [...chosen, k], lits + litCount(k));
        }
    })([...uncovered].sort((a, b) => a - b), [], 0);
    if (best) best.set.forEach(k => selectedMasks.add(k));

    const piList = Object.entries(primeImplicants).map(([mask, cov]) => ({
        mask,
        expr: maskToExpr(mask),
        cov,
        essential: essentialMasks.has(mask),
        selected:  selectedMasks.has(mask)
    }));

    const selectedList = piList.filter(p => p.selected);
    return {
        expr: selectedList.map(p => p.expr).join(' + '),
        pis:  piList,
        selected: selectedList
    };
}

// ─── Gate Schematic Renderer ──────────────────────────────────────────────────
const LOOP_HEX = ['#3B6DE8', '#1B9E63', '#C5860E', '#D94040', '#7C47DC'];

function renderSchematic(selectedPIs) {
    const svg = document.getElementById('schematicSvg');
    if (selectedPIs.length === 0) {
        svg.innerHTML = `<text x="160" y="90" text-anchor="middle"
            font-family="JetBrains Mono" font-size="12" fill="#9C9589">Output Constant 0</text>`;
        return;
    }

    const count   = Math.min(selectedPIs.length, 4);
    const spacing = 140 / (count + 1);
    let html = '';

    selectedPIs.slice(0, 4).forEach((pi, idx) => {
        const y     = Math.round(15 + spacing * (idx + 1));
        const color = LOOP_HEX[idx % LOOP_HEX.length];
        html += `<text x="12" y="${y + 4}" font-family="JetBrains Mono" font-size="11"
                    font-weight="600" fill="#1A1714">${pi.expr}</text>`;
        html += `<line x1="62" y1="${y}" x2="110" y2="${y}"
                    stroke="${color}" stroke-width="1.8"/>`;
        html += `<path d="M110,${y - 12} L128,${y - 12} A12,12 0 0,1 128,${y + 12} L110,${y + 12} Z"
                    fill="#FFFFFF" stroke="#1A1714" stroke-width="1.5"/>`;
        html += `<path d="M140,${y} L180,${y} L195,85"
                    fill="none" stroke="${color}" stroke-width="1.5"/>`;
    });

    html += `<path d="M190,62 Q202,85 190,108 Q222,106 238,85 Q222,64 190,62 Z"
                fill="#FFFFFF" stroke="#1A1714" stroke-width="1.8"/>`;
    html += `<line x1="238" y1="85" x2="275" y2="85" stroke="#1A1714" stroke-width="2"/>`;
    html += `<text x="282" y="89" font-family="JetBrains Mono" font-size="12"
                font-weight="700" fill="#1A1714">F</text>`;

    svg.innerHTML = html;
}

// ─── Main Update ─────────────────────────────────────────────────────────────
function updateAll() {
    const res      = solveQM();
    const minterms = [], dontCares = [];
    cells.forEach((v, i) => {
        if (v === 1) minterms.push(i);
        if (v === 2) dontCares.push(i);
    });

    // ── Result ribbon
    document.getElementById('sopOutput').textContent =
        `F(A,B,C,D) = ${res.expr}`;
    document.getElementById('epiCountBadge').textContent =
        `${res.selected.length} Term${res.selected.length === 1 ? '' : 's'}`;
    document.getElementById('mintermSummary').textContent =
        `Σm(${minterms.join(', ') || '∅'})`;
    document.getElementById('dontCareSummary').textContent =
        dontCares.length ? `+ d(${dontCares.join(', ')})` : '';

    const canonLits = minterms.length * 4;
    const minLits   = res.selected.reduce(
        (acc, p) => acc + (4 - p.mask.split('').filter(c => c === '-').length), 0);
    const pct = canonLits > 0
        ? (((canonLits - minLits) / canonLits) * 100).toFixed(1)
        : '0.0';

    document.getElementById('minLiterals').textContent   = minLits;
    document.getElementById('canonLiterals').textContent = canonLits;
    const andGates = res.selected.filter(p => p.mask.replace(/-/g, '').length > 1).length;
    document.getElementById('gateCount').textContent     = andGates + (res.selected.length > 1 ? 1 : 0);
    document.getElementById('reductionPct').textContent  = `${pct}%`;

    // ── Verify: the cover must be 1 on every minterm, 0 on every zero (X is free)
    const covered = new Set(res.selected.flatMap(p => p.cov));
    const ok = cells.every((v, k) => v === 2 || (v === 1) === covered.has(k));
    const vb = document.getElementById('verifyBadge');
    vb.textContent = ok ? '✓ Verified equivalent' : '✗ Mismatch';
    vb.className = `chip mono ${ok ? 'green' : 'accent'}`;

    // ── Keep the expression box in sync with K-map / truth-table edits
    if (!typing) {
        const inp = document.getElementById('exprInput');
        inp.value = minterms.length || dontCares.length
            ? `Σm(${minterms.join(',')})${dontCares.length ? ` + d(${dontCares.join(',')})` : ''}` : '0';
        inp.classList.remove('invalid');
        document.getElementById('exprStatus').textContent = '';
    }

    // ── Karnaugh Map
    lastRes = res;
    renderKMap(res);

    // ── PI pills
    const piPills = document.getElementById('piPills');
    piPills.innerHTML = '';
    res.selected.forEach((pi, i) => {
        const pill = document.createElement('span');
        pill.className = `pi-pill loop-${i % LOOP_COLOR_COUNT}`;
        pill.textContent = `${pi.expr} (${pi.mask})`;
        pill.onmouseenter = () => { hoveredPiMask = pi.mask; renderKMap(lastRes); };
        pill.onmouseleave = () => { hoveredPiMask = null; renderKMap(lastRes); };
        piPills.appendChild(pill);
    });

    // ── PI Coverage table
    const tbody = document.getElementById('piTableBody');
    tbody.innerHTML = '';
    res.pis.forEach(pi => {
        const tr = document.createElement('tr');
        if (pi.selected) tr.classList.add('pi-row-selected');

        let roleBadge;
        if (pi.essential) {
            roleBadge = `<span class="role-badge essential">★ Essential</span>`;
        } else if (pi.selected) {
            roleBadge = `<span class="role-badge selected">Selected</span>`;
        } else {
            roleBadge = `<span class="role-badge redundant">Redundant</span>`;
        }

        tr.innerHTML = `
            <td>${pi.expr}</td>
            <td>${pi.mask}</td>
            <td>${pi.cov.join(', ')}</td>
            <td>${roleBadge}</td>
        `;
        tr.onmouseenter = () => { hoveredPiMask = pi.mask; renderKMap(lastRes); };
        tr.onmouseleave = () => { hoveredPiMask = null; renderKMap(lastRes); };
        tbody.appendChild(tr);
    });

    // ── Verilog HDL
    const vTerms = res.selected.map(pi => {
        if (pi.mask === '----') return "1'b1";
        const parts = [];
        ['A', 'B', 'C', 'D'].forEach((v, idx) => {
            if (pi.mask[idx] === '1') parts.push(v);
            else if (pi.mask[idx] === '0') parts.push(`~${v}`);
        });
        return `(${parts.join(' & ')})`;
    });
    document.getElementById('verilogCode').textContent =
`module boolean_minimized (
  input  wire A, B, C, D,
  output wire F
);
  // Minimized via Quine-McCluskey (${minLits} literals)
  assign F = ${vTerms.length ? vTerms.join(' |\n             ') : "1'b0"};
endmodule`;

    // ── Gate schematic
    renderSchematic(res.selected);

    // ── Truth table
    const ttBody = document.getElementById('truthTableBody');
    ttBody.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const bin = i.toString(2).padStart(4, '0');
        const st  = cells[i];
        const fClass = st === 1 ? 'f-one' : st === 2 ? 'f-dc' : 'f-zero';
        const fText  = st === 2 ? 'X' : st;
        const tr = document.createElement('tr');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.onclick = () => { cells[i] = (cells[i] + 1) % 3; updateAll(); };
        tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.onclick(); } };
        tr.innerHTML = `
            <td>${i}</td>
            <td>${bin[0]}</td>
            <td>${bin[1]}</td>
            <td>${bin[2]}</td>
            <td>${bin[3]}</td>
            <td class="${fClass}">${fText}</td>
        `;
        ttBody.appendChild(tr);
    }
}

// ─── Karnaugh Map Renderer ────────────────────────────────────────────────────
function renderKMap(res) {
    const container = document.getElementById('kmapContainer');
    container.innerHTML = '';

    // Corner label
    const corner = document.createElement('div');
    corner.className = 'kmap-corner';
    corner.textContent = 'AB╲CD';
    container.appendChild(corner);

    // Column headers
    COL_LABELS.forEach(lbl => {
        const h = document.createElement('div');
        h.className = 'kmap-col-label mono';
        h.textContent = lbl;
        container.appendChild(h);
    });

    // Rows
    GRAY_ROWS.forEach((rVal, rIdx) => {
        // Row label
        const rowLbl = document.createElement('div');
        rowLbl.className = 'kmap-row-label mono';
        rowLbl.textContent = ROW_LABELS[rIdx];
        container.appendChild(rowLbl);

        // Cells
        GRAY_COLS.forEach(cVal => {
            const idx   = (rVal << 2) | cVal;
            const state = cells[idx];

            // Determine which loop covers this cell
            const coveringIdx = res.selected
                .map((pi, i) => pi.cov.includes(idx) ? i : -1)
                .filter(i => i !== -1);

            const isHoveredLoop = hoveredPiMask
                ? res.pis.find(p => p.mask === hoveredPiMask)?.cov.includes(idx)
                : false;

            const btn = document.createElement('button');
            btn.className = 'kmap-cell';

            // Apply loop colour
            if (hoveredPiMask) {
                if (isHoveredLoop) {
                    const hpi = res.selected.find(p => p.mask === hoveredPiMask);
                    const hIdx = res.selected.indexOf(hpi);
                    if (hIdx >= 0) btn.classList.add(`loop-${hIdx % LOOP_COLOR_COUNT}`);
                }
            } else if (coveringIdx.length > 0) {
                btn.classList.add(`loop-${coveringIdx[0] % LOOP_COLOR_COUNT}`);
            }

            // Value colour
            const valColor = state === 1 ? 'var(--text-primary)'
                           : state === 2 ? 'var(--amber)'
                           : 'var(--text-muted)';

            btn.innerHTML = `
                <span class="kmap-cell-idx">${idx}</span>
                <span class="kmap-cell-val" style="color:${valColor}">${state === 2 ? 'X' : state}</span>
            `;
            btn.onclick = () => { cells[idx] = (cells[idx] + 1) % 3; updateAll(); };
            container.appendChild(btn);
        });
    });
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
document.getElementById('presetSelect').onchange = e => loadPreset(e.target.value);

document.getElementById('randomBtn').onclick = () => {
    for (let i = 0; i < 16; i++) {
        const r = Math.random();
        cells[i] = r < 0.45 ? 1 : r < 0.60 ? 2 : 0;
    }
    updateAll();
};

document.getElementById('copyVerilogBtn').onclick = () => {
    const code = document.getElementById('verilogCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyVerilogBtn');
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = 'Copy HDL ↗'; }, 1800);
    });
};

document.getElementById('exprInput').addEventListener('input', e => {
    const inp = e.target, status = document.getElementById('exprStatus');
    try {
        const next = parseInput(inp.value);
        next.forEach((v, k) => cells[k] = v);
        inp.classList.remove('invalid');
        status.className = 'expr-status';
        status.textContent = '';
        typing = true; updateAll(); typing = false;
    } catch (err) {
        inp.classList.add('invalid');
        status.className = 'expr-status error';
        status.textContent = err.message;
    }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadPreset('default');
