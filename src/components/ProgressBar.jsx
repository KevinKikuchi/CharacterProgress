import { motion } from 'framer-motion';

const ProgressBar = ({ value = 0, size = 160, strokeWidth = 8, label, showPercent = true }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  const getGradientColor = () => {
    if (clamped < 33) return { start: '#9d50bb', end: '#00f2ff' };
    if (clamped < 66) return { start: '#00f2ff', end: '#ffcc33' };
    return { start: '#ffcc33', end: '#00ff88' };
  };

  const grad = getGradientColor();

  const getGlow = () => {
    if (clamped >= 90) return '0 0 30px rgba(0, 255, 136, 0.3), 0 0 60px rgba(0, 255, 136, 0.1)';
    if (clamped >= 66) return '0 0 20px rgba(255, 204, 51, 0.2)';
    if (clamped >= 33) return '0 0 15px rgba(0, 242, 255, 0.15)';
    return '0 0 10px rgba(157, 80, 187, 0.1)';
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={`grad-${clamped}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={grad.start} />
            <stop offset="100%" stopColor={grad.end} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#grad-${clamped})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(${getGlow()})` }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {showPercent && (
          <motion.span
            style={{
              fontSize: size * 0.22,
              fontWeight: 800,
              background: `linear-gradient(135deg, ${grad.start}, ${grad.end})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            {clamped.toFixed(4)}%
          </motion.span>
        )}
        {label && (
          <span style={{ fontSize: size * 0.09, color: 'var(--text-muted)', marginTop: 2 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

const LinearProgressBar = ({ value = 0, height = 10, showPercent = true, label }) => {
  const clamped = Math.min(100, Math.max(0, value));

  const getGradientColor = () => {
    if (clamped < 33) return 'linear-gradient(90deg, #9d50bb, #00f2ff)';
    if (clamped < 66) return 'linear-gradient(90deg, #00f2ff, #ffcc33)';
    return 'linear-gradient(90deg, #ffcc33, #00ff88)';
  };

  return (
    <div style={{ width: '100%' }}>
      {(label || showPercent) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          {label && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>}
          {showPercent && (
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
{clamped.toFixed(4)}%
            </span>
          )}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: height / 2,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: height / 2,
            background: getGradientColor(),
            boxShadow: clamped >= 90 ? '0 0 20px rgba(0, 255, 136, 0.3)' : 'none',
            transition: 'width 1s ease-in-out',
          }}
        />
      </div>
    </div>
  );
};

export { ProgressBar as default, LinearProgressBar };
