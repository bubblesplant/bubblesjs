import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Action = {
  text: string;
  href: string;
  variant?: string;
};

type HomeFeature = {
  title: string;
  details: string;
};

type HomeHero = {
  name: string;
  text: string;
  tagline: string;
  image: {
    src: string;
    alt: string;
  };
  actions: Action[];
};

type OverviewItem = {
  title: ReactNode;
  description: ReactNode;
  href?: string;
};

type DetailItem = {
  title: ReactNode;
  intro?: ReactNode;
  points?: ReactNode[];
};

type CommandBlock = {
  commands: string[];
};

function isExternalLink(href: string) {
  return /^https?:\/\//.test(href);
}

function resolveAssetPath(src: string) {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';

  return `${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}`;
}

function ActionButton({ action }: { action: Action }) {
  const variant = action.variant === 'outline' ? 'outline' : 'default';

  return (
    <Button asChild variant={variant} size="lg">
      <a
        href={action.href}
        target={isExternalLink(action.href) ? '_blank' : undefined}
        rel={isExternalLink(action.href) ? 'noreferrer' : undefined}
      >
        {action.text}
      </a>
    </Button>
  );
}

export function DocsHome({
  hero,
  features,
}: {
  hero: HomeHero;
  features: HomeFeature[];
}) {
  return (
    <main className="docs-home rp-not-doc">
      <section className="docs-home__hero">
        <div className="docs-home__copy">
          <p className="docs-home__eyebrow">{hero.name}</p>
          <h1>{hero.text}</h1>
          <p className="docs-home__tagline">{hero.tagline}</p>
          <div className="docs-home__actions">
            {hero.actions.map(action => (
              <ActionButton key={`${action.text}-${action.href}`} action={action} />
            ))}
          </div>
        </div>
        <div className="docs-home__visual" aria-hidden="true">
          <img src={resolveAssetPath(hero.image.src)} alt={hero.image.alt} />
        </div>
      </section>

      <section className="docs-home__features" aria-label={hero.name}>
        {features.map(feature => (
          <article className="docs-home__feature" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.details}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export function OverviewGrid({
  items,
  compact = false,
}: {
  items: OverviewItem[];
  compact?: boolean;
}) {
  return (
    <div className={cn('docs-overview-grid rp-not-doc', compact && 'docs-overview-grid--compact')}>
      {items.map((item, index) => {
        const content = (
          <>
            <span className="docs-overview-grid__index">{String(index + 1).padStart(2, '0')}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </>
        );

        return item.href ? (
          <a className="docs-overview-card" href={item.href} key={`${index}-${item.href}`}>
            {content}
          </a>
        ) : (
          <article className="docs-overview-card" key={`${index}-${String(item.title)}`}>
            {content}
          </article>
        );
      })}
    </div>
  );
}

export function GuideList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="docs-guide-list rp-not-doc">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

export function StackList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="docs-stack-list rp-not-doc">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function DetailGrid({ items }: { items: DetailItem[] }) {
  return (
    <div className="docs-detail-grid rp-not-doc">
      {items.map(item => (
        <section className="docs-detail-card" key={String(item.title)}>
          <h3>{item.title}</h3>
          {item.intro ? <p>{item.intro}</p> : null}
          {item.points?.length ? (
            <ul>
              {item.points.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function CommandPanel({ commands }: CommandBlock) {
  return (
    <pre className="docs-command-panel rp-not-doc">
      <code>{commands.join('\n')}</code>
    </pre>
  );
}
