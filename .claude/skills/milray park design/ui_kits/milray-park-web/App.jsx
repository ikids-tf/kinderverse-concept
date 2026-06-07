/* Milray Park — App shell: designer data + screen router. */

const DESIGNERS = [
  { name: 'Jane Cooper', city: 'Sydney', stars: 4, reviews: 128, price: 599, tier: 'gold', available: true, seed: 0, styles: ['Art Deco', 'Coastal'] },
  { name: 'Mia Levin', city: 'Melbourne', stars: 5, reviews: 214, price: 749, tier: 'gold', available: true, seed: 1, styles: ['Minimal', 'Japandi'] },
  { name: 'Theo Marsh', city: 'Brisbane', stars: 5, reviews: 96, price: 690, tier: 'silver', available: true, seed: 2, styles: ['Mid-Century', 'Coastal'] },
  { name: 'Aria Bennett', city: 'Perth', stars: 4, reviews: 73, price: 549, tier: 'silver', available: false, seed: 3, styles: ['Japandi', 'Minimal'] },
  { name: 'Noah Whitfield', city: 'Sydney', stars: 5, reviews: 187, price: 820, tier: 'gold', available: true, seed: 4, styles: ['Art Deco', 'Mid-Century'] },
  { name: 'Leila Hart', city: 'Adelaide', stars: 4, reviews: 54, price: 520, tier: 'silver', available: true, seed: 2, styles: ['Coastal', 'Minimal'] },
];

function App() {
  const [nav, setNav] = React.useState('home');
  const [active, setActive] = React.useState(DESIGNERS[0]);
  const go = (screen) => { setNav(screen); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const openDesigner = (d) => { setActive(d); go('profile'); };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header nav={nav} go={go} />
      {nav === 'home' && <Home designers={DESIGNERS} go={go} onOpen={openDesigner} />}
      {nav === 'browse' && <Browse designers={DESIGNERS} go={go} onOpen={openDesigner} />}
      {nav === 'how' && <Browse designers={DESIGNERS} go={go} onOpen={openDesigner} />}
      {nav === 'profile' && <Profile d={active} go={go} onStart={() => go('brief')} />}
      {nav === 'brief' && <Brief go={go} />}
      <Footer go={go} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
