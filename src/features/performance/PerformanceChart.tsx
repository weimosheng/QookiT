import { useEffect, useRef } from "react";

interface PerformanceChartProps {
  data: number[];
  max: number;
  color?: string;
  height?: number;
  className?: string;
}

export function PerformanceChart({
  data,
  max,
  color = "#e89a4b",
  height = 60,
  className,
}: PerformanceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const w = container.clientWidth;
      const h = height;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (data.length < 2) {
        ctx.fillStyle = "rgba(120,120,120,0.4)";
        ctx.font = "11px sans-serif";
        ctx.fillText("采集中…", 8, h / 2 + 4);
        return;
      }

      const pad = 2;
      const innerW = w - pad * 2;
      const innerH = h - pad * 2;
      const stepX = innerW / (data.length - 1);
      const clampMax = max <= 0 ? 1 : max;

      const toY = (v: number) => {
        const ratio = Math.min(1, Math.max(0, v / clampMax));
        return pad + innerH * (1 - ratio);
      };

      const points = data.map((v, i) => ({ x: pad + i * stepX, y: toY(v) }));

      const grad = ctx.createLinearGradient(0, pad, 0, pad + innerH);
      grad.addColorStop(0, hexToRgba(color, 0.35));
      grad.addColorStop(1, hexToRgba(color, 0.02));

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const cpx = (prev.x + cur.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, cur.y, cur.x, cur.y);
      }
      ctx.lineTo(points[points.length - 1].x, pad + innerH);
      ctx.lineTo(points[0].x, pad + innerH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const cpx = (prev.x + cur.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, cur.y, cur.x, cur.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    draw();

    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [data, max, color, height]);

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
