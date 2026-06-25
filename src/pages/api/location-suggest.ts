import type { APIRoute } from 'astro';

export const prerender = false;

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface LocationSuggestion {
  id: string;
  label: string;
  lat: string;
  lon: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const suggestionCache = new Map<string, { expiresAt: number; suggestions: LocationSuggestion[] }>();

const buildSuggestions = (data: NominatimResult[]): LocationSuggestion[] =>
  data.map((item) => ({
    id: String(item.place_id),
    label: item.display_name,
    lat: item.lat,
    lon: item.lon,
  }));

const getCachedSuggestions = (query: string): LocationSuggestion[] | null => {
  const now = Date.now();
  const cached = suggestionCache.get(query);

  if (cached && cached.expiresAt > now) {
    return cached.suggestions;
  }

  if (cached) {
    suggestionCache.delete(query);
  }

  return null;
};

const setCachedSuggestions = (query: string, suggestions: LocationSuggestion[]) => {
  suggestionCache.set(query, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    suggestions,
  });
};

const findClosestCachedPrefix = (query: string): LocationSuggestion[] | null => {
  for (let length = query.length - 1; length >= 3; length -= 1) {
    const prefix = query.slice(0, length);
    const cached = getCachedSuggestions(prefix);
    if (cached) {
      return cached;
    }
  }

  return null;
};

export const GET: APIRoute = async ({ url }) => {
  const query = (url.searchParams.get('q') ?? '').trim();
  const normalizedQuery = query.toLowerCase();

  if (query.length < 3) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cached = getCachedSuggestions(normalizedQuery);
  if (cached) {
    return new Response(JSON.stringify({ suggestions: cached }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
  nominatimUrl.searchParams.set('format', 'jsonv2');
  nominatimUrl.searchParams.set('q', query);
  nominatimUrl.searchParams.set('countrycodes', 'us');
  nominatimUrl.searchParams.set('limit', '6');
  nominatimUrl.searchParams.set('addressdetails', '0');

  try {
    const response = await fetch(nominatimUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        // Nominatim asks for identifying header info on server-side requests.
        'User-Agent': 'woodstock-farina-booking/1.0',
      },
    });

    if (!response.ok) {
      const fallback = findClosestCachedPrefix(normalizedQuery) ?? [];
      return new Response(JSON.stringify({ suggestions: fallback }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = (await response.json()) as NominatimResult[];

    const suggestions = buildSuggestions(data);
    setCachedSuggestions(normalizedQuery, suggestions);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Location suggestion lookup failed:', error);

    const fallback = findClosestCachedPrefix(normalizedQuery) ?? [];

    return new Response(JSON.stringify({ suggestions: fallback }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
