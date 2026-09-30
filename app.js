/**
 * Dynamic Solar Arc Engine — 370 / 20 / 72 / 72 Framework
 * Maps solar orbital mechanics directly to:
 * - 370 Days / Cycle
 * - 20 Segments (18.5 days each)
 * - 72 Arcs ("Hours") per day
 * - 72 Beats ("Minutes") per Arc
 * - 72 Pulses ("Seconds") per Beat
 */

const RAD = Math.PI / 180;

// --- 1. ASTRONOMICAL COMPUTATIONS ---

function getJulianDate(date) {
  return (date.getTime() / 86400000) + 2440587.5;
}

function calculateDeltaT(year) {
  if (year >= 2005 && year <= 2050) {
    const t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * (t ** 2);
  }
  return 69.0;
}

function getAbsoluteSolarCoordinates(date) {
  const JD_UT = getJulianDate(date);
  const deltaT = calculateDeltaT(date.getUTCFullYear());
  const JD_TT = JD_UT + (deltaT / 86400);
  
  const T = (JD_TT - 2451545.0) / 36525;

  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * (T ** 2);
  L0 = (L0 % 360 + 360) % 360;

  let M = 357.52911 + 35999.05029 * T - 0.0001537 * (T ** 2);
  M = (M % 360 + 360) % 360;
  const Mrad = M * RAD;

  const C = (1.914602 - 0.004817 * T - 0.000014 * (T ** 2)) * Math.sin(Mrad)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
          + 0.000289 * Math.sin(3 * Mrad);

  const trueLong = L0 + C;

  const JupiterMeanAnomaly = (20.020 + 3034.9057 * T) * RAD;
  const VenusMeanAnomaly   = (212.603 + 58517.8038 * T) * RAD;
  const vsopPerturbation = 0.0013 * Math.sin(JupiterMeanAnomaly) 
                         + 0.0008 * Math.sin(2 * VenusMeanAnomaly);

  const Omega = (125.04 - 1934.136 * T) * RAD;
  const precNutCorrection = (-0.00478 * Math.sin(Omega)) - 0.00569;

  const apparentLongitude = ((trueLong + vsopPerturbation + precNutCorrection) % 360 + 360) % 360;
  const instantaneousVelocityScale = 1 + (0.0334 * Math.cos(Mrad));

  return {
    apparentLongitude,
    vsopPerturbation,
    precNutCorrection,
    deltaT,
    instantaneousVelocityScale
  };
}

// --- 2. 370 / 20 / 72 / 72 CONVERSION LOGIC ---

function calculate370Time(date, longitude) {
  // 1. Calculate Day Fraction from local solar time
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const dayFraction = (date - startOfDay) / 86400000;

  // 2. Base 72/72 Time Division (72 Arcs x 72 Beats x 72 Pulses = 373,248 total units/day)
  const totalPulses = dayFraction * (72 * 72 * 72);
  const arcs = Math.floor(totalPulses / (72 * 72));
  const beats = Math.floor((totalPulses % (72 * 72)) / 72);
  const pulses = Math.floor(totalPulses % 72);

  // 3. Calendar Division (370 Days mapped onto 360° orbital longitude)
  const cycleDay = Math.floor((longitude / 360) * 370) + 1;
  const segment = Math.floor(((cycleDay - 1) / 370) * 20) + 1;

  return { arcs, beats, pulses, cycleDay, segment };
}

// --- 3. UI & RENDER CONTROLLER ---

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('clockCanvas');
  const ctx = canvas.getContext('2d');

  const elDigitalTime = document.getElementById('digitalTime');
  const elSegmentVal  = document.getElementById('segmentVal');
  const elCycleDayVal = document.getElementById('cycleDayVal');
  const elGrid        = document.getElementById('calendarGrid');

  const elSunLong     = document.getElementById('sunLong');
  const elVsopCorr    = document.getElementById('vsopCorr');
  const elPrecNutCorr = document.getElementById('precNutCorr');
  const elDeltaTVal   = document.getElementById('deltaTVal');
  const elStepScale   = document.getElementById('stepScale');
  const btnTheme      = document.getElementById('themeToggle');

  // Build 20 Segment Grid
  function buildGrid() {
    elGrid.innerHTML = '';
    for (let i = 1; i <= 20; i++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.id = `segment-cell-${i}`;
      cell.textContent = `S${i.toString().padStart(2, '0')}`;
      elGrid.appendChild(cell);
    }
  }

  function update() {
    const now = new Date();
    const solar = getAbsoluteSolarCoordinates(now);
    const t370 = calculate370Time(now, solar.apparentLongitude);

    // Update Digital Time Display (Arcs : Beats : Pulses)
    const fmt = (n) => n.toString().padStart(2, '0');
    elDigitalTime.textContent = `${fmt(t370.arcs)} : ${fmt(t370.beats)} : ${fmt(t370.pulses)}`;

    // Update Calendar Metrics
    elSegmentVal.textContent = `${t370.segment} / 20`;
    elCycleDayVal.textContent = `${t370.cycleDay} / 370`;

    // Highlight active segment
    for (let i = 1; i <= 20; i++) {
      const cell = document.getElementById(`segment-cell-${i}`);
      if (cell) cell.classList.toggle('active', i === t370.segment);
    }

    // Telemetry Dashboard Updates
    elSunLong.textContent = `${solar.apparentLongitude.toFixed(4)}°`;
    elVsopCorr.textContent = `${(solar.vsopPerturbation * 3600).toFixed(2)}″`;
    elPrecNutCorr.textContent = `${(solar.precNutCorrection * 3600).toFixed(2)}″`;
    elDeltaTVal.textContent = `${solar.deltaT.toFixed(2)} s`;
    elStepScale.textContent = `${solar.instantaneousVelocityScale.toFixed(6)}x`;

    // Canvas Graphics Rendering
    drawClock(ctx, canvas.width, canvas.height, t370.arcs, t370.beats, t370.pulses);
  }

  function drawClock(ctx, width, height, arcs, beats, pulses) {
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2, cy = height / 2;
    const radius = 95;

    const styles = getComputedStyle(document.documentElement);
    const gold = styles.getPropertyValue('--accent-gold').trim() || '#d4af37';
    const highlight = styles.getPropertyValue('--highlight').trim() || '#38bdf8';

    // Base Circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Active Arc Progress (72 Arcs = 360°)
    const totalArcFraction = (arcs + beats / 72 + pulses / (72 * 72)) / 72;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (totalArcFraction * 2 * Math.PI);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Dynamic Indicator Node
    const nodeX = cx + radius * Math.cos(endAngle);
    const nodeY = cy + radius * Math.sin(endAngle);

    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = highlight;
    ctx.shadowColor = highlight;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Theme Controller
  const themes = ['dark', 'daylight', 'twilight'];
  let currentThemeIdx = 0;

  btnTheme.addEventListener('click', () => {
    currentThemeIdx = (currentThemeIdx + 1) % themes.length;
    document.documentElement.setAttribute('data-theme', themes[currentThemeIdx]);
    update();
  });

  // Safe Start Loop
  buildGrid();
  update();
  setInterval(update, 200); // 200ms updates ensure smooth beat/pulse transitions
});
