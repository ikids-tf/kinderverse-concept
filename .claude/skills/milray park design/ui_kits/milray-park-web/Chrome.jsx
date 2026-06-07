/* Milray Park — Header & Footer chrome. */

function Header({ nav, go }) {
  const links = [['browse', 'Find a designer'], ['how', 'How it works'], ['profile', 'Inspiration'], ['brief', 'Pricing']];
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,242,.86)',
      backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--sand-line)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 32px', display: 'flex',
        alignItems: 'center', gap: 28 }}>
        <Logo onClick={() => go('home')} />
        <nav style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {links.map(([id, label]) => (
            <button key={id} onClick={() => go(id)} style={{ background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 14.5, fontWeight: 500,
              padding: '8px 14px', borderRadius: 'var(--r-pill)', color: nav === id ? 'var(--ink)' : 'var(--ink-2)',
              background: nav === id ? 'var(--tan-1)' : 'transparent' }}>{label}</button>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>Log in</button>
          <Button variant="dark" size="sm" onClick={() => go('brief')}>Start a project</Button>
        </div>
      </div>
    </header>
  );
}

function Footer({ go }) {
  const cols = [
    ['Explore', ['Find a designer', 'How it works', 'Moodboards', 'Pricing']],
    ['Company', ['About Milray Park', 'Careers', 'Press', 'Contact']],
    ['Support', ['Help centre', 'Terms & conditions', 'Privacy', 'FAQs']],
  ];
  return (
    <footer style={{ background: 'var(--ink)', color: 'rgba(255,255,255,.72)', marginTop: 80 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 32px 40px', display: 'grid',
        gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 40 }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkle" size={15} fill="#fff" color="#fff" stroke={1} /></span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: '#fff' }}>Milray Park</span>
          </span>
          <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>
            Interior design, reimagined online. Collaborate with your designer 100% online — from
            moodboard to delivered room.</p>
        </div>
        {cols.map(([title, items]) => (
          <div key={title}>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '.12em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {items.map(i => <a key={i} href="#" onClick={e => { e.preventDefault(); go && go('browse'); }}
                style={{ color: 'rgba(255,255,255,.72)', fontSize: 14 }}>{i}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', padding: '20px 32px', maxWidth: 1200,
        margin: '0 auto', display: 'flex', justifyContent: 'space-between', fontSize: 12.5,
        color: 'rgba(255,255,255,.5)' }}>
        <span>© 2026 Milray Park. All rights reserved.</span>
        <span>Sydney · Melbourne · Online everywhere</span>
      </div>
    </footer>
  );
}

Object.assign(window, { Header, Footer });
