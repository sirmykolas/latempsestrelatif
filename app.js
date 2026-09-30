// --- Earth Solar & Orbital Constants ---
const EARTH = {
  eccentricity: 0.0167086,
  obliquityDeg: 23.44,
  perihelionDay: 3,
  orbitDays: 365.25,
  solDurationSec: 86400,
  epochStartUtc: Date.UTC(2026, 0, 1, 0, 0, 0)
};

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

// Default Observer Coordinates: Vilnius, Lithuania (54.6872° N, 25.2798° E)
let observerCoords = { lat: 54.6872, lon: 25.2798, source: "Vilnius, LT" };

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

function getDynamicParameters(now) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;
  
  const M_rad = ((dayOfYear - EARTH.perihelionDay) / EARTH.orbitDays) * 2 * Math.PI;
  const e = EARTH.eccentricity;
  const E_rad = solveKepler(M_rad, e);

  const tanHalfNu = Math.sqrt((1 + e) / (1 - e)) * Math.tan(E_rad / 2);
  let nuRad = 2 * Math.atan(tanHalfNu);
  if (nuRad < 0) nuRad += 2 * Math.PI;
  const nuDeg = (nuRad * 180 / Math.PI) % 360;

  const obliquityRad = EARTH.obliquityDeg * (Math.PI / 180);
  const c = e * Math.cos(obliquityRad);

  const totalSiYear = EARTH.orbitDays * EARTH.solDurationSec;
  const totalCustomUnitsYear = 360 * BASE_UNITS_PER_DAY;
  const y0 = totalSiYear / totalCustomUnitsYear; 

  const x_len = y0 * (1 + c * Math.cos(nuRad)) / Math.pow(1 + e * Math.cos(nuRad), 2);

  return { nuDeg, e, c, x_len, y0, obliquityDeg: EARTH.obliquityDeg };
}

// --- Geolocational Horizon Engine ---
function calculateSolarPosition(now, lat, lon) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;

  const declinationRad = 23.44 * (Math.PI / 180) * Math.sin((2 * Math.PI / 365.25) * (dayOfYear - 81));
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lst = (utcHours * 15 + lon) % 360; 
  const hourAngleRad = (lst - 180) * (Math.PI / 180);

  const latRad = lat * (Math.PI / 180);

  const sinEl = Math.sin(declinationRad) * Math.sin(latRad) + 
                Math.cos(declinationRad) * Math.cos(latRad) * Math.cos(hourAngleRad);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) * (180 / Math.PI);

  const cosAz = (Math.sin(declinationRad) - Math.sin(latRad) * sinEl) / 
                (Math.cos(latRad) * Math.cos(Math.asin(sinEl)));
  let azimuthDeg = Math.acos(Math.max(-1, Math.min(1, cosAz))) * (180 / Math.PI);
  if (Math.sin(hourAngleRad) > 0) azimuthDeg = 360 - azimuthDeg;

  return { elevationDeg, azimuthDeg, declinationRad };
}

function calculateSunriseSunset(now, lat, lon) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;
  const declinationRad = 23.44 * (Math.PI / 180) * Math.sin((2 * Math.PI / 365.25) * (dayOfYear - 81));
  const latRad = lat * (Math.PI / 180);

  const h0 = -0.833 * (Math.PI / 180);
  const cosH = (Math.sin(h0) - Math.sin(latRad) * Math.sin(declinationRad)) / 
               (Math.cos(latRad) * Math.cos(declinationRad));

  if (cosH > 1) return { sunrise: "Polar Night", sunset: "Polar Night", noon: "12:00:00" };
  if (cosH < -1) return { sunrise: "Midnight Sun", sunset: "Midnight Sun", noon: "12:00:00" };

  const hourAngleDeg = Math.acos(cosH) * (180 / Math.PI);
  const hourAngleHours = hourAngleDeg / 15;

  const tzOffsetHours = -now.getTimezoneOffset() / 60;
  const solarNoonUtc = 12 - (lon / 15);
  let solarNoonLocal = solarNoonUtc + tzOffsetHours;
  if (solarNoonLocal < 0) solarNoonLocal += 24;
  if (solarNoonLocal >= 24) solarNoonLocal -= 24;

  const sunriseLocalHours = solarNoonLocal - hourAngleHours;
  const sunsetLocalHours = solarNoonLocal + hourAngleHours;

  function formatDecimalHours(dec) {
    let h = Math.floor(dec);
    let m = Math.floor((dec - h) * 60);
    let s = Math.floor((((dec - h) * 60) - m) * 60);
    if (h < 0) h += 24;
    if (h >= 24) h -= 24;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return {
    sunrise: formatDecimalHours(sunriseLocalHours).substring(0, 5),
    sunset: formatDecimalHours(sunsetLocalHours).substring(0, 5),
    noon: formatDecimalHours(solarNoonLocal)
  };
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateApp() {
  const now = new Date();
  const params = getDynamicParameters(now);

  const startOfLocalToday = new Date(
    now.getFullYear(), 
    now.getMonth(), 
    now.getDate(), 
    0, 0, 0, 0
  ).getTime();

  const elapsedSISecondsToday = (now.getTime() - startOfLocalToday) / 1000;

  const localTimeString = now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  });
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";

  const customSecRatio = BASE_UNITS_PER_DAY / EARTH.solDurationSec;
  const baseUnitsToday = (elapsedSISecondsToday * customSecRatio) / (params.x_len / params.y0);

  // Calendar Breakdown
  const elapsedSISecondsEpoch = (now.getTime() - EARTH.epochStartUtc) / 1000;
  const totalCustomUnits = elapsedSISecondsEpoch / params.x_len;
  const totalDays = Math.floor(totalCustomUnits / BASE_UNITS_PER_DAY);
  const year = Math.floor(totalDays / 360) + 1;
  const dayOfYear360 = ((totalDays % 360) + 360) % 360;
  const month = Math.floor(dayOfYear360 / 30) + 1;
  const day = (dayOfYear360 % 30) + 1;

  // Sub-unit Breakdown
  const totalSubUnitsToday = baseUnitsToday * TIERS_PER_BEAT;
  const arcDegree = Math.floor(baseUnitsToday / (PRIMES_PER_ARC * BEATS_PER_PRIME));
  const primeArc = Math.floor((baseUnitsToday % (PRIMES_PER_ARC * BEATS_PER_PRIME)) / BEATS_PER_PRIME);
  const beatArc = Math.floor(baseUnitsToday % BEATS_PER_PRIME);
  const tierArc = Math.floor(totalSubUnitsToday % TIERS_PER_BEAT);

  // Render UI
  safeSetText('cal-year', year);
  safeSetText('cal-month', String(month).padStart(2, '0'));
  safeSetText('cal-day', String(day).padStart(2, '0'));
  renderCalendarGrid(day);

  safeSetText(
    'custom-time-display', 
    `${String(arcDegree).padStart(2, '0')}° ${String(primeArc).padStart(2, '0')}' ${String(beatArc).padStart(2, '0')}'' ${String(tierArc).padStart(2, '0')}'''`
  );

  const solarPos = calculateSolarPosition(now, observerCoords.lat, observerCoords.lon);
  const sunTimes = calculateSunriseSunset(now, observerCoords.lat, observerCoords.lon);

  safeSetText('geo-coords-text', observerCoords.source);
  safeSetText('geo-sunrise-text', sunTimes.sunrise);
  safeSetText('geo-sunset-text', sunTimes.sunset);
  safeSetText('geo-noon-text', sunTimes.noon);
  safeSetText('geo-elevation-text', `${solarPos.elevationDeg.toFixed(2)}° / ${solarPos.azimuthDeg.toFixed(2)}°`);

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

  safeSetText('m-nu', `${params.nuDeg.toFixed(2)}°`);
  safeSetText('m-xlen', `${params.x_len.toFixed(5)} s`);
  safeSetText('m-e', params.e.toFixed(6));
  safeSetText('m-obliquity', `${params.obliquityDeg.toFixed(2)}°`);

  safeSetText('utc-time', `${localTimeString} (${userTz})`);

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

// --- Minimalist Astronomical Instrument Canvas Clock ---
function drawAnalogClock(arc, prime, beat) {
  const canvas = document.getElementById('clock-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const dpr = window.devicePixelRatio || 1;
  if (!canvas.dataset.scaled) {
    canvas.width = 240 * dpr;
    canvas.height = 240 * dpr;
    canvas.style.width = '240px';
    canvas.style.height = '240px';
    canvas.dataset.scaled = 'true';
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  const cx = 120;
  const cy = 120;
  const radius = 100;

  ctx.clearRect(0, 0, 240, 240);

  // Outer Precision Ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Inner Subtle Ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 16, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 72 Prime Ticks
  for (let i = 0; i < PRIMES_PER_ARC; i++) {
    const angle = (i / PRIMES_PER_ARC) * 2 * Math.PI - Math.PI / 2;
    const isMajor = i % 3.6 < 0.1;
    const tickLen = isMajor ? 6 : 3;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - tickLen), cy + Math.sin(angle) * (radius - tickLen));
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = isMajor ? 'rgba(212, 175, 55, 0.5)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = isMajor ? 1.5 : 0.8;
    ctx.stroke();
  }

  // 20 Primary Celestial Arc Marks (Roman Numerals)
  ctx.font = '500 8px "Cinzel", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#94a3b8';

  for (let i = 0; i < PRIMARY_ARCS; i++) {
    const angle = (i / PRIMARY_ARCS) * 2 * Math.PI - Math.PI / 2;
    const nx = cx + Math.cos(angle) * (radius - 12);
    const ny = cy + Math.sin(angle) * (radius - 12);
    ctx.fillText(ROMAN_ARCS[i], nx, ny);
  }

  // Calculate Hand Angles
  const beatAngle = (beat / BEATS_PER_PRIME) * 2 * Math.PI - Math.PI / 2;
  const primeAngle = ((prime + beat / BEATS_PER_PRIME) / PRIMES_PER_ARC) * 2 * Math.PI - Math.PI / 2;
  const arcAngle = ((arc + prime / PRIMES_PER_ARC) / PRIMARY_ARCS) * 2 * Math.PI - Math.PI / 2;

  // Arc Hand (Main Hour equivalent) - Gold
  drawHand(ctx, cx, cy, arcAngle, radius * 0.48, '#d4af37', 2.5);
  // Prime Hand (Minute equivalent) - Cyan Accent
  drawHand(ctx, cx, cy, primeAngle, radius * 0.68, '#38bdf8', 1.5);
  // Beat Hand (Second equivalent) - Subtle White Needle
  drawHand(ctx, cx, cy, beatAngle, radius * 0.82, 'rgba(255, 255, 255, 0.7)', 1);

  // Center Pivot Glass Stud
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
  ctx.fillStyle = '#d4af37';
  ctx.fill();

  ctx.restore();
}

function drawHand(ctx, cx, cy, angle, length, color, width) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// --- GPS Handler ---
document.addEventListener('DOMContentLoaded', () => {
  const gpsBtn = document.getElementById('request-gps-btn');

  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (navigator.geolocation) {
        gpsBtn.textContent = 'Acquiring GPS...';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            observerCoords = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              source: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}° (GPS)`
            };
            gpsBtn.textContent = 'GPS Synchronized';
          },
          () => {
            alert("Unable to acquire GPS position. Retaining Vilnius default.");
            gpsBtn.textContent = 'Calibrate GPS Location';
          }
        );
      }
    });
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

updateApp();
