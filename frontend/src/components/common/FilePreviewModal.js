import React, { useEffect, useRef, useState } from "react";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let pdfJsLoadPromise = null;

function loadPdfJs() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF preview is unavailable in this environment."));
  }

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    return Promise.resolve(window.pdfjsLib);
  }

  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
          resolve(window.pdfjsLib);
          return;
        }
        reject(new Error("Failed to initialize PDF preview."));
      });
      existing.addEventListener("error", () => reject(new Error("Failed to load PDF preview.")));
      return;
    }

    const script = document.createElement("script");
    script.src = PDFJS_CDN;
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        resolve(window.pdfjsLib);
      } else {
        reject(new Error("Failed to initialize PDF preview."));
      }
    };
    script.onerror = () => reject(new Error("Failed to load PDF preview."));
    document.body.appendChild(script);
  });

  return pdfJsLoadPromise;
}

export default function FilePreviewModal({ preview, onClose }) {
  const bodyRef = useRef(null);
  const viewerRef = useRef(null);
  const pdfRef = useRef(null);

  const [pdfReady, setPdfReady] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [renderTick, setRenderTick] = useState(0);

  if (!preview) return null;

  const isPdf = preview.type === "pdf";
  const isImage = preview.type === "image";

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  useEffect(() => {
    if (!preview || !isPdf) {
      setPdfReady(false);
      setPdfError("");
      if (pdfRef.current) {
        try {
          pdfRef.current.destroy();
        } catch (_error) {
          // noop
        }
        pdfRef.current = null;
      }
      if (viewerRef.current) {
        viewerRef.current.innerHTML = "";
      }
      return undefined;
    }

    let cancelled = false;
    setPdfReady(false);
    setPdfError("");

    const initializePdf = async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({ url: preview.url });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          try {
            pdf.destroy();
          } catch (_error) {
            // noop
          }
          return;
        }
        pdfRef.current = pdf;
        setPdfReady(true);
      } catch (error) {
        if (!cancelled) {
          setPdfError(error?.message || "Unable to open PDF preview.");
        }
      }
    };

    initializePdf();

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        try {
          pdfRef.current.destroy();
        } catch (_error) {
          // noop
        }
        pdfRef.current = null;
      }
      if (viewerRef.current) {
        viewerRef.current.innerHTML = "";
      }
    };
  }, [preview, isPdf]);

  useEffect(() => {
    if (!isPdf || !pdfReady) return undefined;
    const onResize = () => setRenderTick((tick) => tick + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [isPdf, pdfReady]);

  useEffect(() => {
    if (!isPdf || !pdfReady || !pdfRef.current || !viewerRef.current || !bodyRef.current) return undefined;

    let cancelled = false;

    const renderPdfPages = async () => {
      setIsRendering(true);
      setPdfError("");
      try {
        const pdf = pdfRef.current;
        const viewer = viewerRef.current;
        viewer.innerHTML = "";

        const ratio = window.devicePixelRatio || 1;
        const availableWidth = Math.max(260, bodyRef.current.clientWidth - 18);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = availableWidth / baseViewport.width;
          const viewport = page.getViewport({ scale: fitScale });

          const pageWrap = document.createElement("div");
          pageWrap.className = "file-preview-pdf-page";

          const canvas = document.createElement("canvas");
          canvas.className = "file-preview-canvas";
          canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
          canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          pageWrap.appendChild(canvas);
          viewer.appendChild(pageWrap);

          const context = canvas.getContext("2d");
          if (!context) continue;
          context.setTransform(ratio, 0, 0, ratio, 0, 0);

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;
        }
      } catch (error) {
        if (!cancelled) {
          setPdfError(error?.message || "Unable to render PDF preview.");
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderPdfPages();

    return () => {
      cancelled = true;
    };
  }, [isPdf, pdfReady, renderTick]);

  return (
    <div className="payment-overlay" onClick={onClose}>
      <div className="payment-modal-content file-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="file-preview-modal-header">
          <h3>{preview.name}</h3>
          <button className="btn btn-secondary btn-soft-blue-action" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="file-preview-modal-body" ref={bodyRef}>
          {isPdf ? (
            <>
              {isRendering ? <div className="file-preview-message">Loading PDF...</div> : null}
              {pdfError ? <div className="file-preview-message">{pdfError}</div> : null}
              <div className="file-preview-viewer" ref={viewerRef}></div>
            </>
          ) : isImage ? (
            <img src={preview.url} alt={preview.name} className="file-preview-image" />
          ) : (
            <div className="file-preview-message">This file cannot be previewed inline. Please use Download.</div>
          )}
        </div>
      </div>
    </div>
  );
}
