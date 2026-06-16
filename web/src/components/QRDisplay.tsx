import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface Props {
  url: string;
  shortCode: string;
}

export function QRDisplay({ url, shortCode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 2 });
    }
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
  }

  return (
    <div className="qr-display">
      <canvas ref={canvasRef} />
      <p className="short-code">
        Code: <strong>{shortCode}</strong>
      </p>
      <p className="qr-hint">Scan the QR code or share the link below</p>
      <div className="link-row">
        <span className="link-text">{url.length > 60 ? url.slice(0, 60) + "…" : url}</span>
        <button onClick={copyLink}>Copy link</button>
      </div>
    </div>
  );
}
