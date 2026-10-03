import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { UserCV } from "./types";
import { createCVPdf, cvPdfFilename } from "./pdf";
import { errorMessage } from "../workspace/shared";

/** Prepare ahead of the click so mobile browsers keep the user's download gesture. */
export function CvPdfDownload({ cv }: { cv: Partial<UserCV> }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setUrl(""); setError("");
    void createCVPdf(cv).then(doc => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(doc.output("blob"));
      setUrl(objectUrl);
    }).catch(e => { if (!disposed) setError(errorMessage(e)); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [cv, retry]);
  if (error) return <div role="alert"><p>{error}</p><button className="feature-button secondary" onClick={() => setRetry(value => value + 1)}>Retry PDF</button></div>;
  return url ? <a className="feature-button" href={url} download={cvPdfFilename(cv.name)}><Download size={16}/> Download PDF</a> : <button className="feature-button" disabled>Preparing PDF…</button>;
}
