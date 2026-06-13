// ess-desktop-login.jsx — Sentire Payroll ESS · desktop sign-in (company code + employee no → PIN)
// Exports to window: DLogin

const { EMPLOYEE: DL_EMP } = window.ESS;

function DLoginField({ icon, label, placeholder, value, onChange, autoFocus }) {
  return (
    <div className="d-lfield">
      <label className="e-flabel">{label}</label>
      <div className="e-finput">
        <EIcon name={icon} size={17} />
        <input type="text" placeholder={placeholder} value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value.toUpperCase())} spellCheck="false" />
      </div>
    </div>
  );
}

function DPinBoxes({ pin, error, onPin }) {
  const LEN = 6;
  const ref = React.useRef(null);
  return (
    <div className={"d-pinrow" + (error ? " is-error" : "")} onClick={() => ref.current && ref.current.focus()}>
      {Array.from({ length: LEN }).map((_, i) => (
        <span key={i} className={"d-pinbox" + (i < pin.length ? " is-filled" : "") + (i === pin.length ? " is-next" : "")}>
          {i < pin.length ? "•" : ""}
        </span>
      ))}
      <input ref={ref} className="d-pinhidden" type="password" inputMode="numeric" autoFocus
        value={pin} maxLength={LEN} aria-label="6-digit PIN"
        onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, LEN))} />
    </div>
  );
}

function DLogin({ step: initialStep = "id" }) {
  const [step, setStep] = React.useState(initialStep); // id | pin | ok
  const [company, setCompany] = React.useState(initialStep === "id" ? "" : "SENTIREPAYROLL");
  const [emp, setEmp] = React.useState(initialStep === "id" ? "" : "EMP-00412");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState(false);

  function onPin(v) {
    setPin(v); setError(false);
    if (v.length === 6) {
      setTimeout(() => {
        if (v === "000000") { setError(true); setTimeout(() => { setPin(""); setError(false); }, 700); }
        else setStep("ok");
      }, 160);
    }
  }

  return (
    <div className="d-login">
      <div className="d-login-col">
        <div className="d-login-brand">
          <SentireMark size={40} />
          <b>Sentire <span>Payroll</span></b>
        </div>

        {step === "ok" ? (
          <div className="d-login-card d-login-okcard">
            <span className="e-success-ic"><EIcon name="checkCircle" size={50} /></span>
            <h2>Welcome back, {DL_EMP.first}</h2>
            <p className="d-login-sub">Opening your workspace…</p>
          </div>
        ) : step === "pin" ? (
          <div className="d-login-card">
            <h2>Enter your PIN</h2>
            <p className="d-login-sub">Signing in as <b>{emp || "EMP-00412"}</b> · {company || "SENTIREPAYROLL"}</p>
            <DPinBoxes pin={pin} error={error} onPin={onPin} />
            <p className="d-pinlabel">{error ? "Incorrect PIN — try again." : "Type your 6-digit PIN"}</p>
            <div className="d-login-links">
              <button type="button">Forgot PIN?</button>
              <button type="button" onClick={() => { setStep("id"); setPin(""); }}>Use a different account</button>
            </div>
          </div>
        ) : (
          <form className="d-login-card" onSubmit={(e) => { e.preventDefault(); setStep("pin"); }}>
            <h2>Sign in</h2>
            <p className="d-login-sub">Enter your company code and employee number</p>
            <DLoginField icon="building" label="Company code" placeholder="SENTIREPAYROLL"
              value={company} onChange={setCompany} autoFocus />
            <DLoginField icon="user" label="Employee number" placeholder="EMP-00001"
              value={emp} onChange={setEmp} />
            <EBtn kind="primary" full type="submit">Continue</EBtn>
            <div className="d-login-new">
              <span>New employee?</span>
              <button type="button">Activate your account</button>
            </div>
          </form>
        )}

        <div className="d-login-foot">
          <span>© 2026 Sentire</span>
          <span className="d-login-dot">·</span>
          <button type="button">Privacy</button>
          <span className="d-login-dot">·</span>
          <button type="button">Help</button>
        </div>
      </div>
    </div>
  );
}

window.DLogin = DLogin;
