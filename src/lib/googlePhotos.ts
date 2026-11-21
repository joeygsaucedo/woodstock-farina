/**
 * Gallery photos, read live from the owner's shared Google Photos albums.
 *
 * The owner manages the gallery by adding or removing photos in these albums;
 * no code change or deploy is needed. To add a category, share a new album
 * ("Share" -> "Create link") and add an entry below.
 *
 * Google retired API access to shared albums in March 2025, so this reads the
 * public album page and pulls the photo entries out of its embedded data. It is
 * not an official interface: if Google changes the page, an album reads as
 * empty and the gallery falls back to the bundled photos in FALLBACK_PHOTOS.
 */

export interface GalleryCategory {
  /** Stable slug used for filtering. */
  id: string;
  /** Label shown on the filter button. */
  label: string;
  /** Short line shown under the filter buttons when this category is active. */
  blurb: string;
  /** Public share link for the Google Photos album. */
  albumUrl: string;
}

export interface GalleryPhoto {
  id: string;
  category: string;
  /** Base image URL; append a size such as `=w800` before use (see photoSrc). */
  baseUrl: string;
  width: number;
  height: number;
}

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  {
    id: 'weddings',
    label: 'Weddings',
    blurb: 'Wood-fired pizza for receptions, rehearsal dinners, and late-night bites.',
    albumUrl: 'https://photos.app.goo.gl/MVFSaB5k8uaYDTbR6',
  },
  {
    id: 'corporate',
    label: 'Corporate & Festivals',
    blurb: 'Company parties, team events, and festival crowds served hot from the oven.',
    albumUrl: 'https://photos.app.goo.gl/2zkmKwNt8WebUbHNA',
  },
  {
    id: 'celebrations',
    label: 'Celebrations',
    blurb: 'Birthdays, graduations, anniversaries, and every milestone in between.',
    albumUrl: 'https://photos.app.goo.gl/Pu8iroAuBht2jFbd6',
  },
  {
    id: 'backyard',
    label: 'Backyard Gatherings',
    blurb: 'Intimate get-togethers at home, with the oven fired up in your own backyard.',
    albumUrl: 'https://photos.app.goo.gl/cXzfjKQaP8dumuJs6',
  },
  {
    id: 'beyond-pizza',
    label: 'Beyond Pizza',
    blurb: 'Salads, appetizers, desserts, and more to round out the menu.',
    albumUrl: 'https://photos.app.goo.gl/CuMzhonq3PcxVqPM7',
  },
];

/** Shown for a category only when its album could not be read. */
const FALLBACK_PHOTOS: Record<string, string[]> = {
  weddings: ['wedding-1', 'wedding-2', 'wedding-3', 'wedding-4'],
  corporate: ['corporate-1', 'corporate-2', 'corporate-3', 'corporate-4'],
  celebrations: ['party-1', 'party-2', 'party-3', 'party-4'],
};

/** Each photo entry in the page data: ["AF1Qip…",["https://lh3…/pw/…",width,height */
const PHOTO_ENTRY =
  /\["(AF1Qip[\w-]+)",\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[\w-]+)",(\d+),(\d+)/g;

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const cache = new Map<string, { at: number; photos: GalleryPhoto[] }>();

async function fetchAlbum(category: GalleryCategory): Promise<GalleryPhoto[]> {
  const res = await fetch(category.albumUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();

  const seen = new Set<string>();
  const photos: GalleryPhoto[] = [];
  for (const match of html.matchAll(PHOTO_ENTRY)) {
    const [, id, baseUrl, width, height] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    photos.push({
      id,
      category: category.id,
      baseUrl,
      width: Number(width),
      height: Number(height),
    });
  }
  return photos;
}

async function getAlbumPhotos(category: GalleryCategory): Promise<GalleryPhoto[]> {
  const cached = cache.get(category.id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.photos;
  }

  try {
    const photos = await fetchAlbum(category);
    if (photos.length === 0) {
      throw new Error('no photos found in album page');
    }
    cache.set(category.id, { at: Date.now(), photos });
    return photos;
  } catch (err) {
    console.error(`[gallery] could not read album "${category.label}":`, err);
    // A stale copy beats an empty grid.
    if (cached) return cached.photos;
    return (FALLBACK_PHOTOS[category.id] ?? []).map((name) => ({
      id: `local-${name}`,
      category: category.id,
      baseUrl: `/images/events/${name}.jpg`,
      width: 0,
      height: 0,
    }));
  }
}

export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  const albums = await Promise.all(GALLERY_CATEGORIES.map(getAlbumPhotos));
  return albums.flat();
}

/** Sized image URL. Google serves any width on request; local fallbacks ignore it. */
export function photoSrc(photo: GalleryPhoto, width: number): string {
  if (!photo.baseUrl.startsWith('https://lh3.googleusercontent.com/')) {
    return photo.baseUrl;
  }
  return `${photo.baseUrl}=w${width}`;
}
