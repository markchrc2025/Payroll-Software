// ess-clock-login.jsx — Clock in/out (with selfie) + ESS PIN login
// Exports to window: ClockScreen, ESSLogin

const { EMPLOYEE: EMP, ATTENDANCE: ATT } = window.ESS;
const GEO = "Acme Foods HQ · Quezon City";

// ============================ CLOCK IN / OUT (selfie) ============================
function ClockScreen({ param }) {
  const nav = React.useContext(ESSNav);
  const out = param === "out";
  const now = useNow();
  const t = fmtTime(now);
  const [step, setStep] = React.useState("camera"); // camera | review | done
  const [shot, setShot] = React.useState(null);

  function capture() { setShot(fmtTime(new Date())); setStep("review"); }
  const stamp = shot || t;

  if (step === "done") {
    return (
      <div className="e-stack">
        <div className="e-success">
          <span className="e-success-ic"><EIcon name="checkCircle" size={48} /></span>
          <h3>{out ? "Clocked out" : "Clocked in"} · {stamp.full}</h3>
          <p>{ATT.today.date} · selfie verified at {GEO}.</p>
          <div className="e-selfiethumb">
            <div className="e-selfiethumb-img"><EIcon name="user" size={26} /></div>
            <div className="e-selfiethumb-meta">
              <b>Selfie captured</b>
              <i><EIcon name="pin" size={12} /> {GEO}</i>
              <i><EIcon name="clock" size={12} /> {stamp.full}</i>
            </div>
            <EChip tone={out ? "slate" : "green"}>{out ? "Shift ended" : "On time"}</EChip>
          </div>
          <EBtn kind="primary" full onClick={() => nav.tab("home")}>Done</EBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="e-stack e-clockflow">
      <div className="e-geo">
        <EIcon name="pin" size={15} /> {GEO} · <b>{stamp.full}</b>
      </div>

      <div className="e-viewfinder" data-captured={step === "review"}>
        <span className="e-vf-corner e-vf-tl"></span>
        <span className="e-vf-corner e-vf-tr"></span>
        <span className="e-vf-corner e-vf-bl"></span>
        <span className="e-vf-corner e-vf-br"></span>
        <div className="e-vf-guide">
          {step === "review" && <span className="e-vf-check"><EIcon name="check" size={40} /></span>}
        </div>
        {step === "camera" && <div className="e-vf-scan"></div>}
        <div className="e-vf-stamp"><EIcon name="pin" size={12} /> {GEO.split(" · ")[0]} · {stamp.full}</div>
      </div>

      <p className="e-vf-hint">
        {step === "camera"
          ? "Center your face in the frame and tap to capture."
          : "Looks good? Confirm to record your " + (out ? "clock-out" : "clock-in") + "."}
      </p>

      {step === "camera" ? (
        <>
          <button className="e-shutter" onClick={capture} aria-label="Capture selfie"><span></span></button>
          <div className="e-clockflow-note">
            <EIcon name="shield" size={16} />
            <span>Your selfie confirms it's really you and is attached to this {out ? "clock-out" : "clock-in"}.</span>
          </div>
        </>
      ) : (
        <div className="e-review-actions">
          <EBtn kind="ghost" icon="retake" onClick={() => setStep("camera")}>Retake</EBtn>
          <EBtn kind="primary" onClick={() => { if (nav.setClockedIn) nav.setClockedIn(!out); setStep("done"); }}>Confirm</EBtn>
        </div>
      )}
    </div>
  );
}

// ============================ ESS LOGIN (PIN / password / biometric) ============================
function ESSLogin() {
  const [mode, setMode] = React.useState("pin");   // pin | password
  const [pin, setPin] = React.useState("");
  const [status, setStatus] = React.useState("idle"); // idle | scanning | error | success
  const [showPw, setShowPw] = React.useState(false);
  const LEN = 6;

  function press(d) {
    if (status === "success" || status === "scanning") return;
    setPin((p) => {
      if (p.length >= LEN) return p;
      const np = p + d;
      if (np.length === LEN) {
        setTimeout(() => {
          if (np === "000000") { setStatus("error"); setTimeout(() => { setPin(""); setStatus("idle"); }, 650); }
          else setStatus("success");
        }, 120);
      }
      return np;
    });
  }
  function del() { if (status !== "success") { setPin((p) => p.slice(0, -1)); setStatus("idle"); } }
  function faceid() {
    setStatus("scanning");
    setTimeout(() => setStatus("success"), 1500);
  }

  if (status === "success") {
    return (
      <div className="e-login">
        <div className="e-login-success">
          <span className="e-login-check"><EIcon name="checkCircle" size={54} /></span>
          <h2>Welcome back</h2>
          <p>Opening your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="e-login">
      <div className="e-login-brand">
        <NexusMark variant="mesh" size={30} lineW={3.4} core="#E8693A" />
        <b>Sentire <span>Payroll</span></b>
      </div>

      <div className="e-login-id">
        <EAvatar initials={EMP.initials} size={64} />
        <h2>Hi, {EMP.first}</h2>
        <p>{EMP.company}</p>
      </div>

      {mode === "pin" ? (
        <div className="e-pinwrap">
          {status === "scanning" ? (
            <div className="e-facescan">
              <span className="e-facescan-ic"><EIcon name="faceid" size={56} /></span>
              <b>Scanning…</b>
            </div>
          ) : (
            <>
              <div className={"e-pindots" + (status === "error" ? " is-error" : "")}>
                {Array.from({ length: LEN }).map((_, i) => (
                  <span key={i} className={"e-pindot" + (i < pin.length ? " is-on" : "")}></span>
                ))}
              </div>
              <p className="e-pinlabel">{status === "error" ? "Incorrect PIN. Try again." : "Enter your 6-digit PIN"}</p>
            </>
          )}

          <div className="e-keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button key={d} className="e-key" onClick={() => press(String(d))}>{d}</button>
            ))}
            <button className="e-key e-key-fn" onClick={faceid} aria-label="Face ID"><EIcon name="faceid" size={26} /></button>
            <button className="e-key" onClick={() => press("0")}>0</button>
            <button className="e-key e-key-fn" onClick={del} aria-label="Delete"><EIcon name="backspace" size={24} /></button>
          </div>

          <div className="e-login-links">
            <button onClick={() => { setMode("password"); setPin(""); setStatus("idle"); }}>Use password instead</button>
            <button>Forgot PIN?</button>
          </div>
        </div>
      ) : (
        <div className="e-pwwrap">
          <label className="e-flabel">Email</label>
          <div className="e-finput e-finput-ro"><EIcon name="mail" size={17} /><input value={EMP.email} readOnly /></div>
          <label className="e-flabel">Password</label>
          <div className="e-finput">
            <EIcon name="lock" size={17} />
            <input type={showPw ? "text" : "password"} placeholder="Enter your password" defaultValue="········" />
            <button className="e-eye" onClick={() => setShowPw(!showPw)} aria-label="Toggle password">{showPw ? "Hide" : "Show"}</button>
          </div>
          <EBtn kind="primary" full onClick={() => setStatus("success")}>Sign in</EBtn>
          <div className="e-login-links e-login-links-c">
            <button onClick={() => { setMode("pin"); setStatus("idle"); }}>Use PIN instead</button>
            <button onClick={faceid}><EIcon name="faceid" size={15} /> Face ID</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ClockScreen, ESSLogin });
