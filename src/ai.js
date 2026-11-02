// Rozpoznawanie rzutu mieszkania przez Claude (model z rozpoznawaniem obrazu).
// Wywołanie idzie prosto z przeglądarki na API Anthropic kluczem podanym przez użytkownika.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const KEY_STORAGE = 'planer-anthropic-key';
export const AI_MODEL = 'claude-opus-5-5';

export function savedKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}
export function saveKey(key) {
  try { key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE); } catch {}
}

const Pt = z.object({ x: z.number(), y: z.number() });

const FIXTURE_TYPES = [
  'kitchen_counter', 'sink', 'stove', 'fridge', 'shower', 'bathtub', 'toilet', 'washbasin',
  'washing_machine', 'stairs', 'wardrobe', 'bed', 'sofa', 'table', 'other',
];

export const PlanSchema = z.object({
  drawings: z.array(z.object({
    name: z.string().describe('Nazwa poziomu po polsku, np. "Parter", "Antresola", "Piętro"'),
    floor_elevation_cm: z.number().nullable().describe('Wysokość podłogi poziomu nad najniższym poziomem, jeśli da się ustalić; inaczej null'),
    calibration: z.object({
      origin_px: Pt.describe('Piksel obrazu, w którym leży punkt (0,0) układu w cm'),
      ref_px: Pt.describe('Piksel drugiego punktu na tej samej poziomej linii co origin, daleko od niego (np. wewnętrzny narożnik po prawej)'),
      ref_x_cm: z.number().describe('Współrzędna x (cm) punktu ref_px w układzie w cm'),
      bbox_px: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
        .describe('Prostokąt w pikselach obejmujący cały rysunek tego poziomu z wymiarami'),
    }),
    walls: z.array(z.object({
      x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
      thickness_cm: z.number(),
      exterior: z.boolean(),
    })).describe('Ściany jako odcinki osi ściany w cm'),
    openings: z.array(z.object({
      type: z.enum(['door', 'window', 'balcony_door']),
      x: z.number(), y: z.number(),
      width_cm: z.number(),
    })).describe('Drzwi i okna: środek otworu na osi ściany, w cm'),
    rooms: z.array(z.object({
      name: z.string(),
      area_m2: z.number().nullable(),
      polygon: z.array(Pt).describe('Obrys podłogi pomieszczenia (wewnętrzne lica ścian), w cm, zgodnie z ruchem wskazówek zegara'),
    })),
    fixtures: z.array(z.object({
      type: z.enum(FIXTURE_TYPES),
      x: z.number(), y: z.number(),
      width_cm: z.number(), depth_cm: z.number(),
      facing: z.enum(['up', 'down', 'left', 'right']).describe('W którą stronę rysunku skierowany jest przód (strona, z której się podchodzi)'),
      stairs_shape: z.enum(['straight', 'u_turn', 'l_turn', 'none']),
    })),
  })),
  notes: z.string().describe('Krótko po polsku: założenia i niepewności'),
});

const PROMPT = (w, h) => `Na obrazie jest rzut mieszkania (może zawierać kilka rysunków, np. parter i antresolę). Obraz ma ${w} × ${h} pikseli.
Odtwórz geometrię każdego rysunku w centymetrach, tak żeby dało się z niej zbudować model 3D.

Zasady:
- Wymiary bierz przede wszystkim z opisanych liczb na rysunku (wymiarowanie w cm) i podanej skali; proporcje rysunku traktuj pomocniczo.
- Układ współrzędnych w cm: oś x w prawo, oś y w dół (jak na obrazie). Punkt (0,0) to wewnętrzny lewy-górny narożnik obrysu mieszkania na najniższym poziomie.
  Dla wyższych poziomów (antresola, piętro) użyj TEGO SAMEGO fizycznego punktu odniesienia – dopasuj je do wspólnych ścian zewnętrznych, żeby rysunki leżały jeden nad drugim.
- Ściany: odcinki osi ściany (środek grubości) z grubością; ściany zewnętrzne zwykle 25–40 cm, działowe 8–12 cm. Narożniki łącz w osiach. Nie dziel ściany na kawałki przy drzwiach – drzwi i okna podaj osobno.
- Pomieszczenia: nazwy z opisów na rysunku (np. Pokój, Kuchnia, Łazienka, Komunikacja, Antresola), obrys po wewnętrznych licach ścian, powierzchnia z opisu jeśli jest.
- Wyposażenie narysowane na planie (szafki kuchenne, zlew, płyta, wanna/prysznic, WC, umywalka, pralka, schody) podaj jako prostokąty: środek, width_cm = wymiar wzdłuż frontu (z boku na bok, patrząc od przodu), depth_cm = od frontu do tyłu, facing = kierunek, w który zwrócony jest front.
  Ciąg szafek kuchennych podaj jako jeden kitchen_counter na każdy prosty odcinek blatu; zlew i płytę jako osobne elementy w tym ciągu (nie nakładaj ich na kitchen_counter – podziel blat).
  Schody: prostokąt całej klatki schodowej, facing = strona wejścia na pierwszy stopień, stairs_shape wg kształtu biegu.
- calibration: wskaż piksele obrazu odpowiadające punktowi (0,0) i drugiemu punktowi na tej samej linii poziomej, oraz współrzędną x tego punktu w cm. To posłuży do nałożenia obrazu pod model.
- Pomijaj sąsiednie mieszkania, klatkę schodową, plan kondygnacji w małej skali, tabelki i opisy.`;

/**
 * Wysyła obraz planu do Claude i zwraca rozpoznaną geometrię (PlanSchema).
 * imageDataUrl: data:image/jpeg;base64,... ; w, h: wymiary obrazu w px.
 */
export async function recognizePlan(apiKey, imageDataUrl, w, h, signal) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 10 * 60 * 1000 });
  const [head, data] = imageDataUrl.split(',');
  const media_type = head.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const params = {
    model: AI_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high', format: betaZodOutputFormat(PlanSchema) },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type, data } },
        { type: 'text', text: PROMPT(w, h) },
      ],
    }],
  };
  let response;
  try {
    // fallbacks: 'default' – gdy model odmówi, API samo ponowi zapytanie innym modelem
    response = await client.beta.messages.parse({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal });
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError) || !/fallback/i.test(err.message)) throw err;
    response = await client.beta.messages.parse(params, { signal });
  }
  if (response.stop_reason === 'refusal') throw new Error('model odmówił analizy tego obrazu');
  if (response.stop_reason === 'max_tokens') throw new Error('odpowiedź była za długa – spróbuj z mniejszym fragmentem planu');
  if (!response.parsed_output) throw new Error('nie udało się odczytać odpowiedzi modelu');
  return { plan: response.parsed_output, usage: response.usage, model: response.model };
}

/** Zrozumiały komunikat dla typowych błędów API. */
export function aiErrorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'nieprawidłowy klucz API';
  if (err instanceof Anthropic.PermissionDeniedError) return 'klucz API nie ma dostępu do tego modelu';
  if (err instanceof Anthropic.RateLimitError) return 'przekroczony limit zapytań – spróbuj za chwilę';
  if (err instanceof Anthropic.BadRequestError) return 'błędne zapytanie: ' + err.message;
  if (err instanceof Anthropic.APIConnectionError) return 'brak połączenia z API Anthropic';
  if (err instanceof Anthropic.APIError) return `błąd API (${err.status}): ${err.message}`;
  return err?.message ?? String(err);
}
