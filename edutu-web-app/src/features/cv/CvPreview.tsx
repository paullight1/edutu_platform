import { useEffect, useRef, useState } from "react";
import type { UserCV } from "./types";
import { buildCVText } from "./export";
import { createCVPdf } from "./pdf";
import { errorMessage } from "../workspace/shared";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Render the actual downloadable PDF on mobile too, without relying on a browser PDF plugin. */
export function CvPreview({ cv, title = "CV preview" }: { cv: Partial<UserCV>; title?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    setLoading(true); setError(""); setPages([]);
    async function render() {
      const [doc, pdfjs] = await Promise.all([createCVPdf(cv), import("pdfjs-dist")]);
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")) });
      cleanup = () => { void task.destroy(); };
      const pdf = await task.promise;
      const result: HTMLCanvasElement[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        if (disposed) return;
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${title}, page ${number} of ${pdf.numPages}`);
        await page.render({ canvas, viewport }).promise;
        result.push(canvas);
      }
      if (!disposed) { setPages(result); setLoading(false); }
    }
    void render().catch(e => { if (!disposed) { setError(errorMessage(e)); setLoading(false); } });
    return () => { disposed = true; cleanup(); };
  }, [cv, title, retry]);
  useEffect(() => { container.current?.replaceChildren(...pages); }, [pages]);
  return <div className="cv-pdf-preview" aria-label={title}>
    {loading && <p className="feature-muted" role="status">Preparing preview…</p>}
    {error && <div role="alert"><p>{error}</p><button className="feature-button secondary" onClick={() => setRetry(value => value + 1)}>Retry preview</button></div>}
    <pre className="sr-only">{buildCVText(cv)}</pre>
    <div className="cv-pdf-pages" ref={container}/>
    {!!pages.length && <p className="cv-preview-caption">{pages.length} {pages.length === 1 ? "page" : "pages"} · A4 PDF</p>}
  </div>;
}
