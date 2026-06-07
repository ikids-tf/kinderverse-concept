import { Page } from '@/components/Page';

/* Token demo (KICKOFF PR1 deliverable).
   Verifies colors / typography / radius / shadow render from the Milray Park
   tokens. Everything below uses token-backed Tailwind utilities — no hardcoded
   color/spacing/radius/shadow. */

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col gap-t1">
      <div className={`h-16 rounded-md border border-border ${className}`} />
      <span className="text-overline text-fg-muted">{name}</span>
    </div>
  );
}

export function TokensDemoPage() {
  return (
    <Page eyebrow="DESIGN TOKENS" title="토큰 데모" description="Milray Park 디자인 시스템 토큰 적용 확인용. 색·타이포·라운드·그림자.">
      {/* Typography */}
      <section className="mb-t9">
        <h2 className="text-overline mb-t4 text-fg-muted">타이포그래피</h2>
        <div className="space-y-t4 rounded-xl border border-border bg-surface p-t6">
          <p className="text-display font-display font-semibold text-fg">Display 디스플레이</p>
          <p className="text-h1 font-display font-semibold text-fg">Heading 1 표제</p>
          <p className="text-h2 font-display font-semibold text-fg">Heading 2 표제</p>
          <p className="text-h3 font-display font-semibold text-fg">Heading 3 표제</p>
          <p className="text-h4 font-sans font-semibold text-fg">Heading 4 (그로테스크)</p>
          <p className="text-body-lg text-fg-1">Body large — 따뜻하고 단정한 본문. The quick brown fox.</p>
          <p className="text-body text-fg-1">Body — 기본 본문 텍스트입니다. 한글과 English가 섞여도 자연스럽게.</p>
          <p className="text-sm text-fg-2">Small — 보조 텍스트.</p>
          <p className="text-overline text-fg-2">OVERLINE · 트래킹 라벨</p>
        </div>
      </section>

      {/* Colors */}
      <section className="mb-t9">
        <h2 className="text-overline mb-t4 text-fg-muted">색상 (시맨틱)</h2>
        <div className="grid grid-cols-2 gap-t4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <Swatch name="bg" className="bg-bg" />
          <Swatch name="bg-deep" className="bg-bg-deep" />
          <Swatch name="surface" className="bg-surface" />
          <Swatch name="surface-2" className="bg-surface-2" />
          <Swatch name="surface-3" className="bg-surface-3" />
          <Swatch name="accent (coral)" className="bg-accent" />
          <Swatch name="accent-hover" className="bg-accent-hover" />
          <Swatch name="accent-soft" className="bg-accent-soft" />
          <Swatch name="gold" className="bg-gold" />
          <Swatch name="fg (ink)" className="bg-fg" />
          <Swatch name="success" className="bg-success" />
          <Swatch name="danger" className="bg-danger" />
        </div>
      </section>

      {/* Radius (static class names so Tailwind keeps them) */}
      <section className="mb-t9">
        <h2 className="text-overline mb-t4 text-fg-muted">라운드</h2>
        <div className="flex flex-wrap gap-t4">
          {[
            { label: 'sm', cls: 'rounded-sm' },
            { label: 'md', cls: 'rounded-md' },
            { label: 'lg', cls: 'rounded-lg' },
            { label: 'xl', cls: 'rounded-xl' },
            { label: '2xl', cls: 'rounded-2xl' },
            { label: 'pill', cls: 'rounded-pill' },
          ].map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-t1">
              <div className={`h-16 w-16 border border-border-strong bg-surface ${r.cls}`} />
              <span className="text-overline text-fg-muted">{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Shadow (static class names) */}
      <section className="mb-t9">
        <h2 className="text-overline mb-t4 text-fg-muted">그림자 / 엘리베이션</h2>
        <div className="flex flex-wrap gap-t6">
          {[
            { label: 'xs', cls: 'shadow-xs' },
            { label: 'sm', cls: 'shadow-sm' },
            { label: 'md', cls: 'shadow-md' },
            { label: 'lg', cls: 'shadow-lg' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-t2">
              <div className={`h-20 w-28 rounded-lg bg-surface ${s.cls}`} />
              <span className="text-overline text-fg-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons (signature charcoal pill + coral) */}
      <section>
        <h2 className="text-overline mb-t4 text-fg-muted">버튼</h2>
        <div className="flex flex-wrap items-center gap-t3">
          <button className="rounded-pill bg-fg px-t5 py-t3 font-sans text-sm font-semibold text-on-dark transition-colors duration-150 ease-soft hover:bg-fg-1">
            기본 (차콜 필)
          </button>
          <button className="rounded-pill bg-accent px-t5 py-t3 font-sans text-sm font-semibold text-on-accent transition-colors duration-150 ease-soft hover:bg-accent-hover">
            악센트 (코랄)
          </button>
          <button className="rounded-pill border border-border-strong bg-surface px-t5 py-t3 font-sans text-sm font-semibold text-fg transition-colors duration-150 ease-soft hover:bg-surface-2">
            보조 (아웃라인)
          </button>
          <span className="rounded-pill bg-gold px-t3 py-t1 text-overline text-fg">GOLD</span>
        </div>
      </section>
    </Page>
  );
}
