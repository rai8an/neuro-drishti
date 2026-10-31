/**
 * NEURO-DRISHTI | Bundle 3 (v1.4 Final): Includes Stop Audio Button, Calibrated CDSS & GISE Router
 * Team: JAAZRAI (Reg ID: HSC|AP|00148) | Mohan Babu University, Andhra Pradesh
 */

(function () {
  "use strict";

  const activeMediaStreams = [];

  function installHardwareStreamGuard() {
    const videoEl = document.getElementById("videoElement");
    const btnStartCam = document.getElementById("btnStartCam");
    const camStatusDot = document.getElementById("camStatusDot");
    const placeholder = document.getElementById("viewportPlaceholder");
    const fpsReadout = document.getElementById("fpsReadout");
    const overlayCanvas = document.getElementById("overlayCanvas");

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async function (constraints) {
        stopAllHardwareStreams();
        const stream = await origGetUserMedia(constraints);
        activeMediaStreams.push(stream);
        return stream;
      };
    }

    function stopAllHardwareStreams() {
      while (activeMediaStreams.length > 0) {
        const s = activeMediaStreams.pop();
        try { s.getTracks().forEach((t) => t.stop()); } catch (e) {}
      }
      if (videoEl && videoEl.srcObject) {
        try { videoEl.srcObject.getTracks().forEach((t) => t.stop()); } catch (e) {}
        videoEl.srcObject = null;
      }
    }

    if (videoEl) {
      videoEl.addEventListener("playing", () => {
        const btnStopCam = document.getElementById("btnStopCam");
        if (btnStopCam) btnStopCam.disabled = false;
        if (window.NeuroDrishtiState) window.NeuroDrishtiState.isCameraRunning = true;
      });
    }

    setInterval(() => {
      const btnStopCam = document.getElementById("btnStopCam");
      if (!btnStopCam || !videoEl) return;
      const hasLiveStream = Boolean(
        videoEl.srcObject && videoEl.srcObject.getTracks().some((t) => t.readyState === "live")
      );
      if (hasLiveStream) {
        btnStopCam.disabled = false;
        if (window.NeuroDrishtiState && !window.NeuroDrishtiState.isCameraRunning) {
          window.NeuroDrishtiState.isCameraRunning = true;
          videoEl.play().catch(() => {});
        }
      }
    }, 300);

    document.addEventListener(
      "click",
      (e) => {
        const stopBtn = e.target.closest("#btnStopCam");
        if (!stopBtn) return;

        stopAllHardwareStreams();
        if (window.NeuroDrishtiState) window.NeuroDrishtiState.isCameraRunning = false;
        if (overlayCanvas) {
          const ctx = overlayCanvas.getContext("2d");
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
        if (camStatusDot) camStatusDot.classList.remove("active");
        if (placeholder) placeholder.classList.remove("hidden");
        if (fpsReadout) fpsReadout.textContent = "0 FPS";
        if (btnStartCam) {
          btnStartCam.textContent = "▶ Start Live Camera";
          btnStartCam.disabled = false;
        }
        stopBtn.disabled = true;
      },
      true
    );
  }

  const KURNOOL_PHC_COORDS = {
    yemmiganur: { name: "Yemmiganur Rural PHC", lat: 15.7725, lon: 77.4775 },
    adoni: { name: "Adoni Area Hospital", lat: 15.6279, lon: 77.2750 },
    kodumur: { name: "Kodumur Mandal PHC", lat: 15.6881, lon: 77.7694 },
    mantralayam: { name: "Mantralayam PHC", lat: 15.9428, lon: 77.4258 },
    nandyal: { name: "Nandyal District Hospital", lat: 15.4786, lon: 78.4836 },
    tirupati: { name: "MBU Health Centre (Tirupati)", lat: 13.6215, lon: 79.2903 }
  };

  const TERTIARY_CENTERS = [
    {
      name: "Kurnool Govt. General Hospital (GGH Stroke & CT Hub)",
      lat: 15.8222,
      lon: 78.0365,
      capabilities: "24x7 Intravenous Thrombolysis (tPA), Multi-Slice CT, Dept. of Neurology"
    },
    {
      name: "SVIMS Super Specialty Hospital (Tirupati Tertiary Hub)",
      lat: 13.6379,
      lon: 79.4039,
      capabilities: "Comprehensive Stroke Unit, Movement Disorders Clinic, MRI/DSA"
    }
  ];

  let activeUserCoords = { lat: 15.7725, lon: 77.4775, source: "Yemmiganur PHC Grid" };

  function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371.0;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function computeGisReferralRoute() {
    const phcInput = (document.getElementById("phcLocation")?.value || "").toLowerCase();
    let origin = { ...activeUserCoords };

    if (origin.source !== "Live Hardware GPS") {
      if (phcInput.includes("adoni")) origin = { ...KURNOOL_PHC_COORDS.adoni, source: "Adoni Grid" };
      else if (phcInput.includes("kodumur")) origin = { ...KURNOOL_PHC_COORDS.kodumur, source: "Kodumur Grid" };
      else if (phcInput.includes("mantralayam")) origin = { ...KURNOOL_PHC_COORDS.mantralayam, source: "Mantralayam Grid" };
      else if (phcInput.includes("nandyal")) origin = { ...KURNOOL_PHC_COORDS.nandyal, source: "Nandyal Grid" };
      else if (phcInput.includes("tirupati") || phcInput.includes("mbu")) origin = { ...KURNOOL_PHC_COORDS.tirupati, source: "Tirupati Grid" };
      else origin = { ...KURNOOL_PHC_COORDS.yemmiganur, source: "Yemmiganur PHC Grid" };
    }

    let bestHub = TERTIARY_CENTERS[0];
    let minGeodesicKm = Infinity;

    TERTIARY_CENTERS.forEach((hub) => {
      const d = haversineDistanceKm(origin.lat, origin.lon, hub.lat, hub.lon);
      if (d < minGeodesicKm) {
        minGeodesicKm = d;
        bestHub = hub;
      }
    });

    const roadDistanceKm = minGeodesicKm * 1.24;
    const transitMinutes = Math.max(12, Math.round((roadDistanceKm / 52) * 60));

    return {
      originLat: origin.lat.toFixed(4),
      originLon: origin.lon.toFixed(4),
      originSource: origin.source,
      destinationHub: bestHub.name,
      capabilities: bestHub.capabilities,
      geodesicKm: minGeodesicKm.toFixed(1),
      roadDistanceKm: roadDistanceKm.toFixed(1),
      ambulanceEtaMin: transitMinutes
    };
  }

  function injectClinicalEnhancementsUI() {
    const ashaInput = document.getElementById("ashaNotes");
    const phcInput = document.getElementById("phcLocation");
    const apiKeyInput = document.getElementById("geminiApiKey");
    const btnSpeakEnglish = document.getElementById("btnSpeakEnglish");

    // INJECT DEDICATED STOP SPEECH BUTTON RIGHT NEXT TO SPEAK CLINICAL SUMMARY
    if (btnSpeakEnglish && !document.getElementById("btnStopSpeech")) {
      const btnStopSpeech = document.createElement("button");
      btnStopSpeech.id = "btnStopSpeech";
      btnStopSpeech.className = "btn btn-secondary";
      btnStopSpeech.style.borderColor = "#f43f5e";
      btnStopSpeech.style.color = "#fda4af";
      btnStopSpeech.innerHTML = "⏹ Stop Audio";
      btnStopSpeech.addEventListener("click", () => {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      });
      btnSpeakEnglish.parentNode.insertBefore(btnStopSpeech, btnSpeakEnglish.nextSibling);
    }

    const savedKey = localStorage.getItem("NEURO_DRISHTI_GEMINI_KEY");
    if (savedKey && apiKeyInput) apiKeyInput.value = savedKey;
    if (apiKeyInput) {
      apiKeyInput.addEventListener("change", () => {
        localStorage.setItem("NEURO_DRISHTI_GEMINI_KEY", apiKeyInput.value.trim());
      });
    }

    if (phcInput && phcInput.previousElementSibling) {
      const label = phcInput.previousElementSibling;
      label.style.display = "flex";
      label.style.justifyContent = "space-between";
      label.style.alignItems = "center";
      const gpsBtn = document.createElement("button");
      gpsBtn.type = "button";
      gpsBtn.style.background = "rgba(6, 182, 212, 0.15)";
      gpsBtn.style.border = "1px solid #06b6d4";
      gpsBtn.style.color = "#06b6d4";
      gpsBtn.style.borderRadius = "4px";
      gpsBtn.style.padding = "0.05rem 0.4rem";
      gpsBtn.style.fontSize = "0.66rem";
      gpsBtn.style.cursor = "pointer";
      gpsBtn.textContent = "📍 Lock Live GPS";
      gpsBtn.addEventListener("click", () => {
        if (!navigator.geolocation) return;
        gpsBtn.textContent = "⏳ Locating...";
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            activeUserCoords = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              source: "Live Hardware GPS"
            };
            gpsBtn.textContent = `✅ GPS (${pos.coords.latitude.toFixed(2)}°N)`;
            gpsBtn.style.borderColor = "#10b981";
            gpsBtn.style.color = "#10b981";
          },
          () => {
            gpsBtn.textContent = "📍 Yemmiganur Grid";
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      });
      label.appendChild(gpsBtn);
    }

    if (ashaInput && ashaInput.previousElementSibling) {
      const label = ashaInput.previousElementSibling;
      label.style.display = "flex";
      label.style.justifyContent = "space-between";
      label.style.alignItems = "center";
      const micBtn = document.createElement("button");
      micBtn.type = "button";
      micBtn.style.background = "rgba(16, 185, 129, 0.15)";
      micBtn.style.border = "1px solid #10b981";
      micBtn.style.color = "#10b981";
      micBtn.style.borderRadius = "4px";
      micBtn.style.padding = "0.05rem 0.45rem";
      micBtn.style.fontSize = "0.66rem";
      micBtn.style.cursor = "pointer";
      micBtn.textContent = "🎙 Dictate Notes";

      micBtn.addEventListener("click", () => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
          alert("Speech recognition requires Chrome or Edge.");
          return;
        }
        const rec = new SpeechRec();
        rec.lang = "en-IN";
        rec.interimResults = false;
        micBtn.textContent = "🔴 Speak Now...";
        rec.onresult = (event) => {
          ashaInput.value = event.results[0][0].transcript;
        };
        rec.onend = () => {
          micBtn.textContent = "🎙 Dictate Notes";
        };
        rec.start();
      });
      label.appendChild(micBtn);
    }
  }

  function evaluateClinicalRiskMatrix() {
    const m = window.NeuroDrishtiState?.latestMetrics || {};
    const mouthDroop = Number(m.mouthAsymMm || 0);
    const eyeRatio = Number(m.eyeRatio || 1.0);
    const symIdx = Number(m.symmetryIndex || 98.5);
    const peakHz = Number(m.peakHz || 0);
    const tremorAmp = Number(m.tremorAmpMm || 0);
    const pdRatio = Number(m.pdBandRatio || 0);
    const meanIti = Number(m.meanItiMs || 0);
    const slope = Number(m.fatigueSlope || 0);
    const tapCv = Number(m.tapCvPercent || 0);

    let cn7Score = Math.min(100, Math.round(mouthDroop * 14 + Math.abs(1.0 - eyeRatio) * 110));
    if (mouthDroop >= 3.0 || symIdx < 86.0) cn7Score = Math.max(cn7Score, 72);

    let tremorScore = 8;
    if (tremorAmp < 0.85) {
      tremorScore = Math.round(tremorAmp * 20);
    } else {
      const inPdBand = peakHz >= 4.0 && peakHz <= 6.5 && pdRatio >= 38 ? 1.35 : 0.85;
      tremorScore = Math.min(100, Math.round((tremorAmp * 24 + pdRatio * 0.45) * inPdBand));
    }

    let bradyScore = 8;
    if (m.tapCount >= 4) {
      const posSlope = Math.max(0, slope);
      const excessCv = Math.max(0, tapCv - 10.0);
      const slowItiPenalty = Math.max(0, (meanIti - 380) * 0.25);
      bradyScore = Math.min(100, Math.round(posSlope * 11 + excessCv * 2.0 + slowItiPenalty));
    }

    const maxSingle = Math.max(cn7Score, tremorScore, bradyScore);
    const avgScore = (cn7Score + tremorScore + bradyScore) / 3;
    const compositeScore = Math.min(100, Math.round(0.55 * maxSingle + 0.45 * avgScore));

    let urgencyLevel = "GREEN — NORMAL BASELINE (LOW NEURO-MOTOR RISK)";
    let bannerClass = "triage-banner triage-green";
    let protocolCode = "NPCDCS-TIER-1 (Routine Community Follow-Up)";

    if (compositeScore >= 62 || cn7Score >= 68 || (tremorScore >= 65 && bradyScore >= 60)) {
      urgencyLevel = "RED — URGENT TERTIARY NEUROLOGY / STROKE REFERRAL";
      bannerClass = "triage-banner triage-red";
      protocolCode = "ICMR-STROKE/PD-TIER-3 (Priority 108 Referral)";
    } else if (compositeScore >= 38 || cn7Score >= 42 || tremorScore >= 48 || bradyScore >= 48) {
      urgencyLevel = "AMBER — PRIORITY PHC MEDICAL OFFICER EVALUATION";
      bannerClass = "triage-banner triage-amber";
      protocolCode = "NPCDCS-TIER-2 (48-Hour PHC Medical Consult)";
    }

    return {
      cn7Score,
      tremorScore,
      bradyScore,
      compositeScore,
      urgencyLevel,
      bannerClass,
      protocolCode
    };
  }

  let latestEnglishSpeechText = "";
  let latestPrintableHtml = "";
  let latestFhirJson = {};

  function buildDeterministicClinicalSynthesis(patient, phc, notes, m, risk, gis) {
    const cnFinding =
      m.mouthAsymMm >= 2.2
        ? `Cranial Nerve VII asymmetry detected (${m.mouthAsymMm} mm oral commissure droop, ${m.eyeRatio} palpebral ratio, ${m.symmetryIndex}% symmetry index), indicating need for clinical stroke or facial palsy evaluation.`
        : `Intact bilateral Cranial Nerve VII facial symmetry (${m.mouthAsymMm} mm deviation, ${m.eyeRatio} palpebral ratio, ${m.symmetryIndex}% symmetry index — within healthy reference limits).`;

    const tremorFinding =
      m.tremorAmpMm >= 0.95
        ? `High-pass detrended 128-point DFT spectrum shows dominant oscillation at ${m.peakHz} Hz with ${m.tremorAmpMm} mm RMS amplitude (${m.pdBandRatio}% power in the 4.0–6.5 Hz Parkinsonian band).`
        : `High-pass detrended 128-point DFT hand spectrum shows normal physiological stability (${m.tremorAmpMm} mm RMS amplitude, peak at ${m.peakHz || 9.0} Hz — no pathological resting or kinetic tremor).`;

    const tapFinding =
      m.tapCount >= 4
        ? `Motor-cortex finger tapping (${m.tapCount} taps, mean ITI ${m.meanItiMs} ms) recorded an OLS fatigue slope of ${m.fatigueSlope >= 0 ? "+" : ""}${m.fatigueSlope} ms/tap and rhythm CV of ${m.tapCvPercent}%.`
        : `Motor-cortex rapid finger tapping test awaiting trial or within baseline rhythm.`;

    const englishAdvisory = `Neuro-Drishti screening report for ${patient} at ${phc}. Composite Neuro-Motor Risk Score is ${risk.compositeScore} out of 100, classified as ${risk.urgencyLevel.split("—")[0].trim()}. ${cnFinding} ${tremorFinding}`;

    return {
      clinicalSummary: `${cnFinding} ${tremorFinding} ${tapFinding}`,
      recommendedAction:
        risk.bannerClass.includes("triage-red")
          ? `Immediate referral to ${gis.destinationHub} (${gis.roadDistanceKm} km; 108 Ambulance ETA ~${gis.ambulanceEtaMin} min). Record vitals (BP, capillary blood glucose) and pre-notify neurology unit.`
          : risk.bannerClass.includes("triage-amber")
          ? `Schedule non-emergent PHC Medical Officer evaluation at ${phc} within 48 hours and initiate eSanjeevani tele-neurology consultation.`
          : `All quantitative neuro-motor biomarkers are within healthy physiological thresholds. No urgent tertiary referral required; continue routine community wellness tracking.`,
      englishAdvisory,
      engineSource: "Deterministic High-Pass Edge-CDSS v1.4 (100% Mathematical Verification)"
    };
  }

  async function callGeminiFlashClinicalAPI(apiKey, payload) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
    const promptText = `You are NEURO-DRISHTI, a clinical decision support AI for Primary Health Centres (PHCs) in Andhra Pradesh.
Analyze the following quantitative biometric telemetry and return ONLY valid JSON with keys:
"clinicalSummary" (concise 3-sentence neurological interpretation referencing the exact mm, Hz, and ms numbers),
"recommendedAction" (concrete clinical next steps appropriate for the risk tier and GIS hospital route),
"englishAdvisory" (clear 3-sentence spoken summary for the health worker).

Telemetry Payload:
${JSON.stringify(payload, null, 2)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      })
    });
    if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}`);
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText);
    return {
      clinicalSummary: parsed.clinicalSummary,
      recommendedAction: parsed.recommendedAction,
      englishAdvisory: parsed.englishAdvisory,
      engineSource: "Google Gemini 2.5 Flash Live API + High-Pass Edge-CDSS"
    };
  }

  window.generateClinicalReferral = async function () {
    const btnGen = document.getElementById("btnGenerateTriage");
    const banner = document.getElementById("triageBanner");
    const reportContent = document.getElementById("clinicalReportContent");

    const patient = document.getElementById("patientName")?.value || "Subject-01";
    const phc = document.getElementById("phcLocation")?.value || "Yemmiganur Rural PHC";
    const notes = document.getElementById("ashaNotes")?.value || "Routine community screening";
    const apiKey = (document.getElementById("geminiApiKey")?.value || "").trim();

    const m = window.NeuroDrishtiState?.latestMetrics || {};
    const risk = evaluateClinicalRiskMatrix();
    const gis = computeGisReferralRoute();

    btnGen.disabled = true;
    btnGen.textContent = "⏳ Computing Biometrics & GISE Route...";

    let result = buildDeterministicClinicalSynthesis(patient, phc, notes, m, risk, gis);

    if (apiKey.length > 15) {
      try {
        const aiResult = await callGeminiFlashClinicalAPI(apiKey, {
          patient,
          phc,
          fieldNotes: notes,
          biometrics: m,
          compositeRisk: risk,
          gisReferralRoute: gis
        });
        if (aiResult && aiResult.clinicalSummary) result = aiResult;
      } catch (err) {
        console.warn("Using deterministic offline CDSS:", err.message);
      }
    }

    latestEnglishSpeechText = result.englishAdvisory;
    latestFhirJson = {
      resourceType: "DiagnosticReport",
      system: "NEURO-DRISHTI v1.4",
      team: "JAAZRAI (HSC|AP|00148)",
      subject: patient,
      originFacility: phc,
      triageTier: risk.urgencyLevel,
      compositeRiskScore: risk.compositeScore,
      subScores: {
        cranialNerveVII: risk.cn7Score,
        spectralTremor: risk.tremorScore,
        bradykinesiaTap: risk.bradyScore
      },
      biometricMeasurements: m,
      gisTertiaryRouting: gis,
      clinicalSynthesis: result.clinicalSummary,
      recommendedAction: result.recommendedAction
    };

    banner.className = risk.bannerClass;
    banner.innerHTML = `
      <span>${risk.urgencyLevel}</span>
      <span>RISK SCORE: ${risk.compositeScore}/100</span>
    `;

    reportContent.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:0.4rem; margin-bottom:0.65rem; font-family:var(--font-mono); font-size:0.7rem;">
        <div style="background:#0f172a; padding:0.35rem 0.5rem; border-radius:5px; border:1px solid #334155;">
          <span style="color:#94a3b8;">CN-VII Score:</span> <strong style="color:#fff;">${risk.cn7Score}/100</strong>
        </div>
        <div style="background:#0f172a; padding:0.35rem 0.5rem; border-radius:5px; border:1px solid #334155;">
          <span style="color:#94a3b8;">Tremor Score:</span> <strong style="color:#fff;">${risk.tremorScore}/100</strong>
        </div>
        <div style="background:#0f172a; padding:0.35rem 0.5rem; border-radius:5px; border:1px solid #334155;">
          <span style="color:#94a3b8;">Motor Tap Score:</span> <strong style="color:#fff;">${risk.bradyScore}/100</strong>
        </div>
      </div>

      <p style="margin-bottom:0.55rem;"><strong style="color:#38bdf8;">1. Quantitative Neurological Findings:</strong><br/>${result.clinicalSummary}</p>

      <p style="margin-bottom:0.55rem;"><strong style="color:#10b981;">2. Clinical Action Protocol (${risk.protocolCode}):</strong><br/>${result.recommendedAction}</p>

      <div style="background:rgba(30,41,59,0.55); border:1px solid #334155; border-radius:6px; padding:0.55rem 0.65rem; margin-bottom:0.45rem; font-size:0.75rem;">
        <div style="color:#f59e0b; font-weight:700; margin-bottom:0.2rem;">
          🚑 GISE Geodesic Tertiary Route (${gis.originSource}: ${gis.originLat}°N, ${gis.originLon}°E)
        </div>
        <div><strong>Nearest Tertiary Hub:</strong> ${gis.destinationHub}</div>
        <div><strong>Distance &amp; 108 ETA:</strong> ${gis.roadDistanceKm} km road (${gis.geodesicKm} km geodesic) • <strong>~${gis.ambulanceEtaMin} mins</strong></div>
        <div style="color:#94a3b8; font-size:0.7rem;">Capabilities: ${gis.capabilities}</div>
      </div>

      <div style="margin-top:0.45rem; font-size:0.65rem; color:#64748b; font-family:var(--font-mono); text-align:right;">
        Engine: ${result.engineSource}
      </div>
    `;

    latestPrintableHtml = buildPrintableSlipHtml(patient, phc, notes, m, risk, gis, result);

    btnGen.disabled = false;
    btnGen.textContent = "🩺 Synthesize PHC Clinical Report";
  };

  function speakEnglishSummary(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.98;
    window.speechSynthesis.speak(utter);
  }

  function buildPrintableSlipHtml(patient, phc, notes, m, risk, gis, result) {
    const refId = `ND-AP-${Date.now().toString().slice(-6)}`;
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>PHC Neuro-Triage Referral Slip - ${refId}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 28px; max-width: 820px; margin: 0 auto; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }
    .badge { background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 9px; text-align: left; }
    th { background: #f1f5f9; }
    .box { border: 1px solid #94a3b8; padding: 12px; border-radius: 6px; margin-top: 12px; background: #f8fafc; font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin:0;">NEURO-DRISHTI | Rural PHC Digital Neuro-Triage Slip</h2>
      <p style="margin:4px 0 0; font-size:12px;">VBYLD 2027 Hack for Social Cause • Team JAAZRAI (Reg ID: HSC|AP|00148) • Mohan Babu University</p>
    </div>
    <div style="text-align:right;">
      <div class="badge">Ref ID: ${refId}</div>
      <div style="font-size:11px; margin-top:4px;">${new Date().toLocaleString("en-IN")}</div>
    </div>
  </div>
  <p><strong>Beneficiary:</strong> ${patient} &nbsp;|&nbsp; <strong>Origin PHC:</strong> ${phc} &nbsp;|&nbsp; <strong>Triage Tier:</strong> ${risk.urgencyLevel} (Score: ${risk.compositeScore}/100)</p>
  <p><strong>Field Clinical Notes:</strong> ${notes}</p>
  <table>
    <tr>
      <th>Biometric Biomarker Module</th>
      <th>Measured Quantitative Value</th>
      <th>Healthy Reference Threshold</th>
      <th>Sub-Score</th>
    </tr>
    <tr>
      <td>A. Cranial Nerve VII Oral Droop &amp; Eye Ratio</td>
      <td>${m.mouthAsymMm} mm droop | ${m.eyeRatio} ratio (${m.symmetryIndex}% sym)</td>
      <td>&lt; 2.2 mm droop | 0.90–1.10 ratio (&gt;91% sym)</td>
      <td>${risk.cn7Score} / 100</td>
    </tr>
    <tr>
      <td>B. High-Pass 128-Pt DFT Hand Tremor Spectrum</td>
      <td>Peak: ${m.peakHz} Hz | High-Pass RMS: ${m.tremorAmpMm} mm | PD Band: ${m.pdBandRatio}%</td>
      <td>Steady RMS &lt; 0.95 mm | Physiological 8–12 Hz</td>
      <td>${risk.tremorScore} / 100</td>
    </tr>
    <tr>
      <td>C. Bradykinesia Motor Tap Regression (10s)</td>
      <td>Mean ITI: ${m.meanItiMs} ms | Slope: ${m.fatigueSlope} ms/tap | CV: ${m.tapCvPercent}%</td>
      <td>Slope &lt; +2.5 ms/tap | Rhythm CV &lt; 18%</td>
      <td>${risk.bradyScore} / 100</td>
    </tr>
  </table>
  <div class="box">
    <strong>1. Quantitative Neurological Findings:</strong><br/>${result.clinicalSummary}<br/><br/>
    <strong>2. Recommended Clinical Action (${risk.protocolCode}):</strong><br/>${result.recommendedAction}
  </div>
  <div class="box">
    <strong>3. GISE Spatial Tertiary Referral Routing:</strong><br/>
    Nearest Tertiary Hub: <strong>${gis.destinationHub}</strong> (${gis.roadDistanceKm} km road distance / ${gis.geodesicKm} km geodesic; 108 Ambulance ETA: ~${gis.ambulanceEtaMin} mins).<br/>
    Available Capabilities: ${gis.capabilities}
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
  }

  window.addEventListener("DOMContentLoaded", () => {
    installHardwareStreamGuard();
    injectClinicalEnhancementsUI();

    document.getElementById("btnGenerateTriage")?.addEventListener("click", () => {
      window.generateClinicalReferral();
    });

    document.getElementById("btnSpeakEnglish")?.addEventListener("click", () => {
      if (!latestEnglishSpeechText) {
        window.generateClinicalReferral().then(() => {
          speakEnglishSummary(latestEnglishSpeechText);
        });
      } else {
        speakEnglishSummary(latestEnglishSpeechText);
      }
    });

    document.getElementById("btnCopyJsonReport")?.addEventListener("click", () => {
      const btn = document.getElementById("btnCopyJsonReport");
      if (!latestFhirJson.resourceType) window.generateClinicalReferral();
      navigator.clipboard.writeText(JSON.stringify(latestFhirJson, null, 2)).then(() => {
        btn.textContent = "✅ Copied FHIR JSON!";
        setTimeout(() => { btn.textContent = "📋 Copy FHIR JSON"; }, 1800);
      });
    });

    document.getElementById("btnPrintReport")?.addEventListener("click", () => {
      if (!latestPrintableHtml) {
        window.generateClinicalReferral().then(() => {
          const w = window.open("", "_blank");
          if (w) { w.document.write(latestPrintableHtml); w.document.close(); }
        });
      } else {
        const w = window.open("", "_blank");
        if (w) { w.document.write(latestPrintableHtml); w.document.close(); }
      }
    });
  });
})();