/* Milray Park — UI primitives. Buttons, tags, badges, fields, avatars, logo. */

function Button({ variant = 'dark', size = 'md', children, icon, iconRight, onClick, style }) {
  const base = {
    fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: 'pointer', border: 'none',
    borderRadius: 'var(--r-pill)', display: 'inline-flex', alignItems: 'center', gap: 8,
    transition: '.16s ease', whiteSpace: 'nowrap',
    fontSize: size === 'sm' ? 14 : size === 'lg' ? 17 : 15,
    padding: size === 'sm' ? '10px 20px' : size === 'lg' ? '16px 32px' : '13px 26px',
  };
  const variants = {
    dark: { background: 'var(--ink)', color: '#fff' },
    coral: { background: 'var(--coral)', color: '#fff' },
    outline: { background: '#fff', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1.5px var(--ink)' },
    tan: { background: 'var(--tan-1)', color: 'var(--ink)' },
    ghost: { background: 'transparent', color: 'var(--ink)' },
  };
  const [h, setH] = React.useState(false);
  const hov = {
    dark: { background: '#2c2a26' }, coral: { background: 'var(--coral-strong)' },
    outline: { background: 'var(--cream)' }, tan: { background: 'var(--tan-2)' },
    ghost: { background: 'var(--tan-1)' },
  };
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...base, ...variants[variant], ...(h ? hov[variant] : {}), ...style }}>
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 20 : 18} />}
    </button>
  );
}

function IconButton({ icon, onClick, active, size = 46, style }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: size, height: size, borderRadius: 'var(--r-pill)', border: 'none', cursor: 'pointer',
        background: active ? 'var(--ink)' : h ? 'var(--tan-2)' : 'var(--tan-1)',
        color: active ? '#fff' : 'var(--ink)', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', transition: '.16s', ...style }}>
      <Icon name={icon} size={size * 0.42} />
    </button>
  );
}

function Tag({ children, active, ghost, onClick, icon, iconRight }) {
  const [h, setH] = React.useState(false);
  let s = { background: 'var(--tan-2)', color: 'var(--ink-soft)' };
  if (active) s = { background: 'var(--coral)', color: '#fff' };
  else if (ghost) s = { background: '#fff', color: 'var(--ink-soft)', boxShadow: 'inset 0 0 0 1.5px var(--tan-3)' };
  else if (h) s = { background: 'var(--tan-3)', color: 'var(--ink-soft)' };
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13.5, border: 'none',
        cursor: 'pointer', borderRadius: 'var(--r-pill)', padding: '9px 18px', display: 'inline-flex',
        alignItems: 'center', gap: 7, transition: '.16s', whiteSpace: 'nowrap', ...s }}>
      {icon && <Icon name={icon} size={15} />}{children}{iconRight && <Icon name={iconRight} size={15} />}
    </button>
  );
}

function Badge({ children, gold, style }) {
  return (
    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 10.5, letterSpacing: '.12em',
      whiteSpace: 'nowrap', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 6,
      background: gold ? 'var(--gold)' : 'var(--tan-1)', color: gold ? '#5a4410' : 'var(--ink-2)',
      display: 'inline-flex', alignItems: 'center', ...style }}>{children}</span>
  );
}

function SearchField({ placeholder, value, onChange, trailing, wide }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
      border: '1.5px solid var(--ink)', borderRadius: 'var(--r-pill)', padding: '12px 16px',
      flex: wide ? 1 : 'none', minWidth: 240 }}>
      <Icon name="search" size={18} color="var(--ink)" />
      <input value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
        style={{ border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 15,
          flex: 1, background: 'transparent', color: 'var(--ink)' }} />
      {trailing}
    </div>
  );
}

function SelectField({ label, value, options = [], onChange }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 10, width: '100%', background: 'var(--tan-1)',
        border: '1px solid var(--field-border)', borderRadius: 10, padding: '13px 16px', cursor: 'pointer',
        color: value ? 'var(--ink-soft)' : 'var(--ink-3)', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
        <span>{value || label}</span><Icon name="chevronDown" size={18} color="var(--ink-2)" />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff',
          borderRadius: 12, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--sand-line)',
          padding: 6, zIndex: 20 }}>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }}
              style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                color: 'var(--ink-soft)', background: o === value ? 'var(--tan-1)' : 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--tan-1)'}
              onMouseLeave={e => e.currentTarget.style.background = o === value ? 'var(--tan-1)' : 'transparent'}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Warm placeholder for real photography (interiors / rooms). Honest stand-in.
function Photo({ h = 200, r = 'var(--r-lg)', seed = 0, label, style }) {
  const grads = [
    'linear-gradient(135deg,#e7dccb,#c8b49a)',
    'linear-gradient(135deg,#d8c6b2,#b59b80)',
    'linear-gradient(135deg,#ddd2c4,#b9a489)',
    'linear-gradient(150deg,#e3d4c0,#c0a98e)',
    'linear-gradient(135deg,#cdbba6,#9c8169)',
  ];
  return (
    <div style={{ height: h, borderRadius: r, background: grads[seed % grads.length], position: 'relative',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 70% 10%, rgba(255,255,255,.28), transparent 60%)' }} />
      {label && <span style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontWeight: 600,
        fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(60,45,30,.5)' }}>{label}</span>}
    </div>
  );
}

function Avatar({ size = 56, seed = 0, gold, radius = 14, name }) {
  const grads = ['linear-gradient(135deg,#c9b9a6,#a78d76)', 'linear-gradient(135deg,#d3b9a6,#9c7d68)',
    'linear-gradient(135deg,#bdb09c,#8d7a63)', 'linear-gradient(135deg,#cdb7a3,#a07f66)'];
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2) : '';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: radius, background: grads[seed % grads.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.85)',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * 0.34 }}>{initials}</div>
      {gold && <Badge gold style={{ position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
        fontSize: 8.5, padding: '3px 7px', boxShadow: 'var(--shadow-sm)' }}>Gold</Badge>}
    </div>
  );
}

function Logo({ size = 22, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 9,
      background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: size + 6, height: size + 6, borderRadius: '50%', background: 'var(--ink)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--coral)' }}>
        <Icon name="sparkle" size={size * 0.7} fill="var(--coral)" color="var(--coral)" stroke={1} />
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size, color: 'var(--ink)',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Milray Park</span>
    </button>
  );
}

Object.assign(window, { Button, IconButton, Tag, Badge, SearchField, SelectField, Photo, Avatar, Logo });
