export function expForLevel(level) {
  if (level <= 0) return 0;
  if (level === 1) return 0;
  return Math.floor((Math.pow(level, 3) + 5 * level * level + 10) * 15);
}

export function cumulativeExp(level) {
  let total = 0;
  for (let i = 1; i <= level; i++) {
    total += expForLevel(i);
  }
  return total;
}

export function expForRange(fromLevel, fromPercent, toLevel, toPercent) {
  const totalExpStart = cumulativeExp(fromLevel - 1) + (expForLevel(fromLevel) * fromPercent) / 100;
  const totalExpEnd = cumulativeExp(toLevel - 1) + (expForLevel(toLevel) * toPercent) / 100;
  return Math.max(0, totalExpEnd - totalExpStart);
}

export function progressToTarget(currentLevel, currentExpPercent, targetLevel, startLevel = null, startExp = 0) {
  const fromLevel = startLevel ?? currentLevel;
  const fromExp = startLevel !== null ? startExp : 0;

  const startTotal = cumulativeExp(fromLevel - 1) + (expForLevel(fromLevel) * fromExp) / 100;
  const currentTotal = cumulativeExp(currentLevel - 1) + (expForLevel(currentLevel) * currentExpPercent) / 100;
  const targetTotal = cumulativeExp(targetLevel - 1);

  const totalRange = Math.max(1, targetTotal - startTotal);
  const done = Math.max(0, currentTotal - startTotal);
  const overallPercent = (done / totalRange) * 100;

  return {
    currentTotalExp: Math.floor(currentTotal),
    targetTotalExp: Math.floor(targetTotal),
    expNeeded: Math.floor(Math.max(0, targetTotal - currentTotal)),
    overallPercent: Math.min(100, Math.max(0, overallPercent)),
  };
}

export function estimateEta(expGained, timeElapsedMs, expRemaining) {
  if (expGained <= 0 || timeElapsedMs <= 0) return null;
  const ratePerHour = (expGained / timeElapsedMs) * 3600000;
  if (ratePerHour <= 0) return null;
  const hoursRemaining = expRemaining / ratePerHour;
  return {
    ratePerHour: Math.floor(ratePerHour),
    hoursRemaining,
    formatted: formatDuration(hoursRemaining),
  };
}

function formatDuration(hours) {
  if (hours < 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

export function getLevelColor(level) {
  if (level <= 15) return 'var(--text-muted)';
  if (level <= 30) return 'var(--accent-teal)';
  if (level <= 45) return 'var(--accent-purple)';
  if (level <= 60) return 'var(--accent-gold)';
  if (level <= 80) return 'var(--success)';
  return 'var(--accent-gold)';
}

export function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':');
}

export function expPercentGained(fromLevel, fromPercent, toLevel, toPercent) {
  if (fromLevel === toLevel) {
    return toPercent - fromPercent;
  }
  let total = (100 - fromPercent) + toPercent;
  for (let l = fromLevel + 1; l < toLevel; l++) {
    total += 100;
  }
  return total;
}

export function getServiceDay(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}
