/* Milray Park — Start a project / brief form screen, with success state. */

function Brief({ go }) {
  const [rooms, setRooms] = React.useState(['Living room']);
  const [style, setStyle] = React.useState('Art Deco');
  const [timeline, setTimeline] = React.useState('Flexible');
  const [budget, setBudget] = React.useState(2400);
  const [inquiry, setInquiry] = React.useState('');
  const [name, setName] = React.useState('');
  const [done, setDone] = React.useState(false);

  const toggleRoom = r => setRooms(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]);
  const allRooms = ['Living room', 'Bedroom', 'Kitchen', 'Home office', 'Dining', 'Bathroom'];
  const styles = ['Art Deco', 'Coastal', 'Minimal', 'Japandi', 'Mid-Century', 'Maximalist'];

  if (done) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}>
        <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--ink)', color: 'var(--coral)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Icon name="check" size={36} color="var(--coral)" stroke={2.4} /></span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: 0 }}>Your brief is in.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--ink-2)', margin: '16px 0 30px' }}>
          We're matching you with designers available now. You'll meet your designer and start collaborating
          100% online — usually within an hour.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button variant="dark" size="lg" iconRight="arrowRight" onClick={() => go('browse')}>Browse designers</Button>
          <Button variant="outline" size="lg" onClick={() => go('home')}>Back home</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px 40px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 14 }}>Start your project</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 46, margin: 0, lineHeight: 1.08 }}>Tell us about your space</h1>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--sand-line)', borderRadius: 'var(--r-2xl)',
        padding: 36, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 30 }}>

        {/* rooms */}
        <Field label="Which rooms are we designing?" hint="Select all that apply">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {allRooms.map(r => {
              const on = rooms.includes(r);
              return (
                <button key={r} onClick={() => toggleRoom(r)} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  background: on ? 'var(--tan-1)' : '#fff', border: '1px solid ' + (on ? 'var(--tan-3)' : 'var(--field-border)'),
                  borderRadius: 'var(--r-md)', padding: '13px 14px', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', background: on ? 'var(--ink)' : '#fff',
                    boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--tan-3)', color: '#fff' }}>
                    {on && <Icon name="check" size={12} stroke={3.2} />}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-soft)' }}>{r}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* style */}
        <Field label="What's your style?">
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {styles.map(s => <Tag key={s} active={style === s} onClick={() => setStyle(s)}>{s}</Tag>)}
          </div>
        </Field>

        {/* budget slider */}
        <Field label="What's your budget per room?">
          <BudgetSlider value={budget} onChange={setBudget} />
        </Field>

        {/* timeline radios */}
        <Field label="When would you like to start?">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {['As soon as possible', 'In a month', 'Flexible'].map(t => (
              <button key={t} onClick={() => setTimeline(t)} style={{ display: 'flex', alignItems: 'center', gap: 10,
                background: 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', boxShadow: timeline === t ? 'inset 0 0 0 2px var(--ink)' : 'inset 0 0 0 1.5px var(--tan-3)', background: '#fff' }}>
                  {timeline === t && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ink)' }} />}</span>
                <span style={{ fontSize: 14.5, color: 'var(--ink-soft)' }}>{t}</span>
              </button>
            ))}
          </div>
        </Field>

        {/* inquiry + name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="What is your inquiry about?">
            <SelectField label="Choose one" value={inquiry} onChange={setInquiry}
              options={['Full room design', 'Refresh / restyle', 'Furniture sourcing', 'Colour & moodboard only']} />
          </Field>
          <Field label="Your name">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
              style={{ width: '100%', background: 'var(--tan-1)', border: '1px solid var(--field-border)',
                borderRadius: 10, padding: '13px 16px', fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--ink-soft)', outline: 'none' }} />
          </Field>
        </div>

        {/* info block */}
        <div style={{ background: 'var(--tan-1)', borderRadius: 'var(--r-md)', padding: '16px 18px', display: 'flex', gap: 12 }}>
          <Tick size={22} />
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)' }}>Like a particular brand?</b> Just let your designer know. Otherwise, you can
            leave it up to your designer who will be sourcing the best pieces at the best prices for your overall look.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Secure checkout</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['VISA', 'MC', 'Stripe', 'PayPal', 'Pay'].map(p => (
                <span key={p} style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 10, color: 'var(--ink-3)',
                  background: 'var(--cream-deep)', border: '1px solid var(--sand-line)', borderRadius: 5, padding: '5px 8px' }}>{p}</span>
              ))}
            </div>
          </div>
          <Button variant="dark" size="lg" iconRight="arrowRight" onClick={() => setDone(true)}>Get matched</Button>
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-4)', marginTop: 16 }}>
        Payment marks are placeholders — replace with official brand SVGs for production.</p>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <label style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{label}</label>
        {hint && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function BudgetSlider({ value, onChange }) {
  const min = 500, max = 6000;
  const pct = ((value - min) / (max - min)) * 100;
  const ref = React.useRef(null);
  const drag = e => {
    const r = ref.current.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onChange(Math.round((min + p * (max - min)) / 100) * 100);
  };
  const down = () => {
    const move = drag;
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  return (
    <div>
      <div ref={ref} onClick={drag} style={{ position: 'relative', height: 2, background: 'var(--tan-2)', borderRadius: 2, margin: '30px 8px 8px', cursor: 'pointer' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: pct + '%', background: 'var(--ink)', borderRadius: 2 }} />
        <div onMouseDown={down} style={{ position: 'absolute', left: pct + '%', top: 1, transform: 'translate(-50%,-50%)' }}>
          <div style={{ background: 'var(--ink)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 12px',
            borderRadius: 10, transform: 'translate(-50%,-26px)', whiteSpace: 'nowrap', position: 'absolute', left: '50%',
            boxShadow: 'var(--shadow-pop)' }}>${value.toLocaleString()}</div>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: 'inset 0 0 0 2px var(--ink), var(--shadow-sm)', cursor: 'grab' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', margin: '0 8px' }}>
        <span>$500</span><span>$6,000+</span>
      </div>
    </div>
  );
}

Object.assign(window, { Brief, Field, BudgetSlider });
