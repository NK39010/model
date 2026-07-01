import { useState } from "react";
import { fileUrl } from "../../api/jobs";
import type { ResultFiles as ResultFilesType } from "../types/job";

interface ResultFilesProps {
  jobId: string;
  files?: ResultFilesType;
}

export function ResultFiles({ jobId, files }: ResultFilesProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!files || Object.keys(files).length === 0) {
    return null;
  }

  const entries = Object.entries(files);

  return (
    <>
      <button className="download-menu-button" type="button" onClick={() => setIsOpen(true)} aria-label="Open downloads">
        <span aria-hidden="true">↓</span>
        <small>Downloads</small>
      </button>
      {isOpen ? (
        <div className="download-menu-layer" role="presentation">
          <button className="download-menu-backdrop" type="button" aria-label="Close downloads" onClick={() => setIsOpen(false)} />
          <section className="download-menu" aria-label="Result files">
            <div className="download-menu-header">
              <div>
                <span>Result files</span>
                <strong>Downloads</strong>
              </div>
              <button className="compact-action" type="button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>
            <div className="download-menu-list">
              {entries.map(([label, fileName]) => (
                <a key={label} href={fileUrl(jobId, fileName)} target="_blank" rel="noreferrer">
                  <span>{label.replace(/_/g, " ")}</span>
                  <small>{fileName}</small>
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
