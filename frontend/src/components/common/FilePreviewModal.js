import React, { useEffect, useMemo, useRef, useState } from "react";

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
  const canvasRef = useRef(null);
  const pdfRef = useRef(null);

  const [pdfReady, setPdfReady] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [isRendering, setIsRendering] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);

  const isPdf = preview?.type === "pdf";
  const isImage = preview?.type === "image";

  const pageOptions = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages]
  );

  useEffect(() => {
    if (!preview) return undefined;
    const onEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [preview, onClose]);

  useEffect(() => {
    if (!preview || !isPdf) {
      setPdfReady(false);
      setPdfError("");
      setTotalPages(1);
      setCurrentPage(1);
      setPageInput("1");
      if (pdfRef.current) {
        try {
          pdfRef.current.destroy();
        } catch (_error) {
          // noop
        }
        pdfRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    setPdfReady(false);
    setPdfError("");
    setTotalPages(1);
    setCurrentPage(1);
    setPageInput("1");

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
        setTotalPages(Math.max(1, pdf.numPages || 1));
        setCurrentPage(1);
        setPageInput("1");
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
    if (!isPdf || !pdfReady || !pdfRef.current || !canvasRef.current || !viewerRef.current) return undefined;

    let cancelled = false;

    const renderPdfPage = async () => {
      setIsRendering(true);
      try {
        const pageNumber = clamp(currentPage, 1, totalPages);
        const page = await pdfRef.current.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(260, viewerRef.current.clientWidth - 8);
        const scale = availableWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        const ratio = window.devicePixelRatio || 1;

        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({
          canvasContext: context,
          viewport,
        }).promise;
      } catch (error) {
        if (!cancelled) {
          setPdfError(error?.message || "Unable to render PDF page.");
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderPdfPage();

    return () => {
      cancelled = true;
    };
  }, [isPdf, pdfReady, currentPage, totalPages, renderTick]);

  useEffect(() => {
    setImageZoom(1);
  }, [preview]);

  const goToPage = (nextPageValue) => {
    const parsed = Number.parseInt(String(nextPageValue || "").trim(), 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = clamp(parsed, 1, totalPages);
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

  const handlePageInputSubmit = () => {
    goToPage(pageInput);
  };

  const changePageBy = (step) => {
    const next = clamp(currentPage + step, 1, totalPages);
    setCurrentPage(next);
    setPageInput(String(next));
  };

  const scrollPreview = () => {
    if (!bodyRef.current) return;
    const amount = Math.max(200, Math.floor(bodyRef.current.clientHeight * 0.75));
    bodyRef.current.scrollBy({ top: amount, behavior: "smooth" });
  };

  const zoomImage = (delta) => {
    setImageZoom((prev) => clamp(Number((prev + delta).toFixed(2)), 0.3, 4));
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

        <div className="file-preview-controls">
          {isPdf ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-soft-blue-action"
                onClick={() => changePageBy(-1)}
                disabled={!pdfReady || currentPage <= 1}
              >
                Prev
              </button>
              <label className="file-preview-page-input-wrap">
                Page
                <input
                  className="file-preview-page-input"
                  type="number"
                  min="1"
                  max={String(totalPages)}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  onBlur={handlePageInputSubmit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handlePageInputSubmit();
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-soft-blue-action"
                onClick={handlePageInputSubmit}
                disabled={!pdfReady}
              >
                Go
              </button>
              <label className="file-preview-page-select-wrap">
                Select
                <select
                  className="file-preview-page-select"
                  value={String(currentPage)}
                  onChange={(event) => goToPage(event.target.value)}
                  disabled={!pdfReady}
                >
                  {pageOptions.map((page) => (
                    <option key={page} value={String(page)}>
                      {page}
                    </option>
                  ))}
                </select>
              </label>
              <span className="file-preview-page-label">
                {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-soft-blue-action"
                onClick={() => changePageBy(1)}
                disabled={!pdfReady || currentPage >= totalPages}
              >
                Next
              </button>
            </>
          ) : null}

          {isImage ? (
            <>
              <button type="button" className="btn btn-secondary btn-soft-blue-action" onClick={() => zoomImage(-0.1)}>
                Zoom -
              </button>
              <span className="file-preview-page-label">{Math.round(imageZoom * 100)}%</span>
              <button type="button" className="btn btn-secondary btn-soft-blue-action" onClick={() => zoomImage(0.1)}>
                Zoom +
              </button>
              <button type="button" className="btn btn-secondary btn-soft-blue-action" onClick={() => setImageZoom(1)}>
                Reset
              </button>
            </>
          ) : null}

          <button type="button" className="btn btn-secondary btn-soft-blue-action" onClick={scrollPreview}>
            Scroll Down
          </button>
        </div>

        <div className="file-preview-modal-body" ref={bodyRef}>
          {isPdf ? (
            <div className="file-preview-viewer" ref={viewerRef}>
              {isRendering ? <div className="file-preview-message">Rendering page...</div> : null}
              {pdfError ? <div className="file-preview-message">{pdfError}</div> : null}
              <canvas className="file-preview-canvas" ref={canvasRef}></canvas>
            </div>
          ) : null}

          {isImage ? (
            <div className="file-preview-image-wrap">
              <img
                src={preview.url}
                alt={preview.name}
                className="file-preview-image"
                style={{ transform: `scale(${imageZoom})` }}
              />
            </div>
          ) : null}

          {!isPdf && !isImage ? (
            <div className="file-preview-message">
              This file cannot be previewed inline on this device.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
