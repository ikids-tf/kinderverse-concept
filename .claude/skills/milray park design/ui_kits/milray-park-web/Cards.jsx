/* Milray Park — content components: designer tile, FAQ accordion, step. */

function DesignerTile({ d, onOpen }) {
  const [h, setH] = React.useState(false);
  return (
    <div onClick={() => onOpen && onOpen(d)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: '#fff', border: '1px solid var(--sand-line)', borderRadius: 'var(--r-xl)',
        overflow: 'hidden', cursor: 'pointer', transition: '.18s ease',
        boxShadow: h ? 'var(--shadow-md)' : 'var(--shadow-xs)', transform: h ? 'translateY(-3px)' : 'none' }}>
      <div style={{ position: 'relative', padding: 10 }}>
        <Photo h={188} seed={d.seed} r="var(--r-lg)" label="Room project" />
        <button style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: '50%',
          border: 'none', background: 'rgba(255,255,255,.92)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <Icon name="heart" size={18} color="var(--ink)" /></button>
        {d.available && <span style={{ position: 'absolute', bottom: 20, left: 20, display: 'inline-flex',
          alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.94)', borderRadius: 'var(--r-pill)',
          padding: '6px 12px 6px 8px', fontSize: 12, fontWeight: 600 }}>
          <Tick size={16} /> Available now</span>}
      </div>
      <div style={{ padding: '6px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar size={46} seed={d.seed} gold={d.tier === 'gold'} radius={12} name={d.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19 }}>{d.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)', fontSize: 12.5, marginTop: 2 }}>
              <Icon name="mapPin" size={13} color="var(--ink-3)" />{d.city}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Stars value={d.stars} size={15} />
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>({d.reviews})</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>${d.price}</span>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 9.5, letterSpacing: '.12em',
              color: 'var(--ink-3)', marginLeft: 5 }}>/ ROOM</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {d.styles.map(s => <Badge key={s}>{s}</Badge>)}
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div style={{ background: open ? 'var(--tan-1)' : 'var(--tan-1)', borderRadius: 'var(--r-lg)',
      padding: '20px 24px', transition: '.2s' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>{q}</span>
        <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={open ? 'minus' : 'plus'} size={20} /></span>
      </button>
      {open && <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 620 }}>{a}</p>}
    </div>
  );
}

function Step({ n, title, body, icon }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--sand-line)', borderRadius: 'var(--r-xl)', padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--coral-soft)',
          color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={22} color="var(--coral)" /></span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, color: 'var(--tan-3)' }}>0{n}</span>
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 23, margin: '22px 0 8px' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)' }}>{body}</p>
    </div>
  );
}

Object.assign(window, { DesignerTile, FaqItem, Step });
