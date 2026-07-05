'use client';

interface SiteSwitcherProps {
  sites: { id: string; name: string }[];
  activeSiteId: string | null;
  setActiveSiteAction?: (formData: FormData) => void;
}

export default function SiteSwitcher({ sites, activeSiteId }: SiteSwitcherProps) {
  void sites;
  void activeSiteId;
  return null;
}
