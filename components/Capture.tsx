"use client";

import { useEffect, useRef, useState } from "react";
import { shrink } from "@/lib/shrink";

interface Photo {
  id: string;
  filename: string;
  url: string;
  uploadedAt: string;
  status: "pendiente" | "subida" | "error";
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
  saved: string;
  failed: string;
  wip: string;
  wipTitle: string;
}

export function Capture({ labels, locale }: { labels: CaptureLabels; locale: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/sheets")
      .then((r) => r.json())
      .then((data: { photos: Omit<Photo, "status">[] }) =>
        setPhotos(data.photos.map((p) => ({ ...p, status: "subida" as const }))),
      )
      .catch(() => {});
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

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === localId ? { ...saved[0]!, status: "subida" as const, preview } : p,
          ),
        );
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
                <img src={photo.preview ?? photo.url} alt="Hoja de pesaje" />
                <figcaption className="meta">
                  <span>
                    {new Date(photo.uploadedAt).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className={`status ${photo.status}`}>
                    {photo.status === "pendiente"
                      ? labels.uploading
                      : photo.status === "subida"
                        ? labels.saved
                        : labels.failed}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

      <p className="note">
        <strong>{labels.wipTitle}</strong> {labels.wip}
      </p>
    </main>
  );
}
