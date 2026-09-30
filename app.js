// --- Planetary Body Configurations ---
const PLANET_CONFIGS = {
  earth: {
    name: "Earth",
    eccentricity: 0.0167086,
    obliquityDeg: 23.44,
    perihelionDay: 3,
    orbitDays: 365.25,
    solDurationSec: 86400,
    epochStartUtc: Date.UTC(2026, 0, 1, 0, 0, 0)
  },
  mars: {
    name: "Mars",
    eccentricity: 0.0934000,
    obliquityDeg: 25.19,
    perihelionDay: 160,
    orbitDays: 686.98,
    solDurationSec: 88642.66, // 24h 39m 35.244s
    epochStartUtc: Date.UTC(2026, 0, 1, 0, 0, 0)
  },
  venus: {
    name: "Venus",
    eccentricity: 0.0067720,
    obliquityDeg: 177.36, // Retrograde rotation
    perihelionDay: 50,
    orbitDays: 224.70,
    solDurationSec: 10087200, // Solar day ~116.75 Earth days
    epochStartUtc: Date.UTC(2026, 0, 1, 0, 0, 0)
  }
};

let currentPlanetKey = "earth";

// --- System Sub-unit Constants ---
const PRIMARY_ARCS = 20;
const PRIMES_PER_ARC = 72;
const BEATS_PER_PRIME = 72;
const TIERS_PER_BEAT = 72;

const BASE_UNITS_PER_DAY = PRIMARY_ARCS * PRIMES_PER_ARC * BEATS_PER_PRIME; // 103,680

const ROMAN_ARCS = [
  "XX", "I", "II", "III", "IV", "V", 
  "VI", "VII", "VIII", "IX", "X", 
  "XI", "XII", "XIII", "XIV", "XV", 
  "XVI", "XVII", "XVIII", "XIX"
];

// --- Simulation State ---
let simOffsetMs = 0;
let speedMultiplier = 1;
let lastRealTime = performance.now();
let virtualTimeMs = Date.now();

// Default coordinates: Vilnius, Lithuania (54.6872° N, 25.2798° E)
let observerCoords = { lat: 54.6872, lon: 25.2798, source: "Default (Vilnius)" };

// --- Keplerian Solver ---
function solveKepler(M, e) {
  let E = M;
  const tolerance = 1e-8;
  for (let i = 0; i < 100; i++) {
    const f = E - e * Math.sin(E) - M;
    if (Math.abs(f) < tolerance) break;
    E = E - f / (1 - e * Math.cos(E));
  }
  return E;
}

function getDynamicParameters(now, planet) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;
  
  const M_rad = ((dayOfYear - planet.perihelionDay) / planet.orbitDays) * 2 * Math.PI;
  const e = planet.eccentricity;
  const E_rad = solveKepler(M_rad, e);

  const tanHalfNu = Math.sqrt((1 + e) / (1 - e)) * Math.tan(E_rad / 2);
  let nuRad = 2 * Math.atan(tanHalfNu);
  if (nuRad < 0) nuRad += 2 * Math.PI;
  const nuDeg = (nuRad * 180 / Math.PI) % 360;

  const obliquityRad = planet.obliquityDeg * (Math.PI / 180);
  const c = e * Math.cos(obliquityRad);

  const totalSiYear = planet.orbitDays * planet.solDurationSec;
  const totalCustomUnitsYear = 360 * BASE_UNITS_PER_DAY;
  const y0 = totalSiYear / totalCustomUnitsYear; 

  const x_len = y0 * (1 + c * Math.cos(nuRad)) / Math.pow(1 + e * Math.cos(nuRad), 2);

  return { nuDeg, e, c, x_len, y0, obliquityDeg: planet.obliquityDeg };
}

// --- Geolocational Horizon Engine (Solar Elevation & Azimuth) ---
function calculateSolarPosition(now, lat, lon) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;

  // Solar Declination Angle (δ)
  const declinationRad = 23.44 * (Math.PI / 180) * Math.sin((2 * Math.PI / 365.25) * (dayOfYear - 81));

  // Local Hour Angle (H)
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lst = (utcHours * 15 + lon) % 360; // Local Sidereal Time in degrees
  const hourAngleRad = (lst - 180) * (Math.PI / 180);

  const latRad = lat * (Math.PI / 180);

  // Elevation (α) = asin(sin(δ)sin(φ) + cos(δ)cos(φ)cos(H))
  const sinEl = Math.sin(declinationRad) * Math.sin(latRad) + 
                Math.cos(declinationRad) * Math.cos(latRad) * Math.cos(hourAngleRad);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) * (180 / Math.PI);

  // Azimuth (A)
  const cosAz = (Math.sin(declinationRad) - Math.sin(latRad) * sinEl) / 
                (Math.cos(latRad) * Math.cos(Math.asin(sinEl)));
  let azimuthDeg = Math.acos(Math.max(-1, Math.min(1, cosAz))) * (180 / Math.PI);
  if (Math.sin(hourAngleRad) > 0) azimuthDeg = 360 - azimuthDeg;

  return { elevationDeg, azimuthDeg };
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateApp() {
  const currentPerformanceTime = performance.now();
  const deltaRealMs = currentPerformanceTime - lastRealTime;
  lastRealTime = currentPerformanceTime;

  if (speedMultiplier === 1 && simOffsetMs === 0) {
    virtualTimeMs = Date.now();
  } else {
    virtualTimeMs += deltaRealMs * speedMultiplier;
  }

  const now = new Date(virtualTimeMs + simOffsetMs);
  const planet = PLANET_CONFIGS[currentPlanetKey];
  const params = getDynamicParameters(now, planet);

  // --- LOCAL SOLAR TIME ALIGNMENT ---
  // Midnight timestamp for the local device timezone
  const startOfLocalToday = new Date(
    now.getFullYear(), 
    now.getMonth(), 
    now.getDate(), 
    0, 0, 0, 0
  ).getTime();

  // Elapsed real SI seconds since local midnight
  const elapsedSISecondsToday = (now.getTime() - startOfLocalToday) / 1000;

  // Local Time String for UI Display
  const localTimeString = now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  });
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  const timeLabelText = `${localTimeString} (${userTz})`;

  // Dynamic Solar Sub-unit Math relative to Local Midnight
  const customSecRatio = BASE_UNITS_PER_DAY / planet.solDurationSec;
  const baseUnitsToday = (elapsedSISecondsToday * customSecRatio) / (params.x_len / params.y0);

  // Calendar Engine (360-Day Solar Cycle)
  const elapsedSISecondsEpoch = (now.getTime() - planet.epochStartUtc) / 1000;
  const totalCustomUnits = elapsedSISecondsEpoch / params.x_len;
  const totalDays = Math.floor(totalCustomUnits / BASE_UNITS_PER_DAY);
  const year = Math.floor(totalDays / 360) + 1;
  const dayOfYear360 = ((totalDays % 360) + 360) % 360;
  const month = Math.floor(dayOfYear360 / 30) + 1;
  const day = (dayOfYear360 % 30) + 1;

  // Breakdown (° ' '' ''')
  const totalSubUnitsToday = baseUnitsToday * TIERS_PER_BEAT;
  const arcDegree = Math.floor(baseUnitsToday / (PRIMES_PER_ARC * BEATS_PER_PRIME));
  const primeArc = Math.floor((baseUnitsToday % (PRIMES_PER_ARC * BEATS_PER_PRIME)) / BEATS_PER_PRIME);
  const beatArc = Math.floor(baseUnitsToday % BEATS_PER_PRIME);
  const tierArc = Math.floor(totalSubUnitsToday % TIERS_PER_BEAT);

  // Render Core UI
  safeSetText('cal-year', year);
  safeSetText('cal-month', String(month).padStart(2, '0'));
  safeSetText('cal-day', String(day).padStart(2, '0'));
  renderCalendarGrid(day);

  safeSetText(
    'custom-time-display', 
    `${String(arcDegree).padStart(2, '0')}° ${String(primeArc).padStart(2, '0')}' ${String(beatArc).padStart(2, '0')}'' ${String(tierArc).padStart(2, '0')}'''`
  );

  // Render Geolocational Horizon Data
  const solarPos = calculateSolarPosition(now, observerCoords.lat, observerCoords.lon);
  safeSetText('geo-coords-text', `${observerCoords.lat.toFixed(2)}°, ${observerCoords.lon.toFixed(2)}° (${observerCoords.source})`);
  safeSetText('geo-elevation-text', `${solarPos.elevationDeg.toFixed(2)}°`);
  safeSetText('geo-azimuth-text', `${solarPos.azimuthDeg.toFixed(2)}°`);

  let horizonState = "🌌 Night (Sub-horizon)";
  if (solarPos.elevationDeg > 0) {
    horizonState = "☀️ Daylight (Above Horizon)";
    document.body.setAttribute('data-theme', 'daylight');
  } else if (solarPos.elevationDeg > -6) {
    horizonState = "🌅 Civil Twilight";
    document.body.setAttribute('data-theme', 'twilight');
  } else {
    document.body.removeAttribute('data-theme');
  }
  safeSetText('geo-state-text', horizonState);

  // Render Kepler Metrics
  safeSetText('m-nu', `${params.nuDeg.toFixed(2)}°`);
  safeSetText('m-xlen', `${params.x_len.toFixed(5)} s`);
  safeSetText('m-e', params.e.toFixed(6));
  safeSetText('m-obliquity', `${params.obliquityDeg.toFixed(2)}°`);

  safeSetText('utc-time', timeLabelText);

  const drift = ((params.x_len - params.y0) / params.y0) * 100;
  safeSetText('drift-rate', `${drift > 0 ? '+' : ''}${drift.toFixed(3)}%`);

  drawAnalogClock(arcDegree, primeArc, beatArc);

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

function drawAnalogClock(arc, prime, beat) {
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

  // 72 Graduation Ticks (')
  for (let i = 0; i < PRIMES_PER_ARC; i++) {
    const angle = (i / PRIMES_PER_ARC) * 2 * Math.PI - Math.PI / 2;
    const isMajor = (i % 3.6) < 1;
    const tickLen = isMajor ? 5 : 3;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - tickLen), cy + Math.sin(angle) * (radius - tickLen));
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = isMajor ? '#9ca3af' : '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 20 Primary Celestial Arc Marks (°)
  ctx.font = '600 10px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c7d2fe';

  for (let i = 0; i < PRIMARY_ARCS; i++) {
    const angle = (i / PRIMARY_ARCS) * 2 * Math.PI - Math.PI / 2;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - 10), cy + Math.sin(angle) * (radius - 10));
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    const nx = cx + Math.cos(angle) * (radius - 20);
    const ny = cy + Math.sin(angle) * (radius - 20);
    ctx.fillText(ROMAN_ARCS[i], nx, ny);
  }

  const beatAngle = (beat / BEATS_PER_PRIME) * 2 * Math.PI - Math.PI / 2;
  const primeAngle = ((prime + beat / BEATS_PER_PRIME) / PRIMES_PER_ARC) * 2 * Math.PI - Math.PI / 2;
  const arcAngle = ((arc + prime / PRIMES_PER_ARC) / PRIMARY_ARCS) * 2 * Math.PI - Math.PI / 2;

  drawHand(ctx, cx, cy, arcAngle, radius * 0.45, '#f3f4f6', 4);
  drawHand(ctx, cx, cy, primeAngle, radius * 0.65, '#818cf8', 2.5);
  drawHand(ctx, cx, cy, beatAngle, radius * 0.82, '#10b981', 1.5);

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

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
  const scrubber = document.getElementById('time-scrubber');
  const offsetDisplay = document.getElementById('offset-days-display');
  const resetBtn = document.getElementById('reset-time-btn');
  const speedBtns = document.querySelectorAll('.speed-btn');
  const planetBtns = document.querySelectorAll('.planet-btn');
  const gpsBtn = document.getElementById('request-gps-btn');

  // Planet Switcher
  planetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      planetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPlanetKey = btn.dataset.planet;
      lastActiveDay = -1; // Force calendar grid re-render
    });
  });

  // GPS Location Trigger
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            observerCoords = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              source: "GPS Live"
            };
          },
          () => {
            alert("Unable to acquire GPS position. Using default coordinates.");
          }
        );
      }
    });
  }

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
