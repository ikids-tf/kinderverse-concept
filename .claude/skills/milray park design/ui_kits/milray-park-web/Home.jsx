/* Milray Park — Home screen. */

function Hero({ go }) {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '56px 32px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 48, alignItems: 'center' }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--tan-1)',
            borderRadius: 'var(--r-pill)', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>
            <Icon name="sparkle" size={15} color="var(--coral)" fill="var(--coral)" stroke={1} /> 100% online eDecorating
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 58, lineHeight: 1.12,
            letterSpacing: '-0.015em', margin: '22px 0 0', color: 'var(--ink)' }}>
            Your dream room,<br />designed <span style={{ fontStyle: 'italic', color: 'var(--coral)' }}>online</span>.</h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 18, lineHeight: 1.6, color: 'var(--ink-2)',
            margin: '20px 0 0', maxWidth: 460 }}>
            On Milray Park, you collaborate with your interior designer 100% online — from first
            moodboard to the last cushion delivered to your door.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 30, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="dark" size="lg" iconRight="arrowRight" onClick={() => go('brief')}>Start your project</Button>
            <Button variant="outline" size="lg" onClick={() => go('browse')}>Browse designers</Button>
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 34 }}>
            {[['4.9★', 'Avg. designer rating'], ['12k+', 'Rooms designed'], ['100%', 'Online & flexible']].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26 }}>{n}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <Photo h={460} seed={4} r="var(--r-2xl)" label="Hero · styled living room" />
          <div style={{ position: 'absolute', bottom: 22, left: 22, right: 22, background: 'rgba(255,255,255,.94)',
            backdropFilter: 'blur(6px)', borderRadius: 'var(--r-lg)', padding: '14px 16px', display: 'flex',
            alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-md)' }}>
            <Avatar size={44} seed={1} gold radius={12} name="Mia Levin" />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>Mia is on your project</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Tick size={14} /> Moodboard ready to review</div>
            </div>
            <IconButton icon="arrowRight" size={40} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [['shield', 'Vetted, professional designers'], ['palette', 'Real moodboards & product lists'],
    ['clock', 'Work at your own pace'], ['message', 'Chat with your designer anytime']];
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {items.map(([ic, t]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--tan-1)',
            borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
            <Icon name={ic} size={22} color="var(--ink)" />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-soft)', lineHeight: 1.3 }}>{t}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    [1, 'Share your space', 'Tell us about your room, your style and your budget in a quick online brief.', 'sparkle'],
    [2, 'Meet your designer', 'Get matched with a vetted designer and collaborate 100% online.', 'user'],
    [3, 'Shop your room', 'Receive a moodboard and a shoppable product list at the best prices.', 'palette'],
  ];
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '56px 32px' }}>
      <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 40px' }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 14 }}>How it works</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 40, margin: 0, lineHeight: 1.1 }}>
          Three calm steps to a room you love</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
        {steps.map(s => <Step key={s[0]} n={s[0]} title={s[1]} body={s[2]} icon={s[3]} />)}
      </div>
    </section>
  );
}

function FeaturedDesigners({ designers, go, onOpen }) {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '.14em',
            textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 12 }}>Featured</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 36, margin: 0 }}>Designers available now</h2>
        </div>
        <Button variant="tan" iconRight="arrowRight" onClick={() => go('browse')}>See all designers</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
        {designers.slice(0, 3).map(d => <DesignerTile key={d.name} d={d} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    ['What is Milray Park?', 'Milray Park is an online eDecorating service. You brief a professional designer, share your style and budget, and collaborate 100% online — from moodboards to a shoppable product list delivered to you.'],
    ['What makes Milray Park unique?', 'On Milray Park, you collaborate with your interior designer 100% online on our easy to use eDecorating platform — no showroom visits, no pressure, just beautiful rooms at your own pace.'],
    ['How much does it cost?', 'Designers set a simple per-room price, starting from $599 / room. You see the price up front before you begin, with no hidden fees.'],
    ['Can I choose a particular brand?', 'Absolutely. Like a particular brand? Just let your designer know. Otherwise, you can leave it up to your designer who will source the best pieces at the best prices for your overall look.'],
  ];
  const [open, setOpen] = React.useState(1);
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '56px 32px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 40, margin: 0 }}>Questions, answered</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {faqs.map((f, i) => <FaqItem key={i} q={f[0]} a={f[1]} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}
      </div>
    </section>
  );
}

function CtaBand({ go }) {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ background: 'var(--ink)', borderRadius: 'var(--r-2xl)', padding: '56px 56px', position: 'relative',
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div style={{ position: 'absolute', top: -60, right: -30, width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,115,62,.4), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 42, color: '#fff', margin: 0, lineHeight: 1.1 }}>
            Ready to love coming home?</h2>
          <p style={{ color: 'rgba(255,255,255,.72)', fontSize: 17, lineHeight: 1.6, margin: '14px 0 0', maxWidth: 440 }}>
            Start your project today and get matched with a designer in minutes.</p>
        </div>
        <div style={{ position: 'relative' }}>
          <Button variant="coral" size="lg" iconRight="arrowRight" onClick={() => go('brief')}>Start your project</Button>
        </div>
      </div>
    </section>
  );
}

function Home({ designers, go, onOpen }) {
  return (
    <div>
      <Hero go={go} />
      <TrustStrip />
      <HowItWorks />
      <FeaturedDesigners designers={designers} go={go} onOpen={onOpen} />
      <FaqSection />
      <CtaBand go={go} />
    </div>
  );
}

Object.assign(window, { Home, Hero, TrustStrip, HowItWorks, FeaturedDesigners, FaqSection, CtaBand });
