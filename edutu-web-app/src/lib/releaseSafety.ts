// Feature editors can flush their existing durable drafts before refresh.
const draftSavers = new Set<() => Promise<void>>();
const edited = new Set<HTMLElement>();
const baselines = new WeakMap<HTMLElement, string>();
function controlValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) return String(element.checked);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  return element.textContent ?? '';
}
let requests = 0;
let editRevision = 0;
let installed = false;
export function releaseEditRevision() { return editRevision; }
export function registerReleaseDraftSaver(save: () => Promise<void>) {
  draftSavers.add(save);
  return () => { draftSavers.delete(save); };
}
export function refreshBlocked() {
  for (const element of edited) if (!element.isConnected) edited.delete(element);
  return requests > 0 || edited.size > 0 || Boolean(document.querySelector('[aria-busy="true"], [data-release-busy="true"]'));
}
export async function saveReleaseDrafts() {
  await Promise.all(Array.from(draftSavers, save => save()));
}
export function installReleaseSafety() {
  if (installed) return;
  installed = true;
  document.addEventListener('focusin', event => {
    if (event.target instanceof HTMLElement && !baselines.has(event.target)) baselines.set(event.target, controlValue(event.target));
  }, true);
  const trackEdit = (event: Event) => {
    editRevision++;
    const target = event.target;
    if (target instanceof HTMLElement && !target.closest('[data-release-draft-managed]')) {
      if (target.matches('input:not([type="search"]), textarea, select, [contenteditable="true"]')) {
        if (baselines.has(target) && baselines.get(target) === controlValue(target)) edited.delete(target);
        else edited.add(target);
      }
    }
  };
  document.addEventListener('input', trackEdit, true);
  document.addEventListener('change', trackEdit, true);
  // Includes uploads and in-flight reads: no reload while network work is pending.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    requests++;
    try { return await originalFetch(...args); } finally { requests--; }
  };
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    requests++;
    const done = () => { requests--; };
    this.addEventListener('loadend', done, { once: true });
    try { originalSend.call(this, body); } catch (error) {
      this.removeEventListener('loadend', done);
      done();
      throw error;
    }
  };
}
