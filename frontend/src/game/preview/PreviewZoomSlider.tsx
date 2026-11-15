import "./previewZoomSlider.css";

export function PreviewZoomSlider({ label, min, max, step, value, valueText, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText: string;
  onChange: (value: number) => void;
}) {
  return <input className="preview-zoom-slider" type="range" aria-label={label} aria-orientation="vertical"
    aria-valuetext={valueText} title={`${label} · ${valueText}`} min={min} max={max} step={step} value={value}
    onChange={event => onChange(event.currentTarget.valueAsNumber)} />;
}
