/**
 * Le Temps Céleste Relatif
 * Direct Solar Longitude Arc Rendering (360° celestial coordinate)
 */

const RAD = Math.PI / 180;

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

// Convert Solar Longitude to Arc Degrees, Minutes, Seconds
function getArcTime(longitude) {
  const deg = Math.floor(longitude);
  const minFull = (longitude - deg) * 60;
  const min = Math.floor(minFull);
  const sec = Math.floor((minFull - min) * 60);

  return { deg, min, sec };
}

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('clockCanvas');
  const ctx = canvas.getContext('2d');

  const elDigitalTime = document.getElementById('digitalTime');
  const elSunLong     = document.getElementById('sunLong');
  const elVsopCorr    = document.getElementById('vsopCorr');
  const elPrecNutCorr = document.getElementById('precNutCorr');
  const elDeltaTVal   = document.getElementById('deltaTVal');
  const elStepScale   = document.getElementById('stepScale');
  const btnTheme      = document.getElementById('themeToggle');

  function update() {
    const now = new Date();
    const solar = getAbsoluteSolarCoordinates(now);
    const arc = getArcTime(solar.apparentLongitude);

    const fmt = (n) => n.toString().padStart(2, '0');
    elDigitalTime.textContent = `${fmt(arc.deg)}° ${fmt(arc.min)}′ ${fmt(arc.sec)}″`;

    elSunLong.textContent = `${solar.apparentLongitude.toFixed(4)}°`;
    elVsopCorr.textContent = `${(solar.vsopPerturbation * 3600).toFixed(2)}″`;
    elPrecNutCorr.textContent = `${(solar.precNutCorrection * 3600).toFixed(2)}″`;
    elDeltaTVal.textContent = `${solar.deltaT.toFixed(2)} s`;
    elStepScale.textContent = `${solar.instantaneousVelocityScale.toFixed(6)}x`;

    drawClock(ctx, canvas.width, canvas.height, solar.apparentLongitude);
  }

  function drawClock(ctx, width, height, longitude) {
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

    // Arc Progress
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + ((longitude / 360) * 2 * Math.PI);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Node
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

  const themes = ['dark', 'daylight', 'twilight'];
  let currentThemeIdx = 0;

  btnTheme.addEventListener('click', () => {
    currentThemeIdx = (currentThemeIdx + 1) % themes.length;
    document.documentElement.setAttribute('data-theme', themes[currentThemeIdx]);
    update();
  });

  // Safe Start
  update();
  setInterval(update, 1000);
});
