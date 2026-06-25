import type { APIRoute } from 'astro';

export const prerender = false;

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export const GET: APIRoute = async ({ url }) => {
  const query = (url.searchParams.get('q') ?? '').trim();

  if (query.length < 3) {
    return new Response(JSON.stringify({ suggestions: [] }), {
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
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = (await response.json()) as NominatimResult[];

    const suggestions = data.map((item) => ({
      id: String(item.place_id),
      label: item.display_name,
      lat: item.lat,
      lon: item.lon,
    }));

    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Location suggestion lookup failed:', error);

    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
