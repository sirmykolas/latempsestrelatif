// --- System Constants ---
const EPOCH_START_UTC = Date.UTC(2026, 0, 1, 0, 0, 0); // Jan 1, 2026
const PERIHELION_DAY_OF_YEAR = 3;

const HOURS_PER_DAY = 20;
const MINS_PER_HOUR = 72;
const SECS_PER_MIN = 72;
const TOTAL_CUSTOM_SECS_PER_DAY = HOURS_PER_DAY * MINS_PER_HOUR * SECS_PER_MIN; // 103,680 custom secs/day

const ROMAN_HOURS = [
  "XX", "I", "II", "III", "IV", "V", 
  "VI", "VII", "VIII", "IX", "X", 
  "XI", "XII", "XIII", "XIV", "XV", 
  "XVI", "XVII", "XVIII", "XIX"
];

const LUNAR_PHASES = [
  "🌑 New Moon", "🌒 Waxing Crescent", "🌓 First Quarter", 
  "🌔 Waxing Gibbous", "🌕 Full Moon", "🌖 Waning Gibbous", 
  "🌗 Last Quarter", "🌘 Waning Crescent"
];

// --- Simulation State ---
let simOffsetMs = 0;
let speedMultiplier = 1;
let lastRealTime = performance.now();
let virtualTimeMs = Date.now();

// --- Newton-Raphson Kepler Equation Solver ---
function solveKepler(M, e) {
  let E = M; // Initial guess
  const tolerance = 1e-8;
  const maxIterations = 100;

  for (let i = 0; i < maxIterations; i++) {
    const f = E - e * Math.sin(E) - M;
    if (Math.abs(f) < tolerance) break;
    const fPrime = 1 - e * Math.cos(E);
    E = E - f / fPrime;
  }
  return E;
}

function getDynamicParameters(now) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;
  
  // Mean Anomaly (M)
  const M_rad = ((dayOfYear - PERIHELION_DAY_OF_YEAR) / 365.25) * 2 * Math.PI;

  const e_0 = 0.0167086;
  const t_years = (now.getTime() - EPOCH_START_UTC) / (365.25 * 86400000 * 1000);
  const e = e_0 + 0.00005 * Math.cos(2 * Math.PI * t_years / 11.86);

  // Solves Kepler's Equation for exact Eccentric Anomaly (E)
  const E_rad = solveKepler(M_rad, e);

  // Computes exact True Anomaly (nu) from Eccentric Anomaly
  const tanHalfNu = Math.sqrt((1 + e) / (1 - e)) * Math.tan(E_rad / 2);
  let nuRad = 2 * Math.atan(tanHalfNu);
  if (nuRad < 0) nuRad += 2 * Math.PI;
  const nuDeg = (nuRad * 180 / Math.PI) % 360;

  const obliquityRad = 23.44 * (Math.PI / 180);
  const c = e * Math.cos(obliquityRad);

  const SI_SECONDS_PER_360_YEAR = 365.25 * 86400;
  const TOTAL_CUSTOM_SECS_PER_YEAR = 360 * TOTAL_CUSTOM_SECS_PER_DAY;
  const y0 = SI_SECONDS_PER_360_YEAR / TOTAL_CUSTOM_SECS_PER_YEAR; 

  const x_len = y0 * (1 + c * Math.cos(nuRad)) / Math.pow(1 + e * Math.cos(nuRad), 2);

  return { nuDeg, e, c, x_len, y0 };
}

function getNextAstronomicalEvent(nuDeg) {
  const events = [
    { name: "Vernal Equinox", deg: 78.0 },
    { name: "Summer Solstice", deg: 168.0 },
    { name: "Autumnal Equinox", deg: 258.0 },
    { name: "Winter Solstice", deg: 348.0 }
  ];

  for (let event of events) {
    if (nuDeg < event.deg) {
      return { event: event.name, remainingDeg: event.deg - nuDeg };
    }
  }
  return { event: "Vernal Equinox", remainingDeg: (360 - nuDeg) + 78.0 };
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateApp() {
  const currentPerformanceTime = performance.now();
  const deltaRealMs = currentPerformanceTime - lastRealTime;
  lastRealTime = currentPerformanceTime;

  // Apply speed multiplier to time tracking
  if (speedMultiplier === 1 && simOffsetMs === 0) {
    virtualTimeMs = Date.now();
  } else {
    virtualTimeMs += deltaRealMs * speedMultiplier;
  }

  const now = new Date(virtualTimeMs + simOffsetMs);
  const params = getDynamicParameters(now);

  // --- LOCAL vs UTC TIME ---
  let elapsedSISecondsToday;
  let timeLabelText = "";

  try {
    const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    const localNow = new Date(now.getTime() - tzOffsetMs);
    const startOfLocalToday = Date.UTC(
      localNow.getUTCFullYear(), 
      localNow.getUTCMonth(), 
      localNow.getUTCDate()
    );
    elapsedSISecondsToday = (localNow.getTime() - startOfLocalToday) / 1000;

    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
    const localTimeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    timeLabelText = `${localTimeString} (${userTz})`;
  } catch (e) {
    const startOfUTCToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    elapsedSISecondsToday = (now.getTime() - startOfUTCToday) / 1000;
    timeLabelText = now.toUTCString().split(' ')[4] + " UTC";
  }

  // Custom Time Math
  const customSecRatio = TOTAL_CUSTOM_SECS_PER_DAY / 86400;
  const secondsToday = (elapsedSISecondsToday * customSecRatio) / (params.x_len / params.y0);

  // Calendar Math
  const elapsedSISecondsEpoch = (now.getTime() - EPOCH_START_UTC) / 1000;
  const totalCustomSeconds = elapsedSISecondsEpoch / params.x_len;
  const totalDays = Math.floor(totalCustomSeconds / TOTAL_CUSTOM_SECS_PER_DAY);
  const year = Math.floor(totalDays / 360) + 1;
  const dayOfYear360 = ((totalDays % 360) + 360) % 360;
  const month = Math.floor(dayOfYear360 / 30) + 1;
  const day = (dayOfYear360 % 30) + 1;

  // Breakdown
  const customHours = Math.floor(secondsToday / (MINS_PER_HOUR * SECS_PER_MIN));
  const customMins = Math.floor((secondsToday % (MINS_PER_HOUR * SECS_PER_MIN)) / SECS_PER_MIN);
  const customSecs = Math.floor(secondsToday % SECS_PER_MIN);

  // --- RENDER UI ---
  safeSetText('cal-year', year);
  safeSetText('cal-month', String(month).padStart(2, '0'));
  safeSetText('cal-day', String(day).padStart(2, '0'));
  renderCalendarGrid(day);

  safeSetText('custom-time-display', `${String(customHours).padStart(2, '0')}:${String(customMins).padStart(2, '0')}:${String(customSecs).padStart(2, '0')}`);

  safeSetText('m-nu', `${params.nuDeg.toFixed(2)}°`);
  safeSetText('m-xlen', `${params.x_len.toFixed(5)} s`);
  safeSetText('m-e', params.e.toFixed(6));
  safeSetText('m-c', params.c.toFixed(6));

  safeSetText('utc-time', timeLabelText);

  const drift = ((params.x_len - params.y0) / params.y0) * 100;
  safeSetText('drift-rate', `${drift > 0 ? '+' : ''}${drift.toFixed(3)}%`);

  // Render Lunar Phase
  const lunarIndex = Math.min(Math.floor(((day - 1) / 30) * LUNAR_PHASES.length), LUNAR_PHASES.length - 1);
  safeSetText('lunar-phase-text', LUNAR_PHASES[lunarIndex]);

  // Render Solstice / Equinox Event
  const astroEvent = getNextAstronomicalEvent(params.nuDeg);
  safeSetText('astro-event-text', `Next: ${astroEvent.event} (${astroEvent.remainingDeg.toFixed(1)}° away)`);

  // Dynamic Solar Horizon / UI Twilight Phase
  const hourFraction = customHours / HOURS_PER_DAY;
  if (hourFraction >= 0.25 && hourFraction <= 0.75) {
    document.body.setAttribute('data-theme', 'daylight');
    safeSetText('solar-phase-text', '☀️ Solar Zenith');
  } else if ((hourFraction > 0.20 && hourFraction < 0.25) || (hourFraction > 0.75 && hourFraction < 0.80)) {
    document.body.setAttribute('data-theme', 'twilight');
    safeSetText('solar-phase-text', '🌅 Solar Twilight');
  } else {
    document.body.removeAttribute('data-theme');
    safeSetText('solar-phase-text', '🌌 Deep Cosmic Night');
  }

  drawAnalogClock(customHours, customMins, customSecs);

  requestAnimationFrame(updateApp);
}

let lastActiveDay = -1;
function renderCalendarGrid(currentDay) {
  if (lastActiveDay === currentDay) return;
  lastActiveDay = currentDay;

  const grid = document.getElementById('calendar-days');
  if (!grid) return;
  grid.innerHTML = '';
  for (let d = 1; d <= 30; d++) {
    const cell = document.createElement('div');
    cell.className = `day-cell ${d === currentDay ? 'active' : ''}`;
    cell.textContent = d;
    grid.appendChild(cell);
  }
}

function drawAnalogClock(h, m, s) {
  const canvas = document.getElementById('clock-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = cx - 12;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 72 Graduation Ticks
  for (let i = 0; i < SECS_PER_MIN; i++) {
    const angle = (i / SECS_PER_MIN) * 2 * Math.PI - Math.PI / 2;
    const isMajor = (i % 3.6) < 1;
    const tickLen = isMajor ? 5 : 3;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - tickLen), cy + Math.sin(angle) * (radius - tickLen));
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = isMajor ? '#9ca3af' : '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 20 Roman Hour Marks
  ctx.font = '600 10px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c7d2fe';

  for (let i = 0; i < HOURS_PER_DAY; i++) {
    const angle = (i / HOURS_PER_DAY) * 2 * Math.PI - Math.PI / 2;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - 10), cy + Math.sin(angle) * (radius - 10));
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    const numRadius = radius - 20;
    const nx = cx + Math.cos(angle) * numRadius;
    const ny = cy + Math.sin(angle) * numRadius;
    ctx.fillText(ROMAN_HOURS[i], nx, ny);
  }

  const sAngle = (s / SECS_PER_MIN) * 2 * Math.PI - Math.PI / 2;
  const mAngle = ((m + s / SECS_PER_MIN) / MINS_PER_HOUR) * 2 * Math.PI - Math.PI / 2;
  const hAngle = ((h + m / MINS_PER_HOUR) / HOURS_PER_DAY) * 2 * Math.PI - Math.PI / 2;

  drawHand(ctx, cx, cy, hAngle, radius * 0.45, '#f3f4f6', 4);
  drawHand(ctx, cx, cy, mAngle, radius * 0.65, '#818cf8', 2.5);
  drawHand(ctx, cx, cy, sAngle, radius * 0.82, '#10b981', 1.5);

  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
  ctx.fillStyle = '#10b981';
  ctx.fill();
}

function drawHand(ctx, cx, cy, angle, length, color, width) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// --- EVENT LISTENERS FOR TIME TRAVEL & SPEED CONTROLS ---
document.addEventListener('DOMContentLoaded', () => {
  const scrubber = document.getElementById('time-scrubber');
  const offsetDisplay = document.getElementById('offset-days-display');
  const resetBtn = document.getElementById('reset-time-btn');
  const speedBtns = document.querySelectorAll('.speed-btn');

  if (scrubber) {
    scrubber.addEventListener('input', (e) => {
      const days = parseInt(e.target.value, 10);
      simOffsetMs = days * 86400 * 1000;
      if (offsetDisplay) offsetDisplay.textContent = days;
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      simOffsetMs = 0;
      speedMultiplier = 1;
      virtualTimeMs = Date.now();
      if (scrubber) scrubber.value = 0;
      if (offsetDisplay) offsetDisplay.textContent = "0";
      speedBtns.forEach(btn => btn.classList.remove('active'));
      const defaultSpeedBtn = document.querySelector('.speed-btn[data-speed="1"]');
      if (defaultSpeedBtn) defaultSpeedBtn.classList.add('active');
    });
  }

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      speedMultiplier = parseFloat(btn.dataset.speed);
    });
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

updateApp();
