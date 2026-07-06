import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

/**
 * Thin React wrapper around Quill 2.
 *
 * We talk to Quill directly through a ref instead of using `react-quill`, which
 * is unmaintained and calls `ReactDOM.findDOMNode` — removed in React 19, so it
 * throws the instant it mounts (that was the blank blog editor). This wrapper
 * uses only DOM refs and effects, so it is React 19 / StrictMode safe.
 */
export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Optional: upload an inline image and return its public URL. */
  onImageUpload?: (file: File) => Promise<string>;
}

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  ['blockquote', 'code-block'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  ['link', 'image', 'video'],
  ['clean'],
];

// Quill represents an empty document as "<p><br></p>". Normalise it to an empty
// string so callers can do truthy "is there content?" checks.
function normalizeHtml(html: string): string {
  return html === '<p><br></p>' ? '' : html;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  onImageUpload,
}: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  // Keep the latest callbacks in refs so the init effect can stay run-once
  // without going stale.
  const onChangeRef = useRef(onChange);
  const onImageUploadRef = useRef(onImageUpload);
  onChangeRef.current = onChange;
  onImageUploadRef.current = onImageUpload;

  useEffect(() => {
    const host = containerRef.current;
    if (!host || quillRef.current) return;

    // Quill owns the element it mounts into, so give it its own child rather
    // than the React-managed host node.
    const editorEl = document.createElement('div');
    host.appendChild(editorEl);

    const imageHandler = () => {
      const upload = onImageUploadRef.current;
      if (!upload) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const url = await upload(file);
          const quill = quillRef.current;
          const range = quill?.getSelection(true);
          quill?.insertEmbed(range?.index ?? 0, 'image', url, 'user');
          quill?.setSelection((range?.index ?? 0) + 1, 0);
        } catch (error) {
          console.error('Inline image upload failed:', error);
          alert('Could not upload image. Please try again.');
        }
      };
      input.click();
    };

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: {
          container: TOOLBAR,
          handlers: onImageUploadRef.current ? { image: imageHandler } : {},
        },
        clipboard: { matchVisual: false },
      },
    });
    quillRef.current = quill;

    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }

    const handleTextChange = () => {
      onChangeRef.current(normalizeHtml(quill.root.innerHTML));
    };
    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
      quillRef.current = null;
      host.innerHTML = '';
    };
    // Init once. External value changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect programmatic value changes (e.g. loading a post to edit) into the
  // editor. During normal typing `value` already equals the editor's HTML, so
  // this is a no-op and the caret is never disturbed.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    if (value === normalizeHtml(quill.root.innerHTML)) return;
    quill.clipboard.dangerouslyPasteHTML(value || '');
  }, [value]);

  return <div ref={containerRef} />;
}
