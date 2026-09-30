function updateApp() {
  const now = new Date();
  
  // 1. Get SI seconds passed since 00:00:00 UTC TODAY
  const startOfUTCToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedSISecondsToday = (now.getTime() - startOfUTCToday) / 1000;

  const params = getDynamicParameters(now);

  // 2. Synchronize day scale so custom 00:00:00 matches UTC 00:00:00
  // Base daily conversion: 86,400 SI sec -> 103,680 Custom sec
  const customSecRatio = TOTAL_CUSTOM_SECS_PER_DAY / 86400; 
  
  // Scale by dynamic second modulation x(ν)
  const secondsToday = (elapsedSISecondsToday * customSecRatio) / (params.x_len / params.y0);

  // 3. Calendar Math (Days passed since Jan 1, 2026 Epoch)
  const elapsedSISecondsEpoch = (now.getTime() - EPOCH_START_UTC) / 1000;
  const totalCustomSeconds = elapsedSISecondsEpoch / params.x_len;
  const totalDays = Math.floor(totalCustomSeconds / TOTAL_CUSTOM_SECS_PER_DAY);
  const year = Math.floor(totalDays / 360) + 1;
  const dayOfYear360 = ((totalDays % 360) + 360) % 360;
  const month = Math.floor(dayOfYear360 / 30) + 1;
  const day = (dayOfYear360 % 30) + 1;

  // 4. Time Breakdown (20h / 72m / 72s)
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
