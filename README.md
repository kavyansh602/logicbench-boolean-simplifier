# LogicBench — Boolean Expression Simplification & Synthesis Workbench

> **Live Interactive Workbench**: [https://logicbench-simplifier.vercel.app](https://logicbench-simplifier.vercel.app)

An exact Boolean Expression Simplification minor project combining a Python **Quine-McCluskey + Exact Minimum Cover** backend engine with a zero-dependency **Interactive K-Map & IEEE-1364 Verilog Synthesis Workbench**.

## Project Structure

- `backend/qm_solver.py`: Core Python implementation of the Quine-McCluskey tabular method and exact minimum literal cover solver.
- `backend/test_benchmarks.py`: Automated CLI benchmark verification suite (4-variable and 5-variable standard digital logic circuits).
- `frontend/index.html`, `styles.css`, `app.js`: Interactive daylight engineering workbench featuring a clickable Gray-code Karnaugh Map, Prime Implicant coverage matrix, SVG gate-level schematic renderer, and Verilog HDL generator.
- `docs/project_report.md`: Formal algorithmic trace and hardware reduction analysis.

## Expression Input

Type into the **Expression** bar (variables A–D) and the K-map, PI table, schematic, Verilog and truth table update live:

| Syntax | Examples |
| --- | --- |
| NOT | `A'`  `!A`  `~A`  `NOT A` |
| AND | `AB`  `A*B`  `A&B`  `A AND B` |
| XOR | `A^B`  `A⊕B`  `A XOR B` |
| OR  | `A+B`  `A\|B`  `A OR B` |
| Minterm form | `Σm(1,3,7) + d(5)`  `F(A,B,C,D) = m(0,15)` |

Precedence: NOT > AND > XOR > OR. Editing the K-map or truth table writes the matching `Σm(...)` back into the bar.

## How to Run

### 1. Launch the Interactive Web Dashboard
Open `frontend/index.html` directly in any modern browser, or run from PowerShell:
```powershell
Invoke-Item .\frontend\index.html
```
Or serve locally via Python:
```bash
cd frontend && python -m http.server 3000
```

### 2. Run the Benchmark Verification Suite
```bash
python backend/test_benchmarks.py
```

## Deployment

The workbench is static (HTML/CSS/JS) and can be deployed in seconds with zero build steps:

- **GitHub Pages**: Push to GitHub, go to `Settings > Pages`, set branch to `main` and directory to `/frontend`.
- **Netlify**: Drag and drop the `frontend` directory into Netlify Drop.
- **Vercel**: Run `vercel` from root and set output directory to `frontend`.
- **Cloudflare Pages**: Connect repo and set the build directory to `frontend`.
