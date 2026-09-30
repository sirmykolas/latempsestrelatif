// --- System Constants ---
const EPOCH_START_UTC = Date.UTC(2026, 0, 1, 0, 0, 0); // Jan 1, 2026
const PERIHELION_DAY_OF_YEAR = 3;

const HOURS_PER_DAY = 20;
const MINS_PER_HOUR = 72;
const SECS_PER_MIN = 72;
const TOTAL_CUSTOM_SECS_PER_DAY = HOURS_PER_DAY * MINS_PER_HOUR * SECS_PER_MIN; // 103,680 custom secs/day

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

  // Scaled y0: Maps 360 custom days across 365.25 tropical SI days
  const SI_SECONDS_PER_360_YEAR = 365.25 * 86400;
  const TOTAL_CUSTOM_SECS_PER_YEAR = 360 * TOTAL_CUSTOM_SECS_PER_DAY;
  const y0 = SI_SECONDS_PER_360_YEAR / TOTAL_CUSTOM_SECS_PER_YEAR; 

  const x_len = y0 * (1 + c * Math.cos(nuRad)) / Math.pow(1 + e * Math.cos(nuRad), 2);

  return { nuDeg, e, c, x_len, y0 };
}

function updateApp() {
  const now = new Date();
  const params = getDynamicParameters(now);

  // 1. DAILY CLOCK: Calculated relative to TODAY's UTC Midnight
  const startOfUTCToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedSISecondsToday = (now.getTime() - startOfUTCToday) / 1000;
  
  // Convert 86,400 SI daily seconds into 103,680 custom daily seconds modulated by x
  const customSecRatio = TOTAL_CUSTOM_SECS_PER_DAY / 86400;
  const secondsToday = (elapsedSISecondsToday * customSecRatio) / (params.x_len / params.y0);

  // 2. CALENDAR MATH: Days passed since Jan 1, 2026 Epoch
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

  // Render UI
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

  document.getElementById('utc-time').textContent = now.toUTCString().split(' ')[4] + ' UTC';
  const drift = ((params.x_len - params.y0) / params.y0) * 100;
  document.getElementById('drift-rate').textContent = `${drift > 0 ? '+' : ''}${drift.toFixed(3)}%`;

  drawAnalogClock(customHours, customMins, customSecs);

  requestAnimationFrame(updateApp);
}

let lastActiveDay = -1;
function renderCalendarGrid(currentDay) {
  if (lastActiveDay === currentDay) return;
  lastActiveDay = currentDay;

  const grid = document.getElementById('calendar-days');
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
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = cx - 10;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 3;
  ctx.stroke();

  for (let i = 0; i < HOURS_PER_DAY; i++) {
    const angle = (i / HOURS_PER_DAY) * 2 * Math.PI - Math.PI / 2;
    const tx1 = cx + Math.cos(angle) * (radius - 8);
    const ty1 = cy + Math.sin(angle) * (radius - 8);
    const tx2 = cx + Math.cos(angle) * radius;
    const ty2 = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const sAngle = (s / SECS_PER_MIN) * 2 * Math.PI - Math.PI / 2;
  const mAngle = ((m + s / SECS_PER_MIN) / MINS_PER_HOUR) * 2 * Math.PI - Math.PI / 2;
  const hAngle = ((h + m / MINS_PER_HOUR) / HOURS_PER_DAY) * 2 * Math.PI - Math.PI / 2;

  drawHand(ctx, cx, cy, hAngle, radius * 0.5, '#f3f4f6', 5);
  drawHand(ctx, cx, cy, mAngle, radius * 0.7, '#818cf8', 3);
  drawHand(ctx, cx, cy, sAngle, radius * 0.85, '#10b981', 1.5);
}

function drawHand(ctx, cx, cy, angle, length, color, width) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

updateApp();
