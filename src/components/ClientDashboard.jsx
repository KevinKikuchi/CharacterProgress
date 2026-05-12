import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock, TrendingUp, Target, LogOut,
  Image as ImageIcon, Sun, Zap, BarChart3,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { LinearProgressBar } from './ProgressBar';
import {
  progressToTarget, expForRange, expPercentGained, getLevelColor,
  formatTimer, getServiceDay,
} from '../lib/expCalculator';

const ClientDashboard = ({ user, onLogout }) => {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const [tick, setTick] = useState(0);
  const [animatedExp, setAnimatedExp] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  const timerRef = useRef(null);
  const prevLevelRef = useRef(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('gcash');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const startLog = [...logs]
    .filter((l) => l.log_type === 'start')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const endLog = logs.find((l) => l.log_type === 'end');
  const updateLogs = logs
    .filter((l) => (l.log_type === 'update' || l.log_type === 'end') &&
      (!startLog || new Date(l.created_at) > new Date(startLog.created_at)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const latestUpdate = updateLogs[0] || startLog;

  const displayLevel = latestUpdate?.level ?? startLog?.level ?? activeSession?.start_level ?? 1;
  const rawExp = latestUpdate != null ? parseFloat(latestUpdate.exp_percent)
    : startLog != null ? parseFloat(startLog.exp_percent)
      : 0;
  const levelColor = getLevelColor(displayLevel);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedExp(rawExp), 300);
    return () => clearTimeout(timer);
  }, [rawExp]);

  useEffect(() => {
    if (prevLevelRef.current !== null && displayLevel > prevLevelRef.current) {
      setLevelUp(true);
      setTimeout(() => setLevelUp(false), 2000);
    }
    prevLevelRef.current = displayLevel;
  }, [displayLevel]);

  const calcElapsed = useCallback(() => {
    if (!activeSession) return 0;
    if (activeSession.status === 'completed') return 0;
    let total = activeSession.total_active_seconds || 0;
    if (activeSession.timer_status === 'running' && activeSession.timer_started_at) {
      total += Math.floor((Date.now() - new Date(activeSession.timer_started_at).getTime()) / 1000);
    }
    return total;
  }, [activeSession]);

  useEffect(() => {
    if (activeSession?.timer_status === 'running') {
      timerRef.current = setInterval(() => {
        setTimerDisplay(formatTimer(calcElapsed()));
      }, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
      setTimerDisplay(formatTimer(calcElapsed()));
    }
  }, [activeSession?.timer_status, activeSession?.timer_started_at, activeSession?.total_active_seconds, calcElapsed]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (!activeSession?.id) return;

    loadLogs(activeSession.id);
    loadPaymentHistory(activeSession.id);

    const channel = supabase
      .channel(`client-${activeSession.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'progress_logs', filter: `session_id=eq.${activeSession.id}` },
        (payload) => {
          console.log('log change:', payload);
          loadLogs(activeSession.id);
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${activeSession.id}` },
        (payload) => {
          console.log('session change:', payload);
          loadSessions();
          loadPaymentHistory(activeSession.id);
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_history', filter: `session_id=eq.${activeSession.id}` },
        () => {
          loadPaymentHistory(activeSession.id);
          loadSessions();
        }
      )
      .subscribe((status) => {
        console.log('realtime status:', status);
      });

    const pollInterval = setInterval(() => {
      loadSessions();
      loadPaymentHistory(activeSession.id);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [activeSession?.id, activeSession?.start_level, activeSession?.target_level, activeSession?.current_day, activeSession?.status]);

  const loadSessions = async () => {
    const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: false });
    if (data?.length) {
      setSessions(data);
      if (!activeSessionId) setActiveSessionId(data[0].id);
    }
  };

  const loadLogs = async (sessionId) => {
    const { data } = await supabase
      .from('progress_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (data) setLogs(data);
  };

  const loadPaymentHistory = async (sessionId) => {
    const { data } = await supabase
      .from('payment_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('confirmed_at', { ascending: false });
    if (data) setPaymentHistory(data);
  };

  const handleMarkAsPaid = async () => {
    if (!paymentRef.trim() || !activeSession) return;
    setSubmittingPayment(true);

    const { error } = await supabase.from('sessions').update({
      payment_status: 'paid',
      payment_reference: paymentRef,
      payment_method: paymentMethod,
    }).eq('id', activeSession.id);

    if (!error) {
      setPaymentRef('');
      await loadSessions();
      await loadPaymentHistory(activeSession.id);
    }

    setSubmittingPayment(false);
  };

  const todayStartLevel = startLog?.level ?? activeSession?.start_level ?? 1;
  const todayStartExp = startLog ? parseFloat(startLog.exp_percent) : 0;

  const progress = activeSession
    ? progressToTarget(displayLevel, animatedExp, activeSession.target_level, todayStartLevel, todayStartExp)
    : null;

  const todayGain = () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayLogs = logs.filter((l) => new Date(l.created_at) >= todayStart)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (todayLogs.length < 2) return null;
    const first = todayLogs[0];
    const last = todayLogs[todayLogs.length - 1];
    const raw = expForRange(first.level, parseFloat(first.exp_percent), last.level, parseFloat(last.exp_percent));
    const pct = expPercentGained(first.level, parseFloat(first.exp_percent), last.level, parseFloat(last.exp_percent));
    return { raw, pct };
  };

  const gainToday = todayGain();

  const serviceDay = activeSession ? getServiceDay(activeSession.created_at) : 1;

  const totalExp = startLog && latestUpdate
    ? {
      raw: expForRange(startLog.level, parseFloat(startLog.exp_percent), latestUpdate.level, parseFloat(latestUpdate.exp_percent)),
      pct: expPercentGained(startLog.level, parseFloat(startLog.exp_percent), latestUpdate.level, parseFloat(latestUpdate.exp_percent)),
    }
    : null;

  const elapsedSeconds = activeSession
    ? (activeSession.total_active_seconds || 0) +
    (activeSession.timer_status === 'running' && activeSession.timer_started_at
      ? Math.floor((Date.now() - new Date(activeSession.timer_started_at)) / 1000)
      : 0)
    : 0;

  const calcExpRate = (logs, totalSeconds) => {
    if (totalSeconds < 60) return null;
    const sorted = [...logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalPct = expPercentGained(
      first.level, parseFloat(first.exp_percent),
      last.level, parseFloat(last.exp_percent)
    );
    const hours = totalSeconds / 3600;
    return totalPct / hours;
  };

  const expPerHour = logs.length >= 2 ? calcExpRate(logs, elapsedSeconds) : null;

  const chartData = [...logs]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((l) => ({
      time: new Date(l.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      pct: startLog ? parseFloat(expPercentGained(
        startLog.level, parseFloat(startLog.exp_percent),
        l.level, parseFloat(l.exp_percent)
      ).toFixed(2)) : 0,
      label: `Lv.${l.level} @ ${parseFloat(l.exp_percent).toFixed(2)}%`,
    }));

  const [dailyGoal, setDailyGoal] = useState(() => {
    return parseFloat(localStorage.getItem('dailyGoal') || '5');
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const dailyProgress = gainToday ? Math.min((gainToday.pct / dailyGoal) * 100, 100) : 0;
  const goalMet = gainToday?.pct >= dailyGoal;

  const saveGoal = () => {
    const val = parseFloat(goalInput);
    if (!val || val <= 0) return;
    setDailyGoal(val);
    localStorage.setItem('dailyGoal', val);
    setEditingGoal(false);
  };

  const timerActive = activeSession?.timer_status === 'running';

  const timeAgo = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const CURRENCIES = [
    { code: 'PHP', symbol: '₱' },
    { code: 'USD', symbol: '$' },
    { code: 'EUR', symbol: '€' },
    { code: 'GBP', symbol: '£' },
    { code: 'JPY', symbol: '¥' },
    { code: 'SGD', symbol: 'S$' },
    { code: 'AUD', symbol: 'A$' },
  ];
  const getCurrencySymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || '₱';

  return (
    <div className="dashboard-container">
      <div className="dashboard-header glass animate-fade-in">
        <h1><span className="gradient-text">Character Progress</span></h1>
        <div className="user-info">
          <div className="user-avatar">C</div>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{user.user}</span>
          <button onClick={onLogout} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {!activeSession && (
        <div className="empty-state animate-fade-in-up" style={{ marginTop: 60 }}>
          <Target size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3>No Active Sessions</h3>
          <p>Your pilot has not created any sessions yet. Check back soon!</p>
        </div>
      )}

      {activeSession && (
        <>
          {sessions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              {sessions.map((s) => (
                <button key={s.id} onClick={() => setActiveSessionId(s.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${s.id === activeSessionId ? 'var(--accent-teal)' : 'var(--glass-border)'}`,
                    background: s.id === activeSessionId ? 'rgba(0,242,255,0.08)' : 'transparent',
                    color: s.id === activeSessionId ? 'var(--accent-teal)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'var(--font-family)',
                    transition: 'all 0.2s',
                  }}
                >
                  {s.character_name}
                  <span style={{
                    display: 'inline-block',
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: s.status === 'active' ? 'var(--success)' : 'var(--text-dim)',
                    marginLeft: 6,
                    verticalAlign: 'middle',
                  }} />
                </button>
              ))}
            </div>
          )}

          <motion.div className="glass hero-section animate-fade-in-up" key={activeSession.id}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="level-label">{activeSession.character_name}</div>
            <div className={`level-display ${levelUp ? 'level-up-flash' : ''}`} style={{ color: levelColor }}>{displayLevel}</div>

            <div style={{ maxWidth: 400, margin: '1.5rem auto' }}>
              <LinearProgressBar value={animatedExp} height={16} label={`Lv.${displayLevel} EXP`} />
            </div>

            <div className="stats-row">
              <div className="glass stat-card">
                <div className="stat-value" style={{ color: 'var(--accent-teal)' }}>
                  Lv.{activeSession.target_level}
                </div>
                <div className="stat-label">Target Level</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-value" style={{ color: progress ? 'var(--accent-gold)' : 'var(--text-dim)' }}>
                  {progress ? `${Math.round(progress.overallPercent)}%` : '—'}
                </div>
                <div className="stat-label">Today's Progress</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-value" style={{ color: timerActive ? 'var(--success)' : 'var(--text-muted)' }}>
                  {timerDisplay}
                </div>
                <div className="stat-label">
                  {timerActive ? 'Active' : activeSession.timer_status === 'paused' ? 'Paused' : activeSession.status === 'completed' ? 'Completed' : 'Total Time'}
                </div>
              </div>
              {expPerHour !== null && (
                <div className="glass stat-card">
                  <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                    {expPerHour.toFixed(2)}%
                  </div>
                  <div className="stat-label">EXP / Hour</div>
                </div>
              )}
            </div>
          </motion.div>

          <div className="session-grid">
            <motion.div className="glass card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            >
              <h2>
                <Zap size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-gold)' }} />
                Today&apos;s Gain
              </h2>
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                {gainToday !== null ? (
                  <>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--success)' }}>
                      +{gainToday.pct.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      EXP gained today ({gainToday.raw.toLocaleString()} raw EXP)
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                    <p>No updates yet today</p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: 12 }}>
                <div className="quick-stat" style={{ border: 'none', padding: 0 }}>
                  <span className="label">
                    <Sun size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Service Day
                  </span>
                  <span className="value" style={{ color: 'var(--accent-gold)' }}>Day {serviceDay}</span>
                </div>
                <div className="quick-stat" style={{ border: 'none', padding: 0 }}>
                  <span className="label">
                    <BarChart3 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Total Gain
                  </span>
                  <span className="value" style={{ color: 'var(--success)' }}>
                    {totalExp !== null ? `+${totalExp.pct.toFixed(2)}%` : '—'}
                  </span>
                </div>
              </div>
            </motion.div>

            <motion.div className="glass card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>
                  <Target size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-gold)' }} />
                  Daily Goal
                </h2>
                <button className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => { setGoalInput(dailyGoal); setEditingGoal(true); }}>
                  Edit
                </button>
              </div>
              {editingGoal ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="input-field" type="number" min={0.1} step={0.1}
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    style={{ flex: 1 }}
                    placeholder="e.g. 5"
                  />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>%</span>
                  <button className="btn-primary" style={{ padding: '8px 14px' }} onClick={saveGoal}>Save</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                      Target: <strong style={{ color: 'var(--accent-gold)' }}>{dailyGoal}% EXP</strong> today
                    </span>
                    <span style={{ fontSize: '0.85rem', color: goalMet ? 'var(--success)' : 'var(--text-dim)' }}>
                      {gainToday ? `${gainToday.pct.toFixed(2)}%` : '0%'} / {dailyGoal}%
                    </span>
                  </div>
                  <div style={{ background: 'var(--glass-border)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${dailyProgress}%`,
                      background: goalMet
                        ? 'linear-gradient(90deg, var(--success), var(--accent-teal))'
                        : 'linear-gradient(90deg, var(--accent-purple), var(--accent-teal))',
                      borderRadius: 99,
                      transition: 'width 1s ease-in-out',
                    }} />
                  </div>
                  <div style={{ marginTop: 10, textAlign: 'center', fontSize: '0.85rem' }}>
                    {goalMet ? (
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>Daily goal reached!</span>
                    ) : gainToday ? (
                      <span style={{ color: 'var(--text-dim)' }}>
                        {(dailyGoal - gainToday.pct).toFixed(2)}% more to reach your goal
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>No EXP gained yet today</span>
                    )}
                  </div>
                </>
              )}
            </motion.div>

            {!activeSession?.payment_requested && paymentHistory.length > 0 && (
              <motion.div className="glass card"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23 }}
              >
                <h2>💰 Payment History</h2>
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 10,
                  maxHeight: 320, overflowY: 'auto', paddingRight: 4,
                }}>
                  {paymentHistory.map((p, i) => {
                    const symbol = getCurrencySymbol(p.currency);
                    return (
                      <div key={p.id} className="glass" style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
                            Payment #{paymentHistory.length - i}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            {new Date(p.confirmed_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div style={{
                          background: 'rgba(0,242,255,0.04)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '8px 12px',
                          marginBottom: 10,
                          fontSize: '0.8rem',
                          color: 'var(--text-dim)',
                        }}>
                          <div style={{ marginBottom: 4, color: 'var(--text-muted)', fontWeight: 600 }}>Period Covered</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{new Date(p.confirmed_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</span>
                            <span style={{ color: 'var(--accent-purple)' }}>{p.hours.toFixed(2)} hrs total</span>
                          </div>
                        </div>

                        <div className="quick-stat">
                          <span className="label">Hourly Rate</span>
                          <span className="value" style={{ color: 'var(--accent-teal)' }}>
                            {symbol}{p.hourly_rate}/hr
                          </span>
                        </div>
                        <div className="quick-stat">
                          <span className="label">Total Hours</span>
                          <span className="value" style={{ color: 'var(--accent-purple)' }}>
                            {p.hours.toFixed(2)} hrs
                          </span>
                        </div>
                        <div className="quick-stat" style={{ marginTop: 4 }}>
                          <span className="label" style={{ fontWeight: 700 }}>Amount Paid</span>
                          <span className="value" style={{ color: 'var(--success)', fontSize: '1.1rem', fontWeight: 900 }}>
                            {symbol}{p.amount.toFixed(2)}
                          </span>
                        </div>

                        <div style={{
                          marginTop: 8,
                          fontSize: '0.75rem',
                          color: 'var(--text-dim)',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}>
                          <span>{p.payment_method?.toUpperCase()} — Ref: {p.payment_reference}</span>
                          <span style={{
                            color: 'var(--success)',
                            background: 'rgba(0,255,136,0.08)',
                            padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                          }}>✓ Confirmed</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  marginTop: 12, padding: '10px 14px',
                  background: 'rgba(0,242,255,0.04)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Total Paid</span>
                  <span style={{ fontWeight: 900, color: 'var(--accent-gold)', fontSize: '1.1rem' }}>
                    {getCurrencySymbol(paymentHistory[0]?.currency)}
                    {paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}
                  </span>
                </div>
              </motion.div>
            )}

            {activeSession?.payment_requested && (
              <motion.div className="glass card"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}
              >
                <h2>💰 Payment</h2>

                {(() => {
                  const rate = activeSession?.hourly_rate || 0;
                  const totalSecs = activeSession?.total_billed_seconds || activeSession?.total_active_seconds || 0;
                  const hrsToday = totalSecs / 3600;
                  const amountDue = hrsToday * rate;

                  return (
                    <>
                      <div style={{
                        background: 'rgba(0,242,255,0.04)', border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16
                      }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 8 }}>Rate Breakdown</div>
                        <div className="quick-stat">
                          <span className="label">Hourly Rate</span>
                          <span className="value" style={{ color: 'var(--accent-teal)' }}>
                            {getCurrencySymbol(activeSession?.currency)}{rate.toFixed(2)}/hr
                          </span>
                        </div>
                        <div className="quick-stat">
                          <span className="label">Hours Worked</span>
                          <span className="value" style={{ color: 'var(--accent-purple)' }}>
                            {(() => { const h = Math.floor(totalSecs / 3600); const m = Math.floor((totalSecs % 3600) / 60); return `${h}h ${m}m`; })()}
                          </span>
                        </div>
                        <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 8, paddingTop: 8 }}>
                          <div className="quick-stat">
                            <span className="label">Total Payment</span>
                            <span className="value" style={{ color: 'var(--accent-gold)', fontSize: '1.3rem', fontWeight: 900 }}>
                              {getCurrencySymbol(activeSession?.currency)}{amountDue.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="quick-stat" style={{ marginBottom: 12 }}>
                        <span className="label">Status</span>
                        <span style={{
                          color: activeSession?.payment_status === 'paid' ? 'var(--accent-gold)' : 'var(--danger)',
                          fontWeight: 700
                        }}>
                          {activeSession?.payment_status === 'paid' ? '⏳ Awaiting Confirmation' : '❌ Unpaid'}
                        </span>
                      </div>
                    </>
                  );
                })()}

                {(!activeSession?.payment_status || activeSession?.payment_status === 'unpaid') && (
                  <>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                      {activeSession?.gcash_number && (
                        <div className="glass" style={{ flex: 1, padding: 12, borderRadius: 'var(--radius-sm)', minWidth: 140 }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>GCash</div>
                          <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: '1.1rem' }}>
                            {activeSession?.gcash_number}
                          </div>
                          {activeSession?.pilot_name && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 2 }}>
                              {activeSession?.pilot_name}
                            </div>
                          )}
                        </div>
                      )}
                      {activeSession?.paypal_email && (
                        <div className="glass" style={{ flex: 1, padding: 12, borderRadius: 'var(--radius-sm)', minWidth: 140 }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>PayPal</div>
                          <div style={{ fontWeight: 700, color: 'var(--accent-teal)', fontSize: '0.95rem' }}>
                            {activeSession?.paypal_email}
                          </div>
                          {activeSession?.pilot_name && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 2 }}>
                              {activeSession?.pilot_name}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                        Payment Method
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {activeSession?.gcash_number && (
                          <button type="button"
                            onClick={() => { setPaymentMethod('gcash'); window.open('https://gcash.com', '_blank'); }}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                              border: `1px solid ${paymentMethod === 'gcash' ? 'var(--success)' : 'var(--glass-border)'}`,
                              background: paymentMethod === 'gcash' ? 'rgba(0,255,136,0.08)' : 'transparent',
                              color: paymentMethod === 'gcash' ? 'var(--success)' : 'var(--text-muted)',
                              fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.85rem',
                            }}>GCash</button>
                        )}
                        {activeSession?.paypal_email && (
                          <button type="button"
                            onClick={() => { setPaymentMethod('paypal'); window.open('https://paypal.com', '_blank'); }}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                              border: `1px solid ${paymentMethod === 'paypal' ? 'var(--accent-teal)' : 'var(--glass-border)'}`,
                              background: paymentMethod === 'paypal' ? 'rgba(0,242,255,0.08)' : 'transparent',
                              color: paymentMethod === 'paypal' ? 'var(--accent-teal)' : 'var(--text-muted)',
                              fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.85rem',
                            }}>PayPal</button>
                        )}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Reference Number</label>
                      <input className="input-field" placeholder="Enter GCash/PayPal reference #"
                        value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                    </div>
                    <button type="button" className="btn-primary"
                      style={{
                        width: '100%',
                        opacity: (submittingPayment || !paymentRef.trim()) ? 0.4 : 1,
                        cursor: (submittingPayment || !paymentRef.trim()) ? 'not-allowed' : 'pointer',
                      }}
                      disabled={submittingPayment || !paymentRef.trim()}
                      onClick={handleMarkAsPaid}>
                      {submittingPayment ? 'Submitting...' : !paymentRef.trim() ? 'Enter Reference # First' : 'Mark as Paid'}
                    </button>
                  </>
                )}

                {activeSession?.payment_status === 'paid' && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
                    <div style={{ color: 'var(--success)', fontWeight: 900, fontSize: '1.1rem', marginBottom: 4 }}>
                      Successfully Paid!
                    </div>
                    {(() => {
                      const totalSecs = activeSession?.total_billed_seconds || activeSession?.total_active_seconds || 0;
                      const hrsToday = (totalSecs / 3600).toFixed(2);
                      const rate = activeSession?.hourly_rate || 0;
                      const amountDue = (totalSecs / 3600 * rate).toFixed(2);
                      const symbol = getCurrencySymbol(activeSession?.currency);
                      return (
                        <>
                          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent-gold)', marginBottom: 8 }}>
                            {symbol}{amountDue}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                            {hrsToday} hrs × {symbol}{rate}/hr
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 2 }}>
                            via <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                              {activeSession?.payment_method?.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            Ref: <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                              {activeSession?.payment_reference}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--accent-teal)', marginTop: 12, opacity: 0.8 }}>
                            Waiting for pilot to confirm...
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

              </motion.div>
            )}

            <motion.div className="glass card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            >
              <h2>
                <TrendingUp size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-teal)' }} />
                Session Details
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="quick-stat">
                  <span className="label">Character</span>
                  <span className="value">{activeSession.character_name}</span>
                </div>
                <div className="quick-stat">
                  <span className="label">Status</span>
                  <span className={`status-badge ${activeSession.status}`}>
                    <span className={`status-indicator ${activeSession.status}`} />{activeSession.status}
                  </span>
                </div>
                <div className="quick-stat">
                  <span className="label">Started</span>
                  <span className="value">
                    {new Date(activeSession.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="quick-stat">
                  <span className="label">Level Range</span>
                  <span className="value">Lv.{activeSession.start_level} &rarr; Lv.{activeSession.target_level}</span>
                </div>
                {latestUpdate && (
                  <>
                    <div className="quick-stat">
                      <span className="label">Last Update</span>
                      <span className="value" style={{ fontSize: '0.8rem' }}>
                        {timeAgo(latestUpdate.created_at)}
                      </span>
                    </div>
                    <div className="quick-stat">
                      <span className="label">Current Progress</span>
                      <span className="value" style={{ color: 'var(--accent-teal)' }}>
                        Lv.{latestUpdate.level} @ {parseFloat(latestUpdate.exp_percent).toFixed(4)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {chartData.length >= 2 && (
            <motion.div className="glass card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              style={{ marginTop: 24 }}
            >
              <h2>
                <TrendingUp size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-teal)' }} />
                Level/EXP Progress
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <XAxis dataKey="time" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} unit="%" width={45} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(18,18,20,0.9)', border: '1px solid var(--glass-border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                    formatter={(val) => [`+${val}%`, 'EXP Gained']}
                  />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    stroke="var(--accent-teal)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--accent-teal)', r: 4 }}
                    activeDot={{ r: 6, fill: 'var(--accent-gold)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          <motion.div className="glass card" style={{ marginTop: 24 }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          >
            <h2>
              <ImageIcon size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-gold)' }} />
              Proof Gallery
            </h2>
            {logs.filter((l) => l.image_url).length === 0 && (
              <div className="empty-state" style={{ padding: '1rem 0' }}>
                <ImageIcon size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
                <p>No screenshots uploaded yet.</p>
              </div>
            )}
            <div className="proof-gallery">
              {[...logs].reverse().filter((l) => l.image_url).map((log) => (
                <div key={log.id} className="proof-item">
                  <img src={log.image_url} alt={`Lv.${log.level}`}
                    onClick={() => setLightboxImg(log.image_url)} />
                  <div className="proof-meta">
                    <strong>Lv.{log.level}</strong> @ {parseFloat(log.exp_percent).toFixed(2)}%
                    <span className="proof-date">
                      {new Date(log.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div className="glass card" style={{ marginTop: 24 }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          >
            <h2>
              <Clock size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-teal)' }} />
              Session History
            </h2>
            {logs.filter(l => l.log_type === 'start' || l.log_type === 'end').length === 0 ? (
              <div className="empty-state" style={{ padding: '1rem 0' }}>
                <p>No session history yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const startLogs = [...logs].filter(l => l.log_type === 'start').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                  const endLogs = [...logs].filter(l => l.log_type === 'end').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                  return startLogs.map((start, i) => {
                    const end = endLogs[i];
                    const expGained = end ? expPercentGained(start.level, parseFloat(start.exp_percent), end.level, parseFloat(end.exp_percent)) : null;
                    return (
                      <div key={start.id} className="glass" style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
                            Day {i + 1}
                          </span>
                          {end?.paid_at && (
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 700,
                              color: 'var(--danger)',
                              background: 'rgba(255,75,43,0.1)',
                              padding: '2px 8px', borderRadius: 99,
                            }}>✓ Paid</span>
                          )}
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {new Date(start.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem' }}>
                              <span style={{ color: 'var(--text-dim)' }}>Start Level: </span>
                              <span style={{ color: 'var(--text-muted)' }}>Lv.{start.level} @ {parseFloat(start.exp_percent).toFixed(4)}%</span>
                            </span>
                            {end && (
                              <span style={{ fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-dim)' }}>End Level: </span>
                                <span style={{ color: 'var(--text-muted)' }}>Lv.{end.level} @ {parseFloat(end.exp_percent).toFixed(4)}%</span>
                              </span>
                            )}
                            {end && (
                              <span style={{ fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-dim)' }}>EXP Gained: </span>
                                <span style={{ color: 'var(--success)' }}>+{expGained.toFixed(4)}%</span>
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                              🕐 Time In: <span style={{ color: 'var(--text-muted)' }}>
                                {new Date(start.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                {' — '}
                                {new Date(start.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </span>
                            {end ? (
                              <>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                  🕐 Time Out: <span style={{ color: 'var(--text-muted)' }}>
                                    {new Date(end.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — {new Date(end.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                  ⏱ Total: <span style={{ color: 'var(--accent-gold)' }}>
                                    {(() => {
                                      if (end.billed_seconds && end.billed_seconds > 0) {
                                        const h = Math.floor(end.billed_seconds / 3600);
                                        const m = Math.floor((end.billed_seconds % 3600) / 60);
                                        return `${h}h ${m}m`;
                                      }
                                      return null;
                                    })()}
                                  </span>
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: 'var(--accent-teal)' }}>● In progress</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </motion.div>


        </>
      )}

      {lightboxImg && (
        <div className="lightbox" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="Full view" />
        </div>
      )}

      <style>{`
        @keyframes levelUpFlash {
          0%   { text-shadow: 0 0 0px transparent; transform: scale(1); }
          25%  { text-shadow: 0 0 40px var(--accent-gold), 0 0 80px var(--accent-gold); transform: scale(1.15); }
          50%  { text-shadow: 0 0 20px var(--accent-teal), 0 0 60px var(--accent-teal); transform: scale(1.1); }
          100% { text-shadow: 0 0 0px transparent; transform: scale(1); }
        }
        .level-up-flash {
          animation: levelUpFlash 2s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default ClientDashboard;
