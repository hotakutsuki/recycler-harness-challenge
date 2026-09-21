"use client";

import { useEffect, useRef, useState } from "react";
import { shrink } from "@/lib/shrink";

type Status = "pendiente" | "queued" | "extracting" | "needs_review" | "ready" | "committed" | "failed" | "error";

interface Photo {
  id: string;
  url: string;
  uploadedAt: string;
  status: Status;
  folio?: string | null;
  preview?: string;
}

/**
 * Capture screen.
 *
 * Designed for a phone in a yard: one big button, no login, no settings, and each
 * photo shows its own state so it is obvious what has actually arrived. Uses a file
 * input with `capture`, which opens the camera app directly — no getUserMedia, so it
 * works over plain HTTP on the local network, which matters because a yard will not
 * be setting up certificates.
 */
export interface CaptureLabels {
  button: string;
  hint: string;
  empty: string;
  uploading: string;
  failed: string;
  /** One label per pipeline status, so this component holds no Spanish of its own. */
  status: Record<string, string>;
  review: string;
}

export function Capture({ labels, locale }: { labels: CaptureLabels; locale: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reading a document takes tens of seconds, so the list polls while anything
  // is still in flight and goes quiet once everything has settled.
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/sheets");
        const data = (await response.json()) as { photos: Photo[] };
        if (cancelled) return;
        setPhotos((prev) => {
          const local = prev.filter((p) => p.status === "pendiente");
          return [...local, ...data.photos];
        });
      } catch {
        /* a failed poll is not worth showing: the next one is two seconds away */
      }
    }

    void refresh();
    const timer = setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function upload(files: FileList) {
    for (const file of Array.from(files)) {
      const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const preview = URL.createObjectURL(file);
      setPhotos((prev) => [
        { id: localId, filename: file.name, url: "", uploadedAt: new Date().toISOString(), status: "pendiente", preview },
        ...prev,
      ]);

      try {
        // Shrinking in the browser: a phone photo is several megabytes and the
        // connection at a yard is slow. 1600px wide keeps every digit readable.
        const smaller = await shrink(file);
        const form = new FormData();
        form.append("photos", smaller, file.name);

        const response = await fetch("/api/sheets", { method: "POST", body: form });
        if (!response.ok) throw new Error(await response.text());
        const { photos: saved } = (await response.json()) as { photos: Photo[] };

        setPhotos((prev) => prev.map((p) => (p.id === localId ? { ...saved[0]!, preview } : p)));
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.id === localId ? { ...p, status: "error" as const } : p)),
        );
      }
    }
  }

  return (
    <main>
        <label className="capture">
          📷 {labels.button}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <p className="hint">{labels.hint}</p>

        {photos.length === 0 ? (
          <p className="empty">{labels.empty}</p>
        ) : (
          <div className="grid">
            {photos.map((photo) => (
              <figure className="card" key={photo.id} style={{ margin: 0 }}>
                <a href={photo.status === "pendiente" ? undefined : `/revisar/${photo.id}`}>
                  <img src={photo.preview ?? photo.url} alt="" />
                </a>
                <figcaption className="meta">
                  <span>
                    {photo.folio ??
                      new Date(photo.uploadedAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </span>
                  <span className={`status ${photo.status}`}>
                    {photo.status === "pendiente"
                      ? labels.uploading
                      : (labels.status[photo.status] ?? photo.status)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

      <p className="hint" style={{ marginTop: 20 }}>
        {labels.review}
      </p>
    </main>
  );
}
