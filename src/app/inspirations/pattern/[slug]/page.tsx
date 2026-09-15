import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PatternDetailView } from '@/components/inspirations/views/PatternDetailView';
import { inspirationsApi } from '@/lib/inspirations/api';
import { PATTERNS } from '@/lib/inspirations/data/build';

export function generateStaticParams() {
  return PATTERNS.map((pattern) => ({ slug: pattern.slug }));
}

export async function generateMetadata({ params }: PageProps<'/inspirations/pattern/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const pattern = await inspirationsApi.getPattern(slug);
  if (!pattern) return {};
  return { title: `${pattern.name} — ${pattern.category} patterns — Motvin Inspirations`, description: pattern.description };
}

export default async function PatternDetailPage({ params }: PageProps<'/inspirations/pattern/[slug]'>) {
  const { slug } = await params;
  const pattern = await inspirationsApi.getPattern(slug);
  if (!pattern) notFound();
  return <PatternDetailView pattern={pattern} />;
}
