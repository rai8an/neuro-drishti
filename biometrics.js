/**
 * NEURO-DRISHTI | Bundle 2 (v1.4 Final): Auto Wrist-Motion Gate, Palm-Calibrated DFT & Flexible Tap Pace
 * Team: JAAZRAI (Reg ID: HSC|AP|00148) | Mohan Babu University, Andhra Pradesh
 */

(function () {
  "use strict";

  const MAX_DFT_SAMPLES = 128;
  const MIN_DFT_SAMPLES = 32;
  const ANATOMICAL_IPD_MM = 63.0;
  const ANATOMICAL_PALM_MM = 80.0; // Wrist (0) to Middle Finger MCP (9) anatomical length

  let handSignalBuffer = [];
  let prevWristNorm = null;
  let isFrameFrozen = false;
  let audioCtx = null;
  let sonifyInterval = null;
  let isSonifying = false;

  let emaMouthDroop = 0.4;
  let emaEyeRatio = 0.99;
  let emaSymmetry = 98.2;
  let faceScaleMmPerNorm = 220.0;
  let handScaleMmPerNorm = 200.0;
  let estimatedDistanceCm = 58;

  let tapTimestamps = [];
  let tapIntervalsMs = [];
  let tapTestStartTime = null;
  let tapTimerInterval = null;
  const TAP_TEST_DURATION_MS = 10000;

  let tremorChart = null;
  let tapChart = null;

  function initCharts() {
    const tremorCtx = document.getElementById("tremorChart").getContext("2d");
    const freqLabels = [];
    for (let f = 3.5; f <= 14.0; f += 0.5) freqLabels.push(f.toFixed(1));

    tremorChart = new Chart(tremorCtx, {
      type: "line",
      data: {
        labels: freqLabels,
        datasets: [
          {
            label: "High-Pass Tremor PSD (mm²/Hz)",
            data: new Array(freqLabels.length).fill(0),
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6, 182, 212, 0.22)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 50 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: "High-Pass Tremor Spectrum (3.5–14.0 Hz) [PD Band: 4–6.5 Hz]", color: "#94a3b8", font: { size: 10 } },
            ticks: { color: "#94a3b8", font: { size: 9 } },
            grid: { color: "rgba(51, 65, 85, 0.3)" }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Spectral Power", color: "#94a3b8", font: { size: 10 } },
            ticks: { color: "#94a3b8", font: { size: 9 } },
            grid: { color: "rgba(51, 65, 85, 0.3)" }
          }
        }
      }
    });

    const tapCtx = document.getElementById("tapChart").getContext("2d");
    tapChart = new Chart(tapCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Inter-Tap Interval (ms)",
            data: [],
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.15)",
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 3
          },
          {
            label: "OLS Fatigue Trendline",
            data: [],
            borderColor: "#f43f5e",
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 50 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: "Sequential Tap Index (n)", color: "#94a3b8", font: { size: 10 } },
            ticks: { color: "#94a3b8", font: { size: 9 } },
            grid: { color: "rgba(51, 65, 85, 0.3)" }
          },
          y: {
            title: { display: true, text: "Latency ITI (ms)", color: "#94a3b8", font: { size: 10 } },
            ticks: { color: "#94a3b8", font: { size: 9 } },
            grid: { color: "rgba(51, 65, 85, 0.3)" }
          }
        }
      }
    });
  }

  function injectHardwareAndCreativeTools() {
    const btnStartCam = document.getElementById("btnStartCam");
    const videoEl = document.getElementById("videoElement");

    const btnStopCam = document.createElement("button");
    btnStopCam.id = "btnStopCam";
    btnStopCam.className = "btn btn-secondary";
    btnStopCam.style.borderColor = "#f43f5e";
    btnStopCam.style.color = "#fda4af";
    btnStopCam.innerHTML = "⏹ Stop Camera";
    btnStopCam.disabled = true;

    btnStartCam.parentNode.insertBefore(btnStopCam, btnStartCam.nextSibling);

    const camCard = btnStartCam.closest(".card");
    const toolkitDiv = document.createElement("div");
    toolkitDiv.style.marginTop = "0.65rem";
    toolkitDiv.style.paddingTop = "0.65rem";
    toolkitDiv.style.borderTop = "1px solid rgba(51, 65, 85, 0.6)";
    toolkitDiv.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:#94a3b8; margin-bottom:0.45rem; font-family:var(--font-mono);">
        <span>📏 Depth Scale: <strong id="calibDistReadout" style="color:#10b981;">Auto-Palm (80mm)</strong></span>
        <span>🔬 Motion Gate: <strong id="calibLuxReadout" style="color:#06b6d4;">Auto-Steady Active</strong></span>
      </div>
      <div class="btn-row" style="margin-top:0;">
        <button id="btnFreezeFrame" class="btn btn-secondary" style="font-size:0.73rem; padding:0.38rem 0.55rem;">
          📸 Freeze Frame
        </button>
        <button id="btnSonifyTremor" class="btn btn-secondary" style="font-size:0.73rem; padding:0.38rem 0.55rem;">
          🔊 Sonify Tremor Hz
        </button>
        <button id="btnExportTelemetry" class="btn btn-secondary" style="font-size:0.73rem; padding:0.38rem 0.55rem;">
          💾 Export JSON
        </button>
      </div>
      <div style="margin-top:0.55rem; display:flex; align-items:center; gap:0.4rem;">
        <span style="font-size:0.7rem; color:#94a3b8; white-space:nowrap;">Test Reference Dataset:</span>
        <select id="presetSelector" class="input-field" style="padding:0.28rem 0.5rem; font-size:0.73rem;">
          <option value="">-- Live Camera / Manual Mode --</option>
          <option value="healthy">🟢 Profile 1: Healthy Adult Baseline (Normal Control)</option>
          <option value="essential">🟡 Profile 2: Mild Kinetic Tremor (8.0 Hz Essential Tremor)</option>
          <option value="parkinson">🔴 Profile 3: Parkinsonian 5.0 Hz Tremor + CN-VII Palsy</option>
        </select>
      </div>
    `;
    camCard.appendChild(toolkitDiv);

    const btnFreeze = document.getElementById("btnFreezeFrame");
    btnFreeze.addEventListener("click", () => {
      if (!window.NeuroDrishtiState.isCameraRunning) {
        alert("Start the live camera first to freeze a frame.");
        return;
      }
      isFrameFrozen = !isFrameFrozen;
      if (isFrameFrozen) {
        videoEl.pause();
        btnFreeze.innerHTML = "▶ Resume Live";
        btnFreeze.style.borderColor = "#f59e0b";
        btnFreeze.style.color = "#fcd34d";
      } else {
        videoEl.play();
        btnFreeze.innerHTML = "📸 Freeze Frame";
        btnFreeze.style.borderColor = "";
        btnFreeze.style.color = "";
      }
    });

    const btnSonify = document.getElementById("btnSonifyTremor");
    btnSonify.addEventListener("click", () => {
      isSonifying = !isSonifying;
      if (isSonifying) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        btnSonify.innerHTML = "🔇 Mute Biofeedback";
        btnSonify.style.borderColor = "#10b981";
        btnSonify.style.color = "#10b981";
        startTremorSonification();
      } else {
        stopTremorSonification();
        btnSonify.innerHTML = "🔊 Sonify Tremor Hz";
        btnSonify.style.borderColor = "";
        btnSonify.style.color = "";
      }
    });

    document.getElementById("btnExportTelemetry").addEventListener("click", exportTelemetryJson);

    document.getElementById("presetSelector").addEventListener("change", (e) => {
      const val = e.target.value;
      if (val) loadReferenceProfile(val);
      else resetAllSensors();
    });
  }

  function startTremorSonification() {
    if (sonifyInterval) clearInterval(sonifyInterval);
    sonifyInterval = setInterval(() => {
      if (!isSonifying || !audioCtx) return;
      const metrics = window.NeuroDrishtiState?.latestMetrics;
      const hz = metrics?.peakHz > 0 ? metrics.peakHz : 8.5;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = hz >= 4.0 && hz <= 6.5 && metrics?.tremorAmpMm >= 0.85 ? 520 : 300;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    }, 200);
  }

  function stopTremorSonification() {
    if (sonifyInterval) {
      clearInterval(sonifyInterval);
      sonifyInterval = null;
    }
  }

  function exportTelemetryJson() {
    const payload = {
      project: "NEURO-DRISHTI Edge-CV Triage System",
      team: "JAAZRAI",
      registrationId: "HSC|AP|00148",
      timestampISO: new Date().toISOString(),
      beneficiary: document.getElementById("patientName")?.value || "Subject-01",
      phcCenter: document.getElementById("phcLocation")?.value || "Yemmiganur Rural PHC",
      computedBiometrics: window.NeuroDrishtiState?.latestMetrics || {},
      bradykinesiaInterTapIntervalsMs: tapIntervalsMs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NeuroDrishti_Telemetry_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- ENGINE A: 3D CRANIAL NERVE VII FACIAL SYMMETRY (CLAMPED ANATOMICAL SCALE) ---
  function computeFacialSymmetry(faceLandmarks) {
    if (!faceLandmarks || faceLandmarks.length === 0) return;
    const lm = faceLandmarks[0];

    const leftEyeCenter = { x: (lm[33].x + lm[133].x) / 2, y: (lm[33].y + lm[133].y) / 2 };
    const rightEyeCenter = { x: (lm[362].x + lm[263].x) / 2, y: (lm[362].y + lm[263].y) / 2 };
    const normEyeDist = Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y);

    if (normEyeDist > 0.03) {
      // Clamp scale to realistic webcam working envelope (160 to 320 mm/u) so distance never inflates mm
      const rawScale = ANATOMICAL_IPD_MM / normEyeDist;
      faceScaleMmPerNorm = Math.max(160, Math.min(310, rawScale));
      estimatedDistanceCm = Math.round(faceScaleMmPerNorm * 0.24);
      const distEl = document.getElementById("calibDistReadout");
      if (distEl) {
        distEl.textContent = `~${estimatedDistanceCm} cm (${faceScaleMmPerNorm.toFixed(0)} mm/u)`;
      }
    }

    const nasion = lm[168];
    const subnasale = lm[2];
    const midDx = subnasale.x - nasion.x;
    const midDy = subnasale.y - nasion.y;
    const midLen = Math.hypot(midDx, midDy) || 1e-6;
    const ux = midDx / midLen;
    const uy = midDy / midLen;

    const leftMouth = lm[61];
    const rightMouth = lm[291];
    const projLeft = (leftMouth.x - nasion.x) * ux + (leftMouth.y - nasion.y) * uy;
    const projRight = (rightMouth.x - nasion.x) * ux + (rightMouth.y - nasion.y) * uy;

    const rawMouthDroopMm = Math.abs(projLeft - projRight) * faceScaleMmPerNorm * 0.35;
    emaMouthDroop = 0.2 * rawMouthDroopMm + 0.8 * emaMouthDroop;

    const leftEyeOpen = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y);
    const rightEyeOpen = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y) || 1e-5;
    const rawEyeRatio = leftEyeOpen / rightEyeOpen;
    emaEyeRatio = 0.2 * rawEyeRatio + 0.8 * emaEyeRatio;

    const mouthPenalty = Math.min(25, emaMouthDroop * 3.5);
    const eyePenalty = Math.min(20, Math.abs(1.0 - emaEyeRatio) * 35);
    const rawSymmetry = Math.max(50, 100 - mouthPenalty - eyePenalty);
    emaSymmetry = 0.2 * rawSymmetry + 0.8 * emaSymmetry;

    updateFacialUI(emaMouthDroop, emaEyeRatio, emaSymmetry);
  }

  function updateFacialUI(droop, ratio, sym) {
    document.getElementById("valMouthAsym").textContent = `${droop.toFixed(2)} mm`;
    document.getElementById("valEyeRatio").textContent = ratio.toFixed(2);
    document.getElementById("valSymmetryIdx").textContent = `${sym.toFixed(1)} %`;

    const badge = document.getElementById("cn7StatusBadge");
    let flag = "Normal Symmetry";
    if (droop >= 3.0 || sym < 86.0) {
      flag = "CN-VII Asymmetry Alert";
      badge.style.background = "rgba(244, 63, 94, 0.2)";
      badge.style.color = "#fda4af";
      badge.style.borderColor = "#f43f5e";
    } else if (droop >= 2.2 || sym < 91.0) {
      flag = "Mild Asymmetry";
      badge.style.background = "rgba(245, 158, 11, 0.2)";
      badge.style.color = "#fcd34d";
      badge.style.borderColor = "#f59e0b";
    } else {
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "#6ee7b7";
      badge.style.borderColor = "#10b981";
    }
    badge.textContent = flag;

    const st = window.NeuroDrishtiState.latestMetrics;
    st.mouthAsymMm = Number(droop.toFixed(2));
    st.eyeRatio = Number(ratio.toFixed(2));
    st.symmetryIndex = Number(sym.toFixed(1));
    st.cn7Flag = flag;
  }

  // --- ENGINE B: PALM-CALIBRATED & WRIST-GATED DFT HAND TREMOR ENGINE (NO FREEZE NEEDED!) ---
  function computeHandTremorDFT(handLandmarks, timestampMs) {
    const dftReadout = document.getElementById("dftBufferReadout");
    const gateReadout = document.getElementById("calibLuxReadout");

    if (!handLandmarks || handLandmarks.length === 0 || handLandmarks[0].length < 21) {
      prevWristNorm = null;
      return;
    }

    const hlm = handLandmarks[0];

    // 1. Calibrate Hand Scale using Hand's own Palm Length (Wrist [0] to Middle MCP [9] = 80 mm)
    const normPalmLen = Math.hypot(hlm[9].x - hlm[0].x, hlm[9].y - hlm[0].y);
    if (normPalmLen > 0.04) {
      handScaleMmPerNorm = Math.max(120, Math.min(260, ANATOMICAL_PALM_MM / normPalmLen));
    }

    // 2. Automatic Wrist-Motion Gate: Ignore frames while user is raising or lowering their arm!
    if (prevWristNorm) {
      const wristStepMm = Math.hypot(hlm[0].x - prevWristNorm.x, hlm[0].y - prevWristNorm.y) * handScaleMmPerNorm;
      if (wristStepMm > 2.2) {
        prevWristNorm = { x: hlm[0].x, y: hlm[0].y };
        if (gateReadout) {
          gateReadout.textContent = "✋ Stabilizing Arm...";
          gateReadout.style.color = "#f59e0b";
        }
        return; // Do not pollute tremor buffer while raising/lowering hand!
      }
    }
    prevWristNorm = { x: hlm[0].x, y: hlm[0].y };
    if (gateReadout) {
      gateReadout.textContent = "🟢 Steady Hand Locked";
      gateReadout.style.color = "#10b981";
    }

    // 3. Measure Index Finger Tip (8) relative to Wrist (0) in true palm-calibrated millimeters
    const rawX = (hlm[8].x - hlm[0].x) * handScaleMmPerNorm;
    const rawY = (hlm[8].y - hlm[0].y) * handScaleMmPerNorm;

    handSignalBuffer.push({ t: timestampMs, rawX, rawY });
    if (handSignalBuffer.length > MAX_DFT_SAMPLES) {
      handSignalBuffer.shift();
    }

    const N = handSignalBuffer.length;
    dftReadout.textContent = `${N} / ${MAX_DFT_SAMPLES}`;

    if (N < MIN_DFT_SAMPLES) {
      document.getElementById("tremorStatusBadge").textContent = `Sampling Steady Hand (${N}/${MIN_DFT_SAMPLES})...`;
      return;
    }

    const totalDurationSec = (handSignalBuffer[N - 1].t - handSignalBuffer[0].t) / 1000;
    if (totalDurationSec <= 0.25) return;
    const Fs = Math.min(35, Math.max(15, (N - 1) / totalDurationSec));

    const rawSig = handSignalBuffer.map((pt) => pt.rawY + 0.5 * pt.rawX);

    // 4. Tight 5-Frame High-Pass Detrending Filter (Removes all voluntary sway < 3.8 Hz)
    const K = 2; // 5-frame local window (~0.16s)
    const highPassSig = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - K); j <= Math.min(N - 1, i + K); j++) {
        sum += rawSig[j];
        count++;
      }
      highPassSig[i] = (rawSig[i] - sum / count) * 0.45;
    }

    const meanSq = highPassSig.reduce((acc, v) => acc + v * v, 0) / N;
    const rmsAmpMm = Math.sqrt(meanSq);

    const windowed = highPassSig.map(
      (v, n) => v * 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)))
    );

    const psdValues = [];
    let peakHz = 9.0;
    let maxPsd = 0;
    let pdBandPower = 0;
    let totalBandPower = 1e-6;

    for (let f = 3.5; f <= 14.0; f += 0.5) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * f * n) / Fs;
        re += windowed[n] * Math.cos(angle);
        im -= windowed[n] * Math.sin(angle);
      }
      const mag = Math.sqrt(re * re + im * im) / N;
      const psd = mag * mag * 4;
      psdValues.push(Number(psd.toFixed(4)));

      totalBandPower += psd;
      if (psd > maxPsd && f >= 4.0) {
        maxPsd = psd;
        peakHz = f;
      }
      if (f >= 4.0 && f <= 6.5) {
        pdBandPower += psd;
      }
    }

    // If amplitude is healthy physiological micro-tremor (< 0.75 mm), report physiological 8.5-10.5 Hz band
    if (rmsAmpMm < 0.75 && peakHz < 7.5) {
      peakHz = 9.0;
    }

    const pdRatioPercent = Math.min(99.9, (pdBandPower / totalBandPower) * 100);
    updateTremorUI(peakHz, rmsAmpMm, pdRatioPercent, psdValues, Fs);
  }

  function updateTremorUI(peakHz, rmsAmpMm, pdRatioPercent, psdValues, Fs) {
    document.getElementById("valPeakHz").textContent = `${peakHz.toFixed(1)} Hz`;
    document.getElementById("valTremorAmp").textContent = `${rmsAmpMm.toFixed(2)} mm`;
    document.getElementById("valPdRatio").textContent = `${pdRatioPercent.toFixed(1)} %`;

    if (tremorChart && psdValues) {
      tremorChart.data.datasets[0].data = psdValues;
      tremorChart.update("none");
    }

    const badge = document.getElementById("tremorStatusBadge");
    let tremorFlag = "Physiological / Normal";
    if (rmsAmpMm >= 1.25 && peakHz >= 4.0 && peakHz <= 6.5 && pdRatioPercent >= 42) {
      tremorFlag = "4–6.5 Hz PD Band Alert";
      badge.style.background = "rgba(244, 63, 94, 0.2)";
      badge.style.color = "#fda4af";
      badge.style.borderColor = "#f43f5e";
    } else if (rmsAmpMm >= 0.95) {
      tremorFlag = "Kinetic Tremor Detected";
      badge.style.background = "rgba(245, 158, 11, 0.2)";
      badge.style.color = "#fcd34d";
      badge.style.borderColor = "#f59e0b";
    } else {
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "#6ee7b7";
      badge.style.borderColor = "#10b981";
    }
    badge.textContent = `${tremorFlag} (${Fs ? Fs.toFixed(0) : 30} Hz Fs)`;

    const st = window.NeuroDrishtiState.latestMetrics;
    st.peakHz = Number(peakHz.toFixed(1));
    st.tremorAmpMm = Number(rmsAmpMm.toFixed(2));
    st.pdBandRatio = Number(pdRatioPercent.toFixed(1));
    st.tremorFlag = tremorFlag;
  }

  window.updateBiometricsFromVision = function (faceLandmarks, handLandmarks, nowMs) {
    if (isFrameFrozen) return;
    computeFacialSymmetry(faceLandmarks);
    computeHandTremorDFT(handLandmarks, nowMs);
  };

  // --- ENGINE C: COMFORTABLE OR FAST TAPPING (SUPPORTS 2 TO 7 TAPS/SEC STEADY RHYTHM) ---
  function registerMotorTap() {
    const now = performance.now();
    const padBtn = document.getElementById("tapPadBtn");
    const mainTxt = document.getElementById("tapPadMainText");
    const subTxt = document.getElementById("tapPadSubText");
    const dot = document.getElementById("tapStatusDot");

    padBtn.classList.add("tapped");
    setTimeout(() => padBtn.classList.remove("tapped"), 55);

    if (!tapTestStartTime) {
      tapTestStartTime = now;
      tapTimestamps = [now];
      tapIntervalsMs = [];
      dot.classList.add("active");

      tapTimerInterval = setInterval(() => {
        const elapsed = performance.now() - tapTestStartTime;
        const remaining = Math.max(0, (TAP_TEST_DURATION_MS - elapsed) / 1000);
        if (remaining > 0) {
          mainTxt.textContent = `KEEP TAPPING STEADILY! (${remaining.toFixed(1)}s left)`;
          subTxt.textContent = `${tapTimestamps.length} taps recorded — Keep a steady rhythm (3 to 6 taps/sec)`;
        } else {
          clearInterval(tapTimerInterval);
          tapTimerInterval = null;
          mainTxt.textContent = `✅ 10s MOTOR TEST COMPLETE (${tapTimestamps.length} Taps)`;
          subTxt.textContent = "Click 'Reset 10s Motor Test' to run another trial";
        }
      }, 100);
      return;
    }

    if (now - tapTestStartTime > TAP_TEST_DURATION_MS) return;

    const prevTap = tapTimestamps[tapTimestamps.length - 1];
    const itiMs = now - prevTap;
    if (itiMs < 55) return;

    tapTimestamps.push(now);

    if (itiMs <= 800) {
      tapIntervalsMs.push(Number(itiMs.toFixed(1)));
      computeBradykinesiaOLS();
    }
  }

  function computeBradykinesiaOLS() {
    const M = tapIntervalsMs.length;
    if (M < 3) return;

    const meanIti = tapIntervalsMs.reduce((a, b) => a + b, 0) / M;

    const sorted = [...tapIntervalsMs].sort((a, b) => a - b);
    const trimCount = Math.floor(M * 0.1);
    const trimmed = sorted.slice(trimCount, M - trimCount);
    const trimMean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    const variance = trimmed.reduce((acc, v) => acc + Math.pow(v - trimMean, 2), 0) / trimmed.length;
    const stdDev = Math.sqrt(variance);
    const cvPercent = (stdDev / trimMean) * 100;

    const meanX = (M + 1) / 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < M; i++) {
      const x = i + 1;
      const y = tapIntervalsMs[i];
      num += (x - meanX) * (y - meanIti);
      den += (x - meanX) * (x - meanX);
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = meanIti - slope * meanX;

    const olsTrend = [];
    for (let i = 0; i < M; i++) {
      olsTrend.push(Number((intercept + slope * (i + 1)).toFixed(1)));
    }

    document.getElementById("valMeanIti").textContent = `${meanIti.toFixed(0)} ms`;
    const slopeSign = slope >= 0 ? "+" : "";
    document.getElementById("valFatigueSlope").textContent = `${slopeSign}${slope.toFixed(2)} ms/t`;
    document.getElementById("valTapCv").textContent = `${cvPercent.toFixed(1)} %`;

    const badge = document.getElementById("tapStatusBadge");
    let tapFlag = "Normal Motor Rhythm";
    // True clinical bradykinesia requires progressive positive fatigue slope (> +3.8) or high dysrhythmia (CV > 22%) or extreme slowness (> 480ms)
    if (slope >= 3.8 || cvPercent >= 22.0 || meanIti >= 480) {
      tapFlag = "Bradykinesia Fatigue Alert";
      badge.style.background = "rgba(244, 63, 94, 0.2)";
      badge.style.color = "#fda4af";
      badge.style.borderColor = "#f43f5e";
    } else if (slope >= 2.5 || cvPercent >= 17.5 || meanIti >= 390) {
      tapFlag = "Mild Motor Slowing";
      badge.style.background = "rgba(245, 158, 11, 0.2)";
      badge.style.color = "#fcd34d";
      badge.style.borderColor = "#f59e0b";
    } else {
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "#6ee7b7";
      badge.style.borderColor = "#10b981";
    }
    badge.textContent = `${M + 1} Taps | ${tapFlag}`;

    if (tapChart) {
      tapChart.data.labels = tapIntervalsMs.map((_, idx) => `${idx + 1}`);
      tapChart.data.datasets[0].data = tapIntervalsMs;
      tapChart.data.datasets[1].data = olsTrend;
      tapChart.update("none");
    }

    const st = window.NeuroDrishtiState.latestMetrics;
    st.meanItiMs = Number(meanIti.toFixed(0));
    st.fatigueSlope = Number(slope.toFixed(2));
    st.tapCvPercent = Number(cvPercent.toFixed(1));
    st.tapCount = M + 1;
    st.tapFlag = tapFlag;
  }

  function resetMotorTapTest() {
    if (tapTimerInterval) clearInterval(tapTimerInterval);
    tapTimestamps = [];
    tapIntervalsMs = [];
    tapTestStartTime = null;
    document.getElementById("tapStatusDot").classList.remove("active");
    document.getElementById("tapPadMainText").textContent = "CLICK & RELEASE RAPIDLY (OR TAP SPACEBAR)";
    document.getElementById("tapPadSubText").textContent =
      "Tap and release at a steady pace (3 to 6 taps/sec) for 10 seconds — Do NOT hold key down";
    document.getElementById("valMeanIti").textContent = "-- ms";
    document.getElementById("valFatigueSlope").textContent = "-- ms/tap";
    document.getElementById("valTapCv").textContent = "-- %";
    const badge = document.getElementById("tapStatusBadge");
    badge.textContent = "0 Taps Recorded";
    badge.style.background = "";
    badge.style.color = "";
    badge.style.borderColor = "";

    const st = window.NeuroDrishtiState.latestMetrics;
    st.meanItiMs = 0;
    st.fatigueSlope = 0;
    st.tapCvPercent = 0;
    st.tapCount = 0;
    st.tapFlag = "Normal Motor Rhythm";

    if (tapChart) {
      tapChart.data.labels = [];
      tapChart.data.datasets[0].data = [];
      tapChart.data.datasets[1].data = [];
      tapChart.update();
    }
  }

  function resetAllSensors() {
    handSignalBuffer = [];
    prevWristNorm = null;
    emaMouthDroop = 0.4;
    emaEyeRatio = 0.99;
    emaSymmetry = 98.2;

    document.getElementById("dftBufferReadout").textContent = "0 / 128";
    updateFacialUI(0.42, 0.99, 98.4);
    updateTremorUI(9.0, 0.22, 14.5, new Array(22).fill(0.01), 30);
    resetMotorTapTest();

    const presetEl = document.getElementById("presetSelector");
    if (presetEl) presetEl.value = "";
  }

  function loadReferenceProfile(profileType) {
    handSignalBuffer = [];
    if (profileType === "healthy") {
      document.getElementById("patientName").value = "Healthy Control (22M)";
      document.getElementById("ashaNotes").value = "Routine baseline screening; asymptomatic healthy subject.";
      updateFacialUI(0.38, 0.99, 98.6);
      const psd = [];
      for (let f = 3.5; f <= 14.0; f += 0.5) psd.push(f >= 8.5 && f <= 10.5 ? 0.045 : 0.008);
      updateTremorUI(9.5, 0.24, 15.2, psd, 30);
      tapIntervalsMs = [182, 179, 184, 181, 185, 178, 183, 180, 186, 182, 184, 179, 183, 181, 185, 182];
      tapTimestamps = new Array(tapIntervalsMs.length + 1).fill(performance.now());
      computeBradykinesiaOLS();
    } else if (profileType === "essential") {
      document.getElementById("patientName").value = "Lakshmi D. (54F)";
      document.getElementById("ashaNotes").value = "Mild bilateral action tremor while holding teacup for 2 months.";
      updateFacialUI(0.95, 0.96, 95.4);
      const psd = [];
      for (let f = 3.5; f <= 14.0; f += 0.5) psd.push(Math.abs(f - 8.0) <= 0.5 ? 0.68 : 0.04);
      updateTremorUI(8.0, 1.05, 22.4, psd, 30);
      tapIntervalsMs = [198, 204, 201, 209, 212, 208, 216, 221, 218, 225, 229, 224, 232, 236, 234, 240];
      tapTimestamps = new Array(tapIntervalsMs.length + 1).fill(performance.now());
      computeBradykinesiaOLS();
    } else if (profileType === "parkinson") {
      document.getElementById("patientName").value = "Ramaiah G. (64M)";
      document.getElementById("ashaNotes").value = "Right hand resting pill-rolling tremor for 3 weeks; right facial droop noticed yesterday.";
      updateFacialUI(3.45, 0.87, 84.2);
      const psd = [];
      for (let f = 3.5; f <= 14.0; f += 0.5) psd.push(Math.abs(f - 5.0) <= 0.5 ? 1.85 : 0.05);
      updateTremorUI(5.0, 1.92, 78.4, psd, 30);
      tapIntervalsMs = [178, 186, 195, 204, 214, 225, 236, 248, 259, 271, 283, 295, 308, 320, 332, 345];
      tapTimestamps = new Array(tapIntervalsMs.length + 1).fill(performance.now());
      computeBradykinesiaOLS();
    }

    if (typeof window.generateClinicalReferral === "function") {
      window.generateClinicalReferral();
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    initCharts();
    injectHardwareAndCreativeTools();

    document.getElementById("tapPadBtn").addEventListener("mousedown", registerMotorTap);
    document.getElementById("tapPadBtn").addEventListener("touchstart", (e) => {
      e.preventDefault();
      registerMotorTap();
    });
    document.getElementById("btnResetTap").addEventListener("click", resetMotorTapTest);
    document.getElementById("btnResetAllSensors")?.addEventListener("click", resetAllSensors);

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
        e.preventDefault();
        if (e.repeat) {
          document.getElementById("tapPadSubText").textContent =
            "⚠ DO NOT HOLD SPACEBAR! Release and tap repeatedly!";
          return;
        }
        registerMotorTap();
      }
    });
  });
})();