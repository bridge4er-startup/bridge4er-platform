import React, { useEffect } from "react";

export default function FilePreviewModal({ preview, onClose }) {
  if (!preview) return null;

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return (
    <div className="payment-overlay" onClick={onClose}>
      <div className="payment-modal-content file-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="file-preview-modal-header">
          <h3>{preview.name}</h3>
          <button className="btn btn-secondary btn-soft-blue-action" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="file-preview-modal-body">
          {preview.type === "pdf" ? (
            <iframe title={preview.name} src={preview.url} className="file-preview-frame"></iframe>
          ) : preview.type === "image" ? (
            <img src={preview.url} alt={preview.name} className="file-preview-image" />
          ) : (
            <div className="file-preview-message">This file cannot be previewed inline. Please use Download.</div>
          )}
        </div>
      </div>
    </div>
  );
}
