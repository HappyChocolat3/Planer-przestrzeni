// Wczytywanie rzutu mieszkania z pliku JPG/PNG/WebP/PDF jako podkładu do rysowania.
const MAX = 3200; // maks. bok obrazu w pikselach

function canvasToDataUrl(c) {
  // białe tło (PDF/PNG z przezroczystością), JPEG = mały plik
  const out = document.createElement('canvas');
  out.width = c.width;
  out.height = c.height;
  const g = out.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(c, 0, 0);
  return { src: out.toDataURL('image/jpeg', 0.88), w: out.width, h: out.height };
}

async function fromImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, err) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => err(new Error('Nie można odczytać obrazu'));
      i.src = url;
    });
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return canvasToDataUrl(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let pdfjsPromise;
async function pdfjs() {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

/** Otwiera PDF; zwraca { pages, render(n) }. */
export async function openPdf(file) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return {
    pages: pdf.numPages,
    async render(n) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX / Math.max(base.width, base.height), 6);
      const viewport = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport, background: '#ffffff' }).promise;
      return canvasToDataUrl(c);
    },
    async thumb(n) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 220 / Math.max(base.width, base.height) });
      const c = document.createElement('canvas');
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport, background: '#ffffff' }).promise;
      return c.toDataURL('image/png');
    },
  };
}

export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export { fromImage as imageToPlan };
