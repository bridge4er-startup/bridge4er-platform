import React, { useEffect, useState } from "react";

export default function TimedLoadingState({ baseMessage = "Loading..." }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(nextElapsed);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="loading timed-loading modern-loading-shell">
      <div className="timed-loading-pulse-row" aria-hidden="true">
        <span className="timed-loading-pulse pulse-a"></span>
        <span className="timed-loading-pulse pulse-b"></span>
        <span className="timed-loading-pulse pulse-c"></span>
      </div>
      <p className="timed-loading-title">{baseMessage}</p>
      {elapsedSeconds >= 5 ? (
        <p className="timed-loading-extra-note">
          Optimizing content stream. This should finish shortly.
        </p>
      ) : null}
    </div>
  );
}
