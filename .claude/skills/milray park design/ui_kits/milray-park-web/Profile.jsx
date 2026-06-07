/* Milray Park — Designer profile screen. */

function Profile({ d, go, onStart }) {
  const dz = d || {};
  const [tab, setTab] = React.useState('Portfolio');
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 22 }}>
        <span style={{ cursor: 'pointer' }} onClick={() => go('home')}>Home Page</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span style={{ cursor: 'pointer' }} onClick={() => go('browse')}>Find a designer</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span style={{ background: 'var(--tan-1)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontWeight: 600, color: 'var(--ink-soft)' }}>{dz.name}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 36, alignItems: 'start' }}>
        {/* left */}
        <div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
            <Avatar size={92} seed={dz.seed} gold={dz.tier === 'gold'} radius={24} name={dz.name} />
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 40, margin: 0 }}>{dz.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Stars value={dz.stars} /><span style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 600 }}>{dz.stars}.0</span><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>· {dz.reviews} reviews</span></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, color: 'var(--ink-2)' }}><Icon name="mapPin" size={14} color="var(--ink-3)" />{dz.city}</span>
                {dz.available && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600 }}><Tick size={16} /> Available now</span>}
              </div>
            </div>
          </div>

          <p style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '24px 0 0', maxWidth: 640 }}>
            On <span style={{ color: 'var(--coral)', fontWeight: 600 }}>Milray Park</span>, you collaborate with {dz.name} 100% online.
            Specialising in {(dz.styles || []).join(', ').toLowerCase()} interiors, {(dz.name || '').split(' ')[0]} crafts
            calm, considered rooms — <span style={{ color: 'var(--coral)', fontWeight: 600 }}>highly professional</span> from
            first moodboard to final styling.</p>

          {/* tabs */}
          <div style={{ display: 'inline-flex', background: 'var(--ink)', borderRadius: 'var(--r-pill)', padding: 5, gap: 3, margin: '28px 0 22px' }}>
            {['Portfolio', 'Moodboards', 'Reviews'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 22px', borderRadius: 'var(--r-pill)',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14,
                background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ink)' : '#fff' }}>{t}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            {[0, 1, 2, 3].map(i => <Photo key={i} h={i % 2 ? 220 : 180} seed={(dz.seed || 0) + i} label={tab === 'Moodboards' ? 'Moodboard' : 'Project'} />)}
          </div>
        </div>

        {/* right — booking card */}
        <aside style={{ position: 'sticky', top: 92 }}>
          <div style={{ background: '#fff', border: '1px solid var(--sand-line)', borderRadius: 'var(--r-xl)',
            padding: 24, boxShadow: 'var(--shadow-md)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34 }}>${dz.price}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '.12em', color: 'var(--ink-3)' }}>/ ROOM</span>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', margin: '4px 0 18px' }}>Flat per-room price. No hidden fees.</p>
            <Button variant="dark" size="lg" style={{ width: '100%', justifyContent: 'center' }} iconRight="arrowRight" onClick={onStart}>Start your project</Button>
            <Button variant="tan" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} icon="message">Message {(dz.name || '').split(' ')[0]}</Button>

            <div style={{ borderTop: '1px solid var(--sand-line)', margin: '20px 0', paddingTop: 18 }}>
              <div style={{ background: 'var(--tan-1)', borderRadius: 'var(--r-md)', padding: '14px 16px', display: 'flex', gap: 12 }}>
                <Tick size={22} />
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                  <b style={{ color: 'var(--ink)' }}>Like a particular brand?</b> Just let your designer know. Otherwise,
                  leave it to {(dz.name || '').split(' ')[0]} to source the best pieces at the best prices.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--ink-3)' }}>Avg. turnaround</span><span style={{ fontWeight: 600 }}>5–7 days</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10 }}>
              <span style={{ color: 'var(--ink-3)' }}>Revisions</span><span style={{ fontWeight: 600 }}>Unlimited</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { Profile });
