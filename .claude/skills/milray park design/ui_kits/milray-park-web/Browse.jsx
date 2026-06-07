/* Milray Park — Browse designers screen. Filter tags, search, view toggle, grid. */

function Browse({ designers, go, onOpen }) {
  const styleFilters = ['All', 'Moodboard', 'Art Deco', 'Coastal', 'Minimal', 'Japandi', 'Mid-Century'];
  const [active, setActive] = React.useState('All');
  const [view, setView] = React.useState('grid');
  const [query, setQuery] = React.useState('');
  const [budget, setBudget] = React.useState('Budget');

  let list = designers;
  if (active !== 'All' && active !== 'Moodboard') list = list.filter(d => d.styles.includes(active));
  if (query) list = list.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) || d.city.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 18 }}>
        <span style={{ cursor: 'pointer' }} onClick={() => go('home')}>Home Page</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span style={{ background: 'var(--tan-1)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontWeight: 600, color: 'var(--ink-soft)' }}>Find a designer</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, margin: '0 0 6px' }}>Find your designer</h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', margin: '0 0 26px' }}>{list.length} designers ready to bring your space to life.</p>

      {/* search row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, alignItems: 'center' }}>
        <SearchField wide placeholder="Search by name, city or style" value={query} onChange={setQuery}
          trailing={<div style={{ borderLeft: '1px solid var(--sand-line)', paddingLeft: 10 }}>
            <Tag iconRight="chevronDown" onClick={() => setBudget(budget === 'Budget' ? 'Premium' : 'Budget')}>{budget}</Tag></div>} />
        <IconButton icon="filter" />
        <div style={{ display: 'flex', background: 'var(--ink)', borderRadius: 'var(--r-pill)', padding: 5, gap: 3 }}>
          {['grid', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ width: 40, height: 34, borderRadius: 'var(--r-pill)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: view === v ? '#fff' : 'transparent', color: view === v ? 'var(--ink)' : '#fff' }}>
              <Icon name={v} size={16} color={view === v ? 'var(--ink)' : '#fff'} /></button>
          ))}
        </div>
      </div>

      {/* filter chips */}
      <div style={{ display: 'flex', gap: 9, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
        {styleFilters.map(s => <Tag key={s} active={active === s} onClick={() => setActive(s)}>{s === 'All' || s === 'Moodboard' ? s.toUpperCase() : s}</Tag>)}
        <Tag ghost iconRight="x" onClick={() => { setActive('All'); setQuery(''); }}>Clear All</Tag>
      </div>

      {/* grid */}
      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {list.map(d => <DesignerTile key={d.name} d={d} onOpen={onOpen} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(d => <DesignerRow key={d.name} d={d} onOpen={onOpen} />)}
        </div>
      )}
      {list.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink-3)' }}>No designers match those filters yet.</div>}
    </div>
  );
}

function DesignerRow({ d, onOpen }) {
  const [h, setH] = React.useState(false);
  return (
    <div onClick={() => onOpen(d)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: '#fff', border: '1px solid var(--sand-line)', borderRadius: 'var(--r-lg)', padding: 14,
        display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer', boxShadow: h ? 'var(--shadow-sm)' : 'none' }}>
      <Photo h={84} seed={d.seed} r="var(--r-md)" style={{ width: 120, flexShrink: 0 }} />
      <Avatar size={50} seed={d.seed} gold={d.tier === 'gold'} radius={12} name={d.name} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}>{d.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)', fontSize: 13, marginTop: 3 }}>
          <Icon name="mapPin" size={13} color="var(--ink-3)" />{d.city}
          {d.available && <><span style={{ color: 'var(--ink-4)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Tick size={14} /> Available now</span></>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>{d.styles.map(s => <Badge key={s}>{s}</Badge>)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Stars value={d.stars} size={15} /><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>({d.reviews})</span></div>
      <div style={{ textAlign: 'center', background: 'var(--tan-1)', borderRadius: 12, padding: '10px 16px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>${d.price}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 9, letterSpacing: '.12em', color: 'var(--ink-3)' }}>ROOM</div>
      </div>
    </div>
  );
}

Object.assign(window, { Browse, DesignerRow });
