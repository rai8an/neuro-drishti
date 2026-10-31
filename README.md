# NEURO-DRISHTI: Offline Edge-CV & Spectral Signal Processing Neuro-Motor Triage System
**Viksit Bharat Young Leaders Dialogue (VBYLD) 2027 — Hack for Social Cause**  
**Team Name:** JAAZRAI | **Registration ID:** `HSC|AP|00148` | **State:** Andhra Pradesh  
**Institution:** Mohan Babu University, Tirupati (`AISHE Code: U-1284`)  
**Team Members:** muhammad raihan shaik (Team Lead) & Azhar shaik  

## 1. Problem Statement & Local Context (Kurnool & Rural Andhra Pradesh)
Rural Primary Health Centres (PHCs) in semi-arid Rayalaseema (such as Yemmiganur, Adoni, and Mantralayam mandals in Kurnool District) lack specialist neurologists and diagnostic neuroimaging. Elderly citizens presenting with early ischemic stroke facial palsy or Parkinsonian resting tremors suffer delayed triage outside the 4.5-hour thrombolysis Golden Hour.

## 2. Technical Architecture & Deterministic Mathematical Engines
NEURO-DRISHTI runs 100% client-side in standard mobile/desktop browsers at 30 FPS without requiring cloud video uploads:
1. **Engine A — Cranial Nerve VII 3D Vector Asymmetry:** Extracts 478 3D facial landmarks via MediaPipe WebGL, projects left/right oral commissures (`landmarks 61, 291`) onto the nasion-subnasale midline vector (`168 -> 2`), and computes palpebral fissure ratios (`159/145` vs `386/374`).
2. **Engine B — Palm-Calibrated 128-Point High-Pass DFT Tremor Analyzer:** Calibrates pixel-to-millimeter scale using the anatomical metacarpal palm length (`Wrist 0` to `Middle MCP 9` = 80 mm), applies an automatic Wrist-Motion Gate and 5-frame high-pass detrending filter, and computes a Hanning-windowed Discrete Fourier Transform ($3.5\text{–}14.0\text{ Hz}$) to isolate $4.0\text{–}6.5\text{ Hz}$ Parkinsonian resting/postural tremor power.
3. **Engine C — Bradykinesia Motor-Cortex OLS Regression:** Captures microsecond inter-tap intervals ($ITI$) over a 10-second trial to calculate Ordinary Least Squares (OLS) fatigue slope ($\Delta\text{ms/tap}$) and median-trimmed Coefficient of Variation ($CV\%$).
4. **Engine D — GISE Haversine Tertiary Referral Router & Gemini 2.5 Flash CDSS:** Computes geodesic and road distances from rural Kurnool PHCs to tertiary stroke/neurology hubs (Kurnool GGH & SVIMS Tirupati) and synthesizes printable FHIR-compatible referral slips.

## 3. Setup & Live Execution Instructions
1. Clone this repository or open the live GitHub Pages deployment link.
2. Run any static local server (e.g., `python -m http.server 8000` or VS Code Live Server) and open `http://localhost:8000`.
3. Click **Start Live Camera** (or select one of the 3 verified clinical benchmark profiles) and click **Synthesize PHC Clinical Report**.

## 4. Open-Source License & AI Tool Disclosure
* **License:** MIT License (Open-Source compliant with HSC 2027 guidelines).
* **AI Tool Disclosure:** ~25% of UI styling and documentation structure assisted by Google Gemini Pro; 100% of core mathematical signal processing (DFT, 3D vector projection, OLS regression, Haversine routing) engineered and validated by Team JAAZRAI.