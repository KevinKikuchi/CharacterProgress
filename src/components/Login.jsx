import { useState } from 'react';
import { User, Lock, ArrowRight } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (username === 'admin' && password === 'kuchi143') {
      onLogin({ role: 'pilot', user: 'admin' });
    } else if (username === 'tres' && password === 'tres143') {
      onLogin({ role: 'client', user: 'tres' });
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="login-container animate-fade-in">
      <div className="glass login-card">
        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-teal))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              fontSize: 24,
              fontWeight: 900,
              color: 'white',
            }}
          >
            F
          </div>
        </div>
        <h1 className="gradient-text">Flyff Progress</h1>
        <p className="login-subtitle">Enter your credentials to continue</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <User size={18} className="input-icon" />
            <input
              type="text"
              placeholder="Username"
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input
              type="password"
              placeholder="Password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn-primary"
            style={{
              width: '100%',
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 24px',
            }}
          >
            Login <ArrowRight size={18} />
          </button>
        </form>

        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--glass-border)',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
          }}
        >
          <p>Client: tres / tres143</p>
          <p>Pilot: admin / kuchi143</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
