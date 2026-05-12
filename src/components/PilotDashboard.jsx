import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LogOut, Plus, Play, Pause, Square,
  Users, Target, Clock, TrendingUp,
  Image as ImageIcon, CheckCircle, ChevronRight,
  Trash2, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LinearProgressBar } from './ProgressBar';
import ImageUploader from './ImageUploader';
import { expForRange, expPercentGained, progressToTarget, formatTimer } from '../lib/expCalculator';

const PilotDashboard = ({ user, onLogout }) => {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const [confirm, setConfirm] = useState(null);
  const [showStopForm, setShowStopForm] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [showContinueForm, setShowContinueForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    price: '', gcashNumber: '', paypalEmail: '', pilotName: '', hourlyRate: '', currency: 'PHP'
  });
  const [editingPayment, setEditingPayment] = useState(false);
  const [unpaidSecs, setUnpaidSecs] = useState(0);
  const [continueForm, setContinueForm] = useState({
    startLevel: '',
    startExpPercent: '',
    targetLevel: '',
  });
  const stopImageUrlRef = useRef(null);
  const timerRef = useRef(null);

  const [form, setForm] = useState({
    characterName: '',
    startLevel: 1,
    startExpPercent: 0,
    targetLevel: 60,
  });

  const [updateForm, setUpdateForm] = useState({
    level: '',
    expPercent: '',
    notes: '',
  });

  const [stopForm, setStopForm] = useState({
    level: '',
    expPercent: '',
    notes: '',
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const startLog = [...logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).find((l) => l.log_type === 'start');
  const endLog = logs.find((l) => l.log_type === 'end');
  const updateLogs = logs
    .filter((l) => l.log_type === 'update' &&
      (!startLog || new Date(l.created_at) > new Date(startLog.created_at)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const latestUpdate = updateLogs[0] || startLog;

  const calcElapsed = useCallback(() => {
    if (!selectedSession) return 0;
    if (selectedSession.status === 'completed') return 0;
    let total = selectedSession.total_active_seconds || 0;
    if (selectedSession.timer_status === 'running' && selectedSession.timer_started_at) {
      total += Math.floor((Date.now() - new Date(selectedSession.timer_started_at).getTime()) / 1000);
    }
    return total;
  }, [selectedSession]);

  useEffect(() => {
    if (selectedSession?.timer_status === 'running') {
      timerRef.current = setInterval(() => {
        setTimerDisplay(formatTimer(calcElapsed()));
      }, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      setTimerDisplay(formatTimer(calcElapsed()));
    }
  }, [selectedSession?.timer_status, selectedSession?.timer_started_at, selectedSession?.total_active_seconds, calcElapsed]);

  const showNotif = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadSessions = async () => {
    const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: false });
    if (data) {
      setSessions(data);
      if (!selectedSessionId && data.length > 0) {
        setSelectedSessionId(data[0].id);
      }
    }
  };

  const loadLogs = async (sessionId) => {
    const { data } = await supabase
      .from('progress_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (data) {
      setLogs(data);
      const end = data.find((l) => l.log_type === 'end');
      const latest = data.find((l) => l.log_type === 'update');
      const ref = end || latest;
      if (ref) {
        setUpdateForm((prev) => ({
          level: ref.level,
          expPercent: ref.exp_percent,
          notes: prev.notes || '',
        }));
      }
    }
  };

  const loadUnpaidHours = async (sessionId) => {
    const { data } = await supabase
      .from('progress_logs')
      .select('billed_seconds')
      .eq('session_id', sessionId)
      .eq('log_type', 'end')
      .is('paid_at', null);
    if (data) {
      const total = data.reduce((sum, l) => sum + (l.billed_seconds || 0), 0);
      setUnpaidSecs(total);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadLogs(selectedSessionId);
      loadUnpaidHours(selectedSessionId);
      setUpdateForm({ level: '', expPercent: '', notes: '' });
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (selectedSession) {
      setPaymentForm({
        price: selectedSession.price || '',
        gcashNumber: selectedSession.gcash_number || '',
        paypalEmail: selectedSession.paypal_email || '',
        pilotName: selectedSession.pilot_name || '',
        hourlyRate: selectedSession.hourly_rate || '',
        currency: selectedSession.currency || 'PHP',
      });
    }
  }, [selectedSessionId]);

  const createSession = async (e) => {
    e.preventDefault();
    if (!form.characterName.trim()) return;

    const { data, error } = await supabase.from('sessions').insert({
      character_name: form.characterName,
      start_level: parseInt(form.startLevel),
      target_level: parseInt(form.targetLevel),
      current_day: 1,
      status: 'active',
      timer_status: 'stopped',
      total_active_seconds: 0,
    }).select().single();

    if (error) {
      showNotif('Failed to create session: ' + error.message, 'error');
      return;
    }

    setSessions((prev) => [data, ...prev]);
    setSelectedSessionId(data.id);
    setShowNewForm(false);
    setForm({ characterName: '', startLevel: 1, startExpPercent: 0, targetLevel: 60 });
    showNotif(`Session for ${data.character_name} created!`);
  };

  const updateSession = async (id, updates) => {
    const { data } = await supabase.from('sessions').update(updates).eq('id', id).select().single();
    if (data) {
      setSessions((prev) => prev.map((s) => (s.id === id ? data : s)));
    }
    return data;
  };

  const handleStart = async () => {
    if (!selectedSessionId) return;
    const lv = parseInt(updateForm.level) || selectedSession.start_level;
    const exp = parseFloat(updateForm.expPercent) || form.startExpPercent;

    await supabase.from('progress_logs').insert({
      session_id: selectedSessionId,
      level: lv,
      exp_percent: exp,
      log_type: 'start',
      notes: `Session started at Lv.${lv} ${exp}%`,
    });

    await updateSession(selectedSessionId, {
      timer_status: 'running',
      timer_started_at: new Date().toISOString(),
    });

    loadLogs(selectedSessionId);
    showNotif('Timer started!');
  };

  const handlePause = async () => {
    if (!selectedSessionId || !selectedSession) return;
    const elapsed = Math.floor((Date.now() - new Date(selectedSession.timer_started_at).getTime()) / 1000);

    await updateSession(selectedSessionId, {
      timer_status: 'paused',
      timer_started_at: null,
      total_active_seconds: (selectedSession.total_active_seconds || 0) + elapsed,
    });

    showNotif('Timer paused');
  };

  const handleResume = async () => {
    if (!selectedSessionId) return;

    await updateSession(selectedSessionId, {
      timer_status: 'running',
      timer_started_at: new Date().toISOString(),
    });

    showNotif('Timer resumed!');
  };

  const handleStop = async (e) => {
    e?.preventDefault();
    if (!selectedSessionId || !selectedSession) return;

    const lv = parseInt(stopForm.level);
    const exp = parseFloat(stopForm.expPercent);
    if (!lv) {
      showNotif('Please enter the final level', 'error');
      return;
    }

    const elapsed = selectedSession.timer_started_at
      ? Math.floor((Date.now() - new Date(selectedSession.timer_started_at).getTime()) / 1000)
      : 0;

    const todayBilled = (selectedSession.total_active_seconds || 0) + elapsed;

    const newBilled = (selectedSession.total_billed_seconds || 0)
      + todayBilled;

    await supabase.from('progress_logs').insert({
      session_id: selectedSessionId,
      level: lv,
      exp_percent: exp,
      log_type: 'end',
      notes: stopForm.notes || `Session ended at Lv.${lv} ${exp}%`,
      image_url: stopImageUrlRef.current || null,
      billed_seconds: todayBilled,
    });

    await updateSession(selectedSessionId, {
      timer_status: 'stopped',
      timer_started_at: null,
      total_active_seconds: 0,
      total_billed_seconds: newBilled,
      status: 'completed',
    });

    clearInterval(timerRef.current);
    setTimerDisplay('00:00:00');

    const summaryExpPct = startLog ? expPercentGained(
      startLog.level, parseFloat(startLog.exp_percent), lv, exp
    ) : 0;
    const summaryExpRaw = startLog ? expForRange(
      startLog.level, parseFloat(startLog.exp_percent), lv, exp
    ) : 0;
    const hours = newBilled / 3600;

    setSessionSummary({
      character: selectedSession.character_name,
      totalTime: formatTimer(newBilled),
      expPct: summaryExpPct.toFixed(2),
      expRaw: summaryExpRaw.toLocaleString(),
      expPerHour: hours > 0 ? (summaryExpPct / hours).toFixed(2) : '—',
      fromLevel: startLog?.level,
      toLevel: lv,
    });
    setShowStopForm(false);
    stopImageUrlRef.current = null;
    setStopForm({ level: '', expPercent: '', notes: '' });
    await loadSessions();
    await loadLogs(selectedSessionId);
  };

  const submitUpdate = async (e) => {
    e.preventDefault();
    if (!selectedSessionId) return;
    const lv = parseInt(updateForm.level);
    const exp = parseFloat(updateForm.expPercent);
    if (!lv) return;

    setSubmitting(true);

    const { error } = await supabase.from('progress_logs').insert({
      session_id: selectedSessionId,
      level: lv,
      exp_percent: exp,
      log_type: 'update',
      notes: updateForm.notes || null,
    });

    if (error) {
      showNotif('Failed to save update: ' + error.message, 'error');
    } else {
      showNotif('Progress updated!');
      loadLogs(selectedSessionId);
      setUpdateForm((prev) => ({ ...prev, notes: '' }));
    }
    setSubmitting(false);
  };

  const handleDeleteLog = async (logId) => {
    const { error } = await supabase.from('progress_logs').delete().eq('id', logId);
    if (error) {
      showNotif('Failed to delete update: ' + error.message, 'error');
    } else {
      showNotif('Update deleted');
      loadLogs(selectedSessionId);
    }
    setConfirm(null);
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionId) return;
    await supabase.from('progress_logs').delete().eq('session_id', selectedSessionId);
    const { error } = await supabase.from('sessions').delete().eq('id', selectedSessionId);

    if (error) {
      showNotif('Failed to delete session: ' + error.message, 'error');
    } else {
      showNotif('Session deleted');
      const remaining = sessions.filter((s) => s.id !== selectedSessionId);
      setSessions(remaining);
      setSelectedSessionId(remaining[0]?.id || null);
      setLogs([]);
    }
    setConfirm(null);
  };

  const handleImageUploaded = async (url) => {
    if (!latestUpdate) return;
    const { error } = await supabase
      .from('progress_logs')
      .update({ image_url: url })
      .eq('id', latestUpdate.id);

    if (error) {
      showNotif('Failed to attach screenshot', 'error');
    } else {
      showNotif('Screenshot attached!');
      loadLogs(selectedSessionId);
    }
  };

  const openStopForm = () => {
    setStopForm({
      level: updateForm.level || latestUpdate?.level || '',
      expPercent: updateForm.expPercent || latestUpdate?.exp_percent || '',
      notes: '',
    });
    setShowStopForm(true);
  };

  const openContinueForm = () => {
    setContinueForm({
      startLevel: latestUpdate?.level || selectedSession.start_level,
      startExpPercent: latestUpdate?.exp_percent || 0,
      targetLevel: selectedSession.target_level,
    });
    setShowContinueForm(true);
  };

  const savePaymentSettings = async () => {
    await updateSession(selectedSessionId, {
      price: parseFloat(paymentForm.price) || 0,
      gcash_number: paymentForm.gcashNumber || null,
      paypal_email: paymentForm.paypalEmail || null,
      pilot_name: paymentForm.pilotName || null,
    hourly_rate: parseFloat(paymentForm.hourlyRate) || 0,
    currency: paymentForm.currency || 'PHP',
  });
    setEditingPayment(false);
    showNotif('Payment settings saved!');
  };

  const confirmPayment = async () => {
    const totalSecs = selectedSession.total_billed_seconds || 0;
    const hrs = totalSecs / 3600;
    const rate = selectedSession.hourly_rate || 0;
    const amount = hrs * rate;

    const { error } = await supabase.from('payment_history').insert({
      session_id: selectedSessionId,
      amount: parseFloat(amount.toFixed(2)),
      currency: selectedSession.currency || 'PHP',
      hours: parseFloat(hrs.toFixed(4)),
      hourly_rate: rate,
      payment_method: selectedSession.payment_method,
      payment_reference: selectedSession.payment_reference,
      confirmed_at: new Date().toISOString(),
    });

    if (error) {
      showNotif('Failed: ' + error.message, 'error');
      return;
    }

    await supabase
      .from('progress_logs')
      .update({ paid_at: new Date().toISOString() })
      .eq('session_id', selectedSessionId)
      .eq('log_type', 'end')
      .is('paid_at', null);

    setUnpaidSecs(0);

    await updateSession(selectedSessionId, {
      payment_status: 'unpaid',
      payment_requested: false,
      payment_reference: null,
      payment_method: null,
      total_billed_seconds: 0,
    });

    await loadSessions();
    showNotif('Payment confirmed and recorded!');
  };

  const requestPayment = async () => {
    await updateSession(selectedSessionId, {
      payment_requested: true,
      payment_status: 'unpaid',
      payment_reference: null,
      payment_method: null,
    });
    showNotif('Payment request sent to client!');
  };

  const cancelPaymentRequest = async () => {
    await updateSession(selectedSessionId, {
      payment_requested: false,
      payment_status: 'unpaid',
      payment_reference: null,
      payment_method: null,
    });
    showNotif('Payment request cancelled.');
  };

  const handleContinueSession = async (e) => {
    e.preventDefault();
    if (continuing) return;
    setContinuing(true);
    const lv = parseInt(continueForm.startLevel);
    const exp = parseFloat(continueForm.startExpPercent);
    const target = parseInt(continueForm.targetLevel);

    await updateSession(selectedSessionId, {
      status: 'active',
      timer_status: 'stopped',
      timer_started_at: null,
      total_active_seconds: 0,
      total_billed_seconds: selectedSession.total_billed_seconds || 0,
      target_level: target,
      start_level: lv,
      payment_status: 'unpaid',
      payment_requested: false,
      payment_reference: null,
      payment_method: null,
    });

    setTimerDisplay('00:00:00');
    setContinuing(false);
    setShowContinueForm(false);
    await loadLogs(selectedSessionId);
    await loadSessions();
    showNotif('Ready! Click Start Session to begin working.');
  };

  const calcExpGained = () => {
    if (!startLog || !latestUpdate) return null;
    return expForRange(
      startLog.level, parseFloat(startLog.exp_percent),
      latestUpdate.level, parseFloat(latestUpdate.exp_percent)
    );
  };

  const hasStarted = selectedSession?.timer_status === 'running' || selectedSession?.timer_status === 'paused';
  const expGained = calcExpGained();
  const pctGained = startLog && latestUpdate ? expPercentGained(
    startLog.level, parseFloat(startLog.exp_percent),
    latestUpdate.level, parseFloat(latestUpdate.exp_percent)
  ) : null;
  const timerActive = selectedSession?.timer_status === 'running';
  const canDeleteSession = selectedSession?.timer_status === 'stopped';
  const endLogsCount = logs.filter(l => l.log_type === 'end').length;
  const currentDay = endLogsCount + 1;

  const getGainColor = (log, prevLog) => {
    if (!prevLog || log.log_type === 'start') return 'var(--text-dim)';
    const gained = expPercentGained(
      prevLog.level, parseFloat(prevLog.exp_percent),
      log.level, parseFloat(log.exp_percent)
    );
    if (gained >= 5) return 'var(--success)';
    if (gained >= 1) return 'var(--accent-gold)';
    if (gained > 0) return 'var(--accent-teal)';
    return 'var(--text-dim)';
  };

  const CURRENCIES = [
    { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
    { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
    { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  ];

  const getCurrencySymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || '₱';

  return (
    <div className="dashboard-container">
      <div className="dashboard-header glass animate-fade-in">
        <h1><span className="gradient-text">Pilot Dashboard</span></h1>
        <div className="user-info">
          <div className="user-avatar">P</div>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{user.user}</span>
          <button onClick={onLogout} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.type}`}>
          <CheckCircle size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {notification.message}
        </div>
      )}

      {confirm && (
        <div className="dialog-overlay" onClick={() => setConfirm(null)}>
          <div className="dialog glass" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={32} style={{ color: 'var(--danger)', marginBottom: 12 }} />
            <h3>{confirm.title}</h3>
            <p>{confirm.message}</p>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirm.action}>
                <Trash2 size={14} /> {confirm.btnLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionSummary && (
        <div className="dialog-overlay" onClick={() => setSessionSummary(null)}>
          <div className="dialog glass" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎉</div>
            <h3 style={{ color: 'var(--accent-gold)', marginBottom: 4 }}>Session Complete!</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
              {sessionSummary.character}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div className="quick-stat">
                <span className="label">Level Range</span>
                <span className="value">Lv.{sessionSummary.fromLevel} &rarr; Lv.{sessionSummary.toLevel}</span>
              </div>
              <div className="quick-stat">
                <span className="label">Total Time</span>
                <span className="value" style={{ color: 'var(--accent-teal)' }}>{sessionSummary.totalTime}</span>
              </div>
              <div className="quick-stat">
                <span className="label">Total EXP Gained</span>
                <span className="value" style={{ color: 'var(--success)' }}>+{sessionSummary.expPct}%</span>
              </div>
              <div className="quick-stat">
                <span className="label">Raw EXP</span>
                <span className="value">{sessionSummary.expRaw}</span>
              </div>
              <div className="quick-stat">
                <span className="label">Avg EXP/Hour</span>
                <span className="value" style={{ color: 'var(--accent-purple)' }}>{sessionSummary.expPerHour}%/hr</span>
              </div>
            </div>
            <button className="btn-primary" style={{ width: '100%' }}
              onClick={() => setSessionSummary(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showContinueForm && (
        <div className="dialog-overlay" onClick={() => setShowContinueForm(false)}>
          <div className="dialog glass" onClick={(e) => e.stopPropagation()}>
            <Play size={24} style={{ color: 'var(--accent-teal)', marginBottom: 12 }} />
            <h3>Continue Session</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
              Day {currentDay + 1} — update starting stats.
            </p>
            <form onSubmit={handleContinueSession} style={{ width: '100%' }}>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Start Level</label>
                  <input className="input-field" type="number" min={1} max={200}
                    value={continueForm.startLevel}
                    onChange={(e) => setContinueForm((f) => ({ ...f, startLevel: e.target.value }))}
                    required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Start EXP %</label>
                  <input className="input-field" type="number" min={0} max={100} step={0.0001}
                    value={continueForm.startExpPercent}
                    onChange={(e) => setContinueForm((f) => ({ ...f, startExpPercent: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Target Level</label>
                <input className="input-field" type="number" min={1} max={200}
                  value={continueForm.targetLevel}
                  onChange={(e) => setContinueForm((f) => ({ ...f, targetLevel: e.target.value }))}
                  required />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowContinueForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={continuing}>{continuing ? 'Starting...' : `Start Day ${currentDay + 1}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStopForm && (
        <div className="dialog-overlay" onClick={() => setShowStopForm(false)}>
          <div className="dialog glass" onClick={(e) => e.stopPropagation()}>
            <Square size={24} style={{ color: 'var(--accent-gold)', marginBottom: 12 }} />
            <h3>Finalize Session</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
              Enter the final stats and optional screenshot.
            </p>
            <form onSubmit={handleStop} style={{ width: '100%' }}>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Final Level</label>
                  <input className="input-field" type="number" min={1} max={200}
                    value={stopForm.level}
                    onChange={(e) => setStopForm((f) => ({ ...f, level: e.target.value }))}
                    required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Final EXP %</label>
                  <input className="input-field" type="number" min={0} max={100} step={0.0001}
                    value={stopForm.expPercent}
                    onChange={(e) => setStopForm((f) => ({ ...f, expPercent: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Notes</label>
                <input className="input-field" placeholder="e.g. Session complete!"
                  value={stopForm.notes}
                  onChange={(e) => setStopForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              {selectedSessionId && (
                <div style={{ marginBottom: 16 }}>
                  <ImageUploader sessionId={selectedSessionId} onUploadComplete={(url) => {
                    stopImageUrlRef.current = url;
                  }} />
                </div>
              )}
              <div className="dialog-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowStopForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Stop & Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="pilot-layout">
        <div className="pilot-sidebar">
          <div className="glass card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} style={{ color: 'var(--accent-teal)' }} />
                Sessions
              </h2>
              <button
                className="btn-secondary"
                onClick={() => setShowNewForm(!showNewForm)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: '0.8rem' }}
              >
                <Plus size={14} /> New
              </button>
            </div>

            {showNewForm && (
              <motion.form
                onSubmit={createSession}
                style={{ marginBottom: 16 }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
              >
                <div className="form-group">
                  <label>Character Name</label>
                  <input className="input-field" placeholder="e.g. Masaru" value={form.characterName}
                    onChange={(e) => setForm((f) => ({ ...f, characterName: e.target.value }))} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Level</label>
                    <input className="input-field" type="number" min={1} max={200} value={form.startLevel}
                      onChange={(e) => setForm((f) => ({ ...f, startLevel: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label>Target Level</label>
                    <input className="input-field" type="number" min={1} max={200} value={form.targetLevel}
                      onChange={(e) => setForm((f) => ({ ...f, targetLevel: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Starting EXP %</label>
                  <input className="input-field" type="number" min={0} max={100} step={0.0001} value={form.startExpPercent}
                    onChange={(e) => setForm((f) => ({ ...f, startExpPercent: e.target.value }))} />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 8 }}>
                  Create Session
                </button>
              </motion.form>
            )}

            {sessions.length === 0 && !showNewForm && (
              <div className="empty-state" style={{ padding: '1rem 0' }}>
                <p>No sessions yet.</p>
              </div>
            )}

            <div className="session-list">
              {sessions.map((s) => (
                <div key={s.id} className={`session-card glass ${s.id === selectedSessionId ? 'selected' : ''}`}
                  onClick={() => setSelectedSessionId(s.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4>{s.character_name}</h4>
                    <ChevronRight size={16} style={{ color: s.id === selectedSessionId ? 'var(--accent-teal)' : 'var(--text-dim)', marginTop: 2 }} />
                  </div>
                  <div className="session-meta">
                    <span><Target size={12} /> Lv.{s.start_level} &rarr; Lv.{s.target_level}</span>
                    <span><span className={`status-indicator ${s.status}`} />{s.status}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
                    Day {s.current_day || 1}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedSession && canDeleteSession && (
            <div className="glass card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)' }}>
                <Trash2 size={16} />
                Danger Zone
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>
                Permanently remove this session and all its data.
              </p>
              <button
                className="btn-danger"
                style={{ width: '100%', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => setConfirm({
                  title: 'Delete Session?',
                  message: `This will permanently delete "${selectedSession.character_name}" and all ${logs.length} progress logs. This cannot be undone.`,
                  action: handleDeleteSession,
                  btnLabel: 'Delete Session',
                })}
              >
                <Trash2 size={14} /> Delete Session
              </button>
            </div>
          )}

          {selectedSession && (
            <div className="glass card" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-gold)' }}>
                  💰 Payment
                </h3>
                <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setEditingPayment(!editingPayment)}>
                  {editingPayment ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {editingPayment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Full Name</label>
                    <input className="input-field" placeholder="e.g. Juan dela Cruz"
                      value={paymentForm.pilotName}
                      onChange={(e) => setPaymentForm(f => ({ ...f, pilotName: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Currency</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {CURRENCIES.map(c => (
                        <button key={c.code} type="button"
                          onClick={() => setPaymentForm(f => ({ ...f, currency: c.code }))}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            border: `1px solid ${paymentForm.currency === c.code ? 'var(--accent-teal)' : 'var(--glass-border)'}`,
                            background: paymentForm.currency === c.code ? 'rgba(0,242,255,0.08)' : 'transparent',
                            color: paymentForm.currency === c.code ? 'var(--accent-teal)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.8rem',
                            transition: 'all 0.15s',
                          }}>
                          {c.symbol} {c.code}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Hourly Rate</label>
                    <input className="input-field" type="number" min={0} step={0.01}
                      placeholder="e.g. 200"
                      value={paymentForm.hourlyRate}
                      onChange={(e) => setPaymentForm(f => ({ ...f, hourlyRate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>GCash Number</label>
                    <input className="input-field" placeholder="09XXXXXXXXX"
                      value={paymentForm.gcashNumber}
                      onChange={(e) => setPaymentForm(f => ({ ...f, gcashNumber: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>PayPal Email</label>
                    <input className="input-field" placeholder="you@email.com"
                      value={paymentForm.paypalEmail}
                      onChange={(e) => setPaymentForm(f => ({ ...f, paypalEmail: e.target.value }))} />
                  </div>
                  <button className="btn-primary" style={{ width: '100%' }} onClick={savePaymentSettings}>
                    Save
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="quick-stat">
                    <span className="label">Full Name</span>
                    <span className="value">{selectedSession.pilot_name || '—'}</span>
                  </div>
                  <div className="quick-stat">
                    <span className="label">Currency</span>
                    <span className="value" style={{ color: 'var(--accent-teal)' }}>
                      {getCurrencySymbol(selectedSession.currency)} {selectedSession.currency || 'PHP'}
                    </span>
                  </div>
                  <div className="quick-stat">
                    <span className="label">Hourly Rate</span>
                    <span className="value" style={{ color: 'var(--accent-teal)' }}>
                      {getCurrencySymbol(selectedSession.currency)}{selectedSession.hourly_rate?.toFixed(2) || '0.00'}/hr
                    </span>
                  </div>
                  <div className="quick-stat">
                    <span className="label">GCash</span>
                    <span className="value">{selectedSession.gcash_number || '—'}</span>
                  </div>
                  <div className="quick-stat">
                    <span className="label">PayPal</span>
                    <span className="value" style={{ fontSize: '0.8rem' }}>{selectedSession.paypal_email || '—'}</span>
                  </div>

                  <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 8, marginTop: 4 }}>
                    {(() => {
                      const isCompleted = selectedSession.status === 'completed';
                      const activeSecs = selectedSession.total_active_seconds || 0;
                      const runningSecs = selectedSession.timer_status === 'running' && selectedSession.timer_started_at
                        ? Math.floor((Date.now() - new Date(selectedSession.timer_started_at).getTime()) / 1000)
                        : 0;
                      const totalSecs = isCompleted
                        ? unpaidSecs
                        : (activeSecs + runningSecs);
                      const h = Math.floor(totalSecs / 3600);
                      const m = Math.floor((totalSecs % 3600) / 60);
                      const rate = selectedSession.hourly_rate || 0;
                      const amountDue = (totalSecs / 3600) * rate;
                      return (
                        <>
                          <div className="quick-stat">
                            <span className="label">Hours Worked</span>
                            <span className="value" style={{ color: 'var(--accent-purple)' }}>
                              {h}h {m}m
                            </span>
                          </div>
                          <div className="quick-stat">
                            <span className="label">Amount Due</span>
                            <span className="value" style={{ color: 'var(--accent-gold)', fontWeight: 900 }}>
                              {getCurrencySymbol(selectedSession.currency)}{amountDue.toFixed(2)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="quick-stat">
                    <span className="label">Status</span>
                    <span className="value" style={{
                      color: selectedSession.payment_status === 'paid' ? 'var(--accent-gold)'
                        : selectedSession.payment_requested ? 'var(--accent-teal)'
                        : 'var(--danger)'
                    }}>
                      {selectedSession.payment_status === 'paid' ? '⏳ Pending Confirmation'
                        : selectedSession.payment_requested ? '📨 Awaiting Client Payment'
                        : '❌ Unpaid'}
                    </span>
                  </div>

                  {selectedSession.payment_status === 'paid' && (
                    <>
                      <div className="quick-stat">
                        <span className="label">Reference</span>
                        <span className="value" style={{ fontSize: '0.8rem' }}>{selectedSession.payment_reference || '—'}</span>
                      </div>
                      <div className="quick-stat">
                        <span className="label">Method</span>
                        <span className="value">{selectedSession.payment_method || '—'}</span>
                      </div>
                    </>
                  )}

                  {selectedSession.payment_status === 'paid' && (
                    <button className="btn-primary" style={{ width: '100%', marginTop: 4 }}
                      onClick={confirmPayment}>
                      ✓ Confirm Payment
                    </button>
                  )}

                  {!selectedSession.payment_requested && selectedSession.payment_status !== 'paid' && (
                    <button className="btn-primary" style={{ width: '100%', marginTop: 4 }}
                      onClick={requestPayment}>
                      💸 Request Payment
                    </button>
                  )}

                  {selectedSession.payment_requested && selectedSession.payment_status === 'unpaid' && (
                    <button className="btn-secondary" style={{ width: '100%', marginTop: 4, fontSize: '0.8rem' }}
                      onClick={cancelPaymentRequest}>
                      ✕ Cancel Request
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pilot-main">
          {!selectedSession && (
            <div className="empty-state glass card animate-fade-in" style={{ marginTop: 0 }}>
              <Target size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
              <h3>Select a Session</h3>
              <p>Choose a session from the sidebar or create a new one.</p>
            </div>
          )}

          {selectedSession && (
            <motion.div key={selectedSession.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="glass card session-hero" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{selectedSession.character_name}</h2>
                    <div className="session-meta" style={{ marginTop: 4 }}>
                      <span><Target size={12} /> Lv.{selectedSession.start_level} &rarr; Lv.{selectedSession.target_level}</span>
                      <span><span className={`status-indicator ${selectedSession.status}`} />{selectedSession.status}</span>
                      <span>Day {currentDay}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <div className={`timer-display ${timerActive ? 'active' : ''}`}>
                      {timerDisplay}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
                      {selectedSession.timer_status === 'stopped' ? 'Not started' :
                       selectedSession.timer_status === 'paused' ? 'Paused' : 'Active time'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <LinearProgressBar
                    value={latestUpdate ? progressToTarget(
                      latestUpdate.level, parseFloat(latestUpdate.exp_percent), selectedSession.target_level
                    ).overallPercent : 0}
                    height={8}
                    showPercent={false}
                    label="Overall progress"
                  />
                </div>
              </div>

              {selectedSession.timer_status !== 'running' && selectedSession.timer_status !== 'paused' && (
                <div className="timer-controls glass card" style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedSession.timer_status === 'stopped' && selectedSession.status === 'completed' ? (
                      <button className="btn-primary timer-btn start" onClick={openContinueForm}>
                        <Play size={16} /> Continue Session (Day {currentDay + 1})
                      </button>
                    ) : selectedSession.timer_status === 'stopped' ? (
                      <button className="btn-primary timer-btn start" onClick={handleStart}>
                        <Play size={16} /> Start Session
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {selectedSession.timer_status === 'running' && (
                <div className="timer-controls glass card" style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                    <button className="btn-secondary timer-btn" onClick={handlePause}>
                      <Pause size={16} /> Pause
                    </button>
                    <button className="btn-danger timer-btn" onClick={openStopForm}>
                      <Square size={16} /> Stop
                    </button>
                  </div>
                </div>
              )}

              {selectedSession.timer_status === 'paused' && (
                <div className="timer-controls glass card" style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                    <button className="btn-primary timer-btn" onClick={handleResume}>
                      <Play size={16} /> Resume
                    </button>
                    <button className="btn-danger timer-btn" onClick={openStopForm}>
                      <Square size={16} /> Stop
                    </button>
                  </div>
                </div>
              )}

              <div className="session-grid">
                <div className="glass card">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={16} /> Update Progress
                  </h3>

                  <form onSubmit={submitUpdate}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Current Level</label>
                        <input className="input-field" type="number" min={1} max={200}
                          value={updateForm.level}
                          onChange={(e) => setUpdateForm((f) => ({ ...f, level: e.target.value }))}
                          required />
                      </div>
                      <div className="form-group">
                        <label>EXP %</label>
                        <input className="input-field" type="number" min={0} max={100} step={0.0001}
                          value={updateForm.expPercent}
                          onChange={(e) => setUpdateForm((f) => ({ ...f, expPercent: e.target.value }))}
                          required />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <input className="input-field" placeholder="e.g. Leveled at Saint Morning"
                        value={updateForm.notes}
                        onChange={(e) => setUpdateForm((f) => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <button type="submit" className="btn-primary"
                      disabled={submitting || !hasStarted}
                      style={{ width: '100%', opacity: (submitting || !hasStarted) ? 0.4 : 1 }}>
                      {submitting ? 'Saving...' : 'Save Update'}
                    </button>
                    {!hasStarted && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 8 }}>
                        Start the session timer first before saving updates.
                      </p>
                    )}
                  </form>

                  {expGained !== null && (
                    <div style={{ marginTop: 16, padding: '12px', background: 'rgba(0, 242, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}>
                      <div className="quick-stat">
                        <span className="label">Total EXP Gained</span>
                        <span className="value" style={{ color: 'var(--success)' }}>
                          +{expGained.toLocaleString()} {pctGained !== null && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>(+{pctGained.toFixed(2)}%)</span>}
                        </span>
                      </div>
                      {startLog && (
                        <div className="quick-stat">
                          <span className="label">Started at</span>
                          <span className="value">Lv.{startLog.level} @ {parseFloat(startLog.exp_percent).toFixed(4)}%</span>
                        </div>
                      )}
                      {latestUpdate && (
                        <div className="quick-stat">
                          <span className="label">Current</span>
                          <span className="value">Lv.{latestUpdate.level} @ {parseFloat(latestUpdate.exp_percent).toFixed(4)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="glass card">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ImageIcon size={16} style={{ color: 'var(--accent-purple)' }} />
                    Screenshot
                  </h3>
                  <ImageUploader sessionId={selectedSession.id} onUploadComplete={handleImageUploaded} />

                  {startLog?.image_url && (
                    <div style={{ marginTop: 12 }}>
                      <label>Start Screenshot</label>
                      <img src={startLog.image_url} alt="Start" style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 4 }} />
                    </div>
                  )}
                </div>
              </div>

              <div className="glass card" style={{ marginTop: 24 }}>
                <h3>Progress Timeline</h3>
                {logs.length === 0 && (
                  <div className="empty-state" style={{ padding: '1rem 0' }}>
                    <p>No updates recorded yet.</p>
                  </div>
                )}
                <div className="timeline" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {[...logs].reverse().map((log, i, arr) => {
                    const prevLog = arr[i + 1];
                    const gainColor = getGainColor(log, prevLog);
                    return (
                    <div key={log.id} className="timeline-item" style={{ borderLeftColor: gainColor }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div className="time">
                            {new Date(log.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </div>
                          <div className="content">
                            {log.log_type === 'start' && <span className="badge" style={{ background: 'rgba(0,242,255,0.1)', color: 'var(--accent-teal)', marginRight: 6 }}>START</span>}
                            {log.log_type === 'end' && <span className="badge" style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--success)', marginRight: 6 }}>END</span>}
                            <span style={{ color: gainColor }}>
                              Lv.<strong>{log.level}</strong> &mdash; <strong>{parseFloat(log.exp_percent).toFixed(2)}%</strong> EXP
                            </span>
                            {log.notes && <span> &mdash; {log.notes}</span>}
                          </div>
                          {log.image_url && (
                            <div style={{ marginTop: 4 }}>
                              <a href={log.image_url} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--accent-teal)', fontSize: '0.8rem', textDecoration: 'none' }}>
                                <ImageIcon size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                View Screenshot
                              </a>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setConfirm({
                            title: 'Delete Update?',
                            message: `Remove this update (Lv.${log.level} @ ${parseFloat(log.exp_percent).toFixed(2)}%) from the timeline?`,
                            action: () => handleDeleteLog(log.id),
                            btnLabel: 'Delete Update',
                          })}
                          style={{
                            background: 'none', border: 'none', color: 'var(--text-dim)',
                            cursor: 'pointer', padding: 4, borderRadius: 4, flexShrink: 0,
                            transition: 'color 0.2s, background 0.2s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(255,75,43,0.1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none'; }}
                          title="Delete update"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PilotDashboard;
