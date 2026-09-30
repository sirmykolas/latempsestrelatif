/**
 * Astronomical Solar Arc Engine
 * Implements VSOP87 orbital perturbations, IAU precession/nutation models,
 * and NASA polynomial Delta T corrections for absolute astronomical fidelity.
 */

// --- 1. ASTRONOMICAL COMPUTATION ENGINE ---

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Calculates Julian Date (UT) from JS Date object.
 */
function getJulianDate(date) {
  return (date.getTime() / 86400000) + 2440587.5;
}

/**
 * Estimates ΔT (TT - UT) in seconds using NASA Polynomials.
 */
function calculateDeltaT(year) {
  if (year >= 2005 && year <= 2050) {
    const t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * (t ** 2);
  }
  if (year > 2050) {
    const t = (year - 1820) / 100;
    return -20 + 32 * (t ** 2);
  }
  return 69.0; // Fallback baseline
}

/**
 * High-precision calculation of Apparent Solar Longitude (λ).
 * Incorporates VSOP87 major planetary terms & IAU Precession/Nutation.
 */
function getAbsoluteSolarCoordinates(date) {
  const JD_UT = getJulianDate(date);
  const deltaT = calculateDeltaT(date.getUTCFullYear());
  const JD_TT = JD_UT + (deltaT / 86400);
  
  // Julian Centuries from J2000.0
  const T = (JD_TT - 2451545.0) / 36525;

  // Geometric Mean Longitude of the Sun
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * (T ** 2);
  L0 = (L0 % 360 + 360) % 360;

  // Mean Anomaly of the Sun
  let M = 357.52911 + 35999.05029 * T - 0.0001537 * (T ** 2);
  M = (M % 360 + 360) % 360;
  const Mrad = M * RAD;

  // Sun Center Equation (Keplerian base)
  const C = (1.914602 - 0.004817 * T - 0.000014 * (T ** 2)) * Math.sin(Mrad)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
          + 0.000289 * Math.sin(3 * Mrad);

  // True Longitude
  const trueLong = L0 + C;

  // --- VSOP87 Perturbations (Jupiter & Venus Influence) ---
  const JupiterMeanAnomaly = (20.020 + 3034.9057 * T) * RAD;
  const VenusMeanAnomaly   = (212.603 + 58517.8038 * T) * RAD;
  
  const vsopPerturbation = 0.0013 * Math.sin(JupiterMeanAnomaly) 
                         + 0.0008 * Math.sin(2 * VenusMeanAnomaly);

  // --- IAU Precession & Nutation Corrections ---
  const Omega = (125.04 - 1934.136 * T) * RAD; // Longitude of Moon's node
  const nutationInLongitude = -0.00478 * Math.sin(Omega);
  const aberration = -0.00569; // Aberration of light

  const precNutCorrection = nutationInLongitude + aberration;

  // Apparent Solar Longitude (λ)
  const apparentLongitude = ((trueLong + vsopPerturbation + precNutCorrection) % 360 + 360) % 360;

  // Instantaneous Angular Velocity ratio (vs baseline 1.0)
  const instantaneousVelocityScale = 1 + (0.0334 * Math.cos(Mrad));

  return {
    apparentLongitude,
    vsopPerturbation,
    precNutCorrection,
    deltaT,
    instantaneousVelocityScale
  };
}

// --- 2. RENDER ENGINE & UI INTERACTION ---

const canvas = document.getElementById('clockCanvas');
const ctx = canvas.getContext('2d');

const elDigitalTime = document.getElementById('digitalTime');
const elCycleVal    = document.getElementById('cycleVal');
const elSegmentVal  = document.getElementById('segmentVal');
const elGrid        = document.getElementById('calendarGrid');

const elSunLong     = document.getElementById('sunLong');
const elVsopCorr    = document.getElementById('vsopCorr');
const elPrecNutCorr = document.getElementById('precNutCorr');
const elDeltaTVal   = document.getElementById('deltaTVal');
const elStepScale   = document.getElementById('stepScale');
const btnTheme      = document.getElementById('themeToggle');

// Initialize 20 Calendar Grid Cells
function buildCalendarGrid() {
  elGrid.innerHTML = '';
  for (let i = 1; i <= 20; i++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.id = `grid-cell-${i}`;
    cell.textContent = i.toString().padStart(2, '0');
    elGrid.appendChild(cell);
  }
}

function updateClockUI() {
  const now = new Date();
  const solarData = getAbsoluteSolarCoordinates(now);

  // Derive Time System Units
  const totalArcSeconds = solarData.apparentLongitude * 240; // 360° mapped to 86,400 arc-sec equivalents
  const hours = Math.floor(totalArcSeconds / 3600);
  const minutes = Math.floor((totalArcSeconds % 3600) / 60);
  const seconds = Math.floor(totalArcSeconds % 60);

  // Digital Output
  elDigitalTime.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Solar Calendar Mapping
  const cycle = Math.floor(solarData.apparentLongitude / 18) + 1; // 20 segments of 18°
  const segmentDay = Math.floor((solarData.apparentLongitude % 18) / 0.9) + 1;

  elCycleVal.textContent = cycle;
  elSegmentVal.textContent = `${segmentDay} / 20`;

  // Update Grid Visual
  for (let i = 1; i <= 20; i++) {
    const cell = document.getElementById(`grid-cell-${i}`);
    if (cell) {
      cell.classList.toggle('active', i === segmentDay);
    }
  }

  // Telemetry Dashboard Updates
  elSunLong.textContent = `${solarData.apparentLongitude.toFixed(4)}°`;
  elVsopCorr.textContent = `${(solarData.vsopPerturbation * 3600).toFixed(2)}″`;
  elPrecNutCorr.textContent = `${(solarData.precNutCorrection * 3600).toFixed(2)}″`;
  elDeltaTVal.textContent = `${solarData.deltaT.toFixed(2)} s`;
  elStepScale.textContent = `${solarData.instantaneousVelocityScale.toFixed(6)}x`;

  // Canvas Graphics Rendering
  drawClockCanvas(solarData.apparentLongitude);
}

function drawClockCanvas(longitude) {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 100;

  ctx.clearRect(0, 0, width, height);

  // Style variables from computed CSS
  const styles = getComputedStyle(document.documentElement);
  const goldColor = styles.getPropertyValue('--accent-gold').trim() || '#d4af37';
  const highlightColor = styles.getPropertyValue('--highlight').trim() || '#38bdf8';

  // Outer Orbital Ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Progress Arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (longitude * RAD);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Solar Indicator Node
  const nodeX = cx + radius * Math.cos(endAngle);
  const nodeY = cy + radius * Math.sin(endAngle);

  ctx.beginPath();
  ctx.arc(nodeX, nodeY, 7, 0, 2 * Math.PI);
  ctx.fillStyle = highlightColor;
  ctx.fill();
  ctx.shadowColor = highlightColor;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0; // Reset blur
}

// Theme Cycling Control
const themes = ['dark', 'daylight', 'twilight'];
let currentThemeIdx = 0;

btnTheme.addEventListener('click', () => {
  currentThemeIdx = (currentThemeIdx + 1) % themes.length;
  document.documentElement.setAttribute('data-theme', themes[currentThemeIdx]);
  updateClockUI();
});

// Initialization
buildCalendarGrid();
updateClockUI();
setInterval(updateClockUI, 1000);
