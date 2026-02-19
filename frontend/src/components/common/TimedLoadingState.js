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
    <div className="loading timed-loading">
      <div className="timed-loading-spinner-row">
        <div className="spinner"></div>
        {elapsedSeconds >= 10 ? (
          <span className="timed-loading-side-note">drink water, deep breathe</span>
        ) : null}
      </div>
      <p>{baseMessage}</p>
      {elapsedSeconds >= 5 ? (
        <p className="timed-loading-extra-note">
          wait for few seconds more ... preparing your questions ... be ready
        </p>
      ) : null}
    </div>
  );
}
