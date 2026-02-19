import React, { useEffect, useRef, useState } from "react";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let pdfJsLoadPromise = null;

function loadPdfJs() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF renderer is unavailable in this environment."));
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
        } else {
          reject(new Error("PDF renderer did not initialize."));
        }
      });
      existing.addEventListener("error", () => reject(new Error("Failed to load PDF renderer.")));
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
        reject(new Error("PDF renderer did not initialize."));
      }
    };
    script.onerror = () => reject(new Error("Failed to load PDF renderer."));
    document.body.appendChild(script);
  });

  return pdfJsLoadPromise;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function FilePreviewModal({ preview, onClose }) {
  const bodyRef = useRef(null);
  const viewerRef = useRef(null);
  const pdfRef = useRef(null);
  const pinchRef = useRef({ distance: null });

  const [pdfReady, setPdfReady] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [imageZoom, setImageZoom] = useState(1);

  const isPdf = preview?.type === "pdf";
  const isImage = preview?.type === "image";

  useEffect(() => {
    if (!preview) return undefined;
    const onEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [preview, onClose]);

  useEffect(() => {
    setPdfZoom(1);
    setImageZoom(1);
  }, [preview]);

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

    const loadPdf = async () => {
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
        setPdfError(error?.message || "Unable to render PDF on this device.");
      }
    };

    loadPdf();

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

    const renderAllPages = async () => {
      setIsRendering(true);
      setPdfError("");

      try {
        const pdf = pdfRef.current;
        const viewer = viewerRef.current;
        viewer.innerHTML = "";

        const ratio = window.devicePixelRatio || 1;
        const availableWidth = Math.max(260, bodyRef.current.clientWidth - 24);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const fitWidthScale = availableWidth / baseViewport.width;
          const viewport = page.getViewport({ scale: fitWidthScale * pdfZoom });

          const pageWrap = document.createElement("div");
          pageWrap.className = "file-preview-pdf-page";
          pageWrap.setAttribute("data-page", String(pageNumber));

          const canvas = document.createElement("canvas");
          canvas.className = "file-preview-canvas";
          canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
          canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          pageWrap.appendChild(canvas);
          viewer.appendChild(pageWrap);

          const context = canvas.getContext("2d");
          context.setTransform(ratio, 0, 0, ratio, 0, 0);

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;
        }
      } catch (error) {
        if (!cancelled) {
          setPdfError(error?.message || "Unable to render PDF pages.");
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderAllPages();

    return () => {
      cancelled = true;
    };
  }, [isPdf, pdfReady, pdfZoom, renderTick]);

  const zoomPdf = (delta) => {
    setPdfZoom((prev) => clamp(Number((prev + delta).toFixed(2)), 0.6, 3));
  };

  const zoomImage = (delta) => {
    setImageZoom((prev) => clamp(Number((prev + delta).toFixed(2)), 0.3, 4));
  };

  const getTouchDistance = (touches) => {
    if (!touches || touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (event) => {
    pinchRef.current.distance = getTouchDistance(event.touches);
  };

  const handleTouchMove = (event) => {
    if (!event.touches || event.touches.length < 2) return;
    const previous = pinchRef.current.distance;
    const current = getTouchDistance(event.touches);
    if (!previous || !current) return;

    const ratioDelta = (current - previous) / previous;
    const zoomDelta = ratioDelta * 0.6;
    if (Math.abs(zoomDelta) < 0.005) return;

    event.preventDefault();
    if (isPdf) {
      zoomPdf(zoomDelta);
    } else if (isImage) {
      zoomImage(zoomDelta);
    }
    pinchRef.current.distance = current;
  };

  const handleTouchEnd = () => {
    pinchRef.current.distance = null;
  };

  const handleWheelZoom = (event) => {
    if (event.shiftKey) return;
    event.preventDefault();

    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    if (isPdf) {
      zoomPdf(delta);
    } else if (isImage) {
      zoomImage(delta);
    }
  };

  if (!preview) return null;

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
              {isRendering ? <div className="file-preview-message">Rendering document...</div> : null}
              {pdfError ? <div className="file-preview-message">{pdfError}</div> : null}
              <div
                className="file-preview-viewer"
                ref={viewerRef}
                onWheel={handleWheelZoom}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
              ></div>
            </>
          ) : null}

          {isImage ? (
            <div
              className="file-preview-image-wrap"
              onWheel={handleWheelZoom}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              <img
                src={preview.url}
                alt={preview.name}
                className="file-preview-image"
                style={{ transform: `scale(${imageZoom})` }}
              />
            </div>
          ) : null}

          {!isPdf && !isImage ? (
            <div className="file-preview-message">This file cannot be previewed inline on this device.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
