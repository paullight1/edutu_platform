export interface EdutuEvent {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string | null;
  location?: string | null;
  isOnline?: boolean | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  audience?: string | null;
  capacity?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}
