// --- System Constants ---
const EPOCH_START_UTC = Date.UTC(2026, 0, 1, 0, 0, 0); // Jan 1, 2026 00:00:00 UTC
const PERIHELION_DAY_OF_YEAR = 3;

const HOURS_PER_DAY = 20;
const MINS_PER_HOUR = 72;
const SECS_PER_MIN = 72;
const TOTAL_CUSTOM_SECS_PER_DAY = HOURS_PER_DAY * MINS_PER_HOUR * SECS_PER_MIN; // 103,680 custom secs/day

// Roman numerals for 20 custom hours (0 / 20 at top is XX)
const ROMAN_HOURS = [
  "XX", "I", "II", "III", "IV", "V", 
  "VI", "VII", "VIII", "IX", "X", 
  "XI", "XII", "XIII", "XIV", "XV", 
  "XVI", "XVII", "XVIII", "XIX"
];

// Lunar Phases across 30-day Month
const LUNAR_PHASES = [
  "🌑 New Moon", "🌒 Waxing Crescent", "🌓 First Quarter", 
  "🌔 Waxing Gibbous", "🌕 Full Moon", "🌖 Waning Gibbous", 
  "🌗 Last Quarter", "🌘 Waning Crescent"
];

function getDynamicParameters(now) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = (now - startOfYear) / 86400000;
  
  const nuRad = ((dayOfYear - PERIHELION_DAY_OF_YEAR) / 365.25) * 2 * Math.PI;
  const nuDeg = ((nuRad * 180 / Math.PI) + 360) % 360;

  const e_0 = 0.0167086;
  const t_years = (now.getTime() - EPOCH_START_UTC) / (365.25 * 86400000 * 1000);
  const e = e_0 + 0.00005 * Math.cos(2 * Math.PI * t_years / 11.86);

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
      const remainingDeg = event.deg - nuDeg;
      return { event: event.name, remainingDeg };
    }
  }
  return { event: "Vernal Equinox", remainingDeg: (360 - nuDeg) + 78.0 };
}

function updateApp() {
  const now = new Date();
  const params = getDynamicParameters(now);

  // --- LOCAL vs UTC TIME HANDLING ---
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

  // 1. Custom Time Calculation
  const customSecRatio = TOTAL_CUSTOM_SECS_PER_DAY / 86400;
  const secondsToday = (elapsedSISecondsToday * customSecRatio) / (params.x_len / params.y0);

  // 2. Calendar Math
  const elapsedSISecondsEpoch = (now.getTime() - EPOCH_START_UTC) / 1000;
  const totalCustomSeconds = elapsedSISecondsEpoch / params.x_len;
  const totalDays = Math.floor(totalCustomSeconds / TOTAL_CUSTOM_SECS_PER_DAY);
  const year = Math.floor(totalDays / 360) + 1;
  const dayOfYear360 = ((totalDays % 360) + 360) % 360;
  const month = Math.floor(dayOfYear360 / 30) + 1;
  const day = (dayOfYear360 % 30) + 1;

  // 3. Time Breakdown (20h / 72m / 72s)
  const customHours = Math.floor(secondsToday / (MINS_PER_HOUR * SECS_PER_MIN));
  const customMins = Math.floor((secondsToday % (MINS_PER_HOUR * SECS_PER_MIN)) / SECS_PER_MIN);
  const customSecs = Math.floor(secondsToday % SECS_PER_MIN);

  // --- RENDER UI ---
  if (document.getElementById('cal-year')) {
    document.getElementById('cal-year').textContent = year;
    document.getElementById('cal-month').textContent = String(month).padStart(2, '0');
    document.getElementById('cal-day').textContent = String(day).padStart(2, '0');
    renderCalendarGrid(day);
  }

  document.getElementById('custom-time-display').textContent = 
    `${String(customHours).padStart(2, '0')}:${String(customMins).padStart(2, '0')}:${String(customSecs).padStart(2, '0')}`;

  document.getElementById('m-nu').textContent = `${params.nuDeg.toFixed(2)}°`;
  document.getElementById('m-xlen').textContent = `${params.x_len.toFixed(5)} s`;
  document.getElementById('m-e').textContent = params.e.toFixed(6);
  document.getElementById('m-c').textContent = params.c.toFixed(6);

  if (document.getElementById('utc-time')) {
    document.getElementById('utc-time').textContent = timeLabelText;
  }

  const drift = ((params.x_len - params.y0) / params.y0) * 100;
  document.getElementById('drift-rate').textContent = `${drift > 0 ? '+' : ''}${drift.toFixed(3)}%`;

  // Lunar Phase
  const lunarIndex = Math.floor(((day - 1) / 30) * LUNAR_PHASES.length);
  if (document.getElementById('lunar-phase-text')) {
    document.getElementById('lunar-phase-text').textContent = LUNAR_PHASES[lunarIndex];
  }

  // Solstice / Equinox Event
  const astroEvent = getNextAstronomicalEvent(params.nuDeg);
  if (document.getElementById('astro-event-text')) {
    document.getElementById('astro-event-text').textContent = 
      `Next: ${astroEvent.event} (${astroEvent.remainingDeg.toFixed(1)}° away)`;
  }

  // Draw Clock Canvas
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

// Service Worker Registration for PWA / Offline usage
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

updateApp();
