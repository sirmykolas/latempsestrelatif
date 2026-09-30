// Array of Roman numerals for 20 custom hours (0 is XX / 20)
const ROMAN_HOURS = [
  "XX", "I", "II", "III", "IV", "V", 
  "VI", "VII", "VIII", "IX", "X", 
  "XI", "XII", "XIII", "XIV", "XV", 
  "XVI", "XVII", "XVIII", "XIX"
];

function drawAnalogClock(h, m, s) {
  const canvas = document.getElementById('clock-canvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas scale for crisp rendering on high-DPI mobile screens
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== 300 * dpr) {
    canvas.width = 300 * dpr;
    canvas.height = 300 * dpr;
    canvas.style.width = "300px";
    canvas.style.height = "300px";
  }
  
  ctx.save();
  ctx.scale(dpr, dpr);

  const cx = 150;
  const cy = 150;
  const radius = 135;

  ctx.clearRect(0, 0, 300, 300);

  // Outer bezel
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw 72 Sub-ticks for Minutes and Seconds
  for (let i = 0; i < SECS_PER_MIN; i++) {
    const angle = (i / SECS_PER_MIN) * 2 * Math.PI - Math.PI / 2;
    const isHourMark = (i % (SECS_PER_MIN / HOURS_PER_DAY)) === 0; // Tick overlap
    const tickLen = isHourMark ? 6 : 3;
    
    const x1 = cx + Math.cos(angle) * (radius - tickLen);
    const y1 = cy + Math.sin(angle) * (radius - tickLen);
    const x2 = cx + Math.cos(angle) * radius;
    const y2 = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isHourMark ? '#9ca3af' : '#334155';
    ctx.lineWidth = isHourMark ? 1.5 : 1;
    ctx.stroke();
  }

  // Draw 20 Roman Numeral Hour Labels & Major Ticks
  ctx.font = '600 11px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c7d2fe';

  for (let i = 0; i < HOURS_PER_DAY; i++) {
    const angle = (i / HOURS_PER_DAY) * 2 * Math.PI - Math.PI / 2;

    // Major Hour Ticks
    const tx1 = cx + Math.cos(angle) * (radius - 12);
    const ty1 = cy + Math.sin(angle) * (radius - 12);
    const tx2 = cx + Math.cos(angle) * radius;
    const ty2 = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Roman Numeral Placement
    const numRadius = radius - 24;
    const nx = cx + Math.cos(angle) * numRadius;
    const ny = cy + Math.sin(angle) * numRadius;

    ctx.fillText(ROMAN_HOURS[i], nx, ny);
  }

  // Hand Angles (Scaled to 20h / 72m / 72s)
  const sAngle = (s / SECS_PER_MIN) * 2 * Math.PI - Math.PI / 2;
  const mAngle = ((m + s / SECS_PER_MIN) / MINS_PER_HOUR) * 2 * Math.PI - Math.PI / 2;
  const hAngle = ((h + m / MINS_PER_HOUR) / HOURS_PER_DAY) * 2 * Math.PI - Math.PI / 2;

  // Draw Hands
  drawHand(ctx, cx, cy, hAngle, radius * 0.45, '#f3f4f6', 4); // Hour hand
  drawHand(ctx, cx, cy, mAngle, radius * 0.65, '#818cf8', 2.5); // Minute hand
  drawHand(ctx, cx, cy, sAngle, radius * 0.80, '#10b981', 1.5); // Second hand

  // Center pin
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
  ctx.fillStyle = '#10b981';
  ctx.fill();

  ctx.restore();
}
