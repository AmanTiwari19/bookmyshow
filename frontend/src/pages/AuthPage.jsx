import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

/**
 * AuthPage — combined login / register screen (toggle between modes).
 * On success, redirects back to where the user was headed (location.state.from)
 * or to home.
 */
export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="nav"><span className="nav-logo">BookMyShow</span></div>
      <div className="auth-wrap">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-title">{mode === "login" ? "Sign in" : "Create account"}</div>

          {mode === "register" && (
            <div className="form-field">
              <div className="form-label">Name</div>
              <input className="form-input" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
            </div>
          )}

          <div className="form-field">
            <div className="form-label">Email</div>
            <input className="form-input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>

          <div className="form-field">
            <div className="form-label">Password</div>
            <input className="form-input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Min 6 characters" : "••••••"} required />
          </div>

          {error && <div className="error-inline">{error}</div>}

          <button className="btn-primary" style={{ marginTop: 14 }} disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <div className="auth-switch">
            {mode === "login" ? (
              <>No account? <span onClick={() => { setMode("register"); setError(null); }}>Register here</span></>
            ) : (
              <>Already have an account? <span onClick={() => { setMode("login"); setError(null); }}>Sign in</span></>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
