import { ApiError } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { labelUrl } from '../api';

export async function fetchLabelHtml(recruitId: string, preview: boolean): Promise<string> {
  const response = await fetch(labelUrl(recruitId, preview), { credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string; code?: string };
    throw new ApiError(response.status, body.detail ?? ar.common.errorGeneric, body.code ?? 'error');
  }
  return response.text();
}

/** Keep bars at their physical size. Only text can shrink; never clip a legal name. */
export function fitLabelDocument(doc: Document) {
  const name = doc.querySelector<HTMLElement>('.name');
  const ids = doc.querySelector<HTMLElement>('.ids');
  if (!name || !ids || name.clientWidth === 0 || name.clientHeight === 0) throw new Error(ar.conscripts.labels.frameError);
  const fits = (element: HTMLElement) => element.scrollHeight <= element.clientHeight + 1
    && element.scrollWidth <= element.clientWidth + 1;
  for (let size = 9; size >= 6; size -= 0.5) {
    name.style.fontSize = `${size}pt`;
    if (fits(name)) break;
  }
  if (!fits(name) || !fits(ids)) throw new Error(ar.conscripts.labels.fitError);
}

export async function prepareLabelFrame(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) throw new Error(ar.conscripts.labels.frameError);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      doc.fonts?.ready ?? Promise.resolve(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error(ar.conscripts.labels.frameError)), 10_000); }),
    ]);
  } finally { clearTimeout(timeout); }
  fitLabelDocument(doc);
}

/** A browser print request cannot confirm physical output or distinguish cancellation. */
export async function printLabel(recruitId: string): Promise<void> {
  const html = await fetchLabelHtml(recruitId, false);
  await new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:50mm;height:25mm;border:0';
    const fail = (error: unknown) => { clearTimeout(timeout); frame.remove(); reject(error); };
    const timeout = setTimeout(() => fail(new Error(ar.conscripts.labels.frameError)), 20_000);
    let preparing = false;
    frame.onload = () => {
      if (preparing) return;
      preparing = true;
      void (async () => {
      await prepareLabelFrame(frame);
      const target = frame.contentWindow;
      if (!target) throw new Error(ar.conscripts.labels.frameError);
      clearTimeout(timeout);
      target.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 0), { once: true });
      target.focus();
      target.print();
      resolve();
      // Fallback for browsers that omit afterprint. Keep the document while the dialog opens.
      setTimeout(() => frame.remove(), 300_000);
    })().catch(fail); };
    frame.onerror = () => fail(new Error(ar.conscripts.labels.frameError));
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
