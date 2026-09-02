import { useRef, useState } from 'react';
import Segmented from './ui/Segmented.jsx';
import { Row, Switch } from './ui/Controls.jsx';

/**
 * Two ways to drop the background, and they are not interchangeable.
 *
 * Edges floods from the frame's border: instant, offline, exact, and blind to
 * anything without a continuous ground. Subject asks a model that has been
 * shown a great many subjects, which is the only thing that works on a
 * cluttered picture — and costs about forty megabytes fetched once, a network
 * to fetch it over, and seconds rather than milliseconds. Edges first.
 */
const CUTS = [
  { value: 'off', label: 'Keep all', hint: 'Draw the whole picture, background and all' },
  { value: 'edges', label: 'Edges', hint: 'Flood the background from the border — instant, works offline' },
  { value: 'subject', label: 'Subject', hint: 'Ask a model. Handles a cluttered photo; downloads ~40MB once' },
];

const MODES = [
  { value: 'silhouette', label: 'Silhouette', hint: 'Threshold, then trace to real outlines' },
  { value: 'tonal', label: 'Tonal', hint: 'Greys drive the marks — for photographs' },
  { value: 'edges', label: 'Edges', hint: 'Marks follow where the picture changes, not how dark it is' },
];

/** Adjustments that only exist while the source is an image. */
export default function ImagePanel({ image, settings, onSettings }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const set = (key) => (value) => onSettings({ ...settings, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          image.load(event.dataTransfer.files?.[0]);
        }}
        className={`flex items-center gap-2.5 border border-dashed px-3 py-1.5 transition ${
          dragging ? 'border-ink bg-fill' : 'border-ink/40'
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-[var(--radius-control)] bg-fill-soft px-4 py-[0.32rem] text-[0.78rem]
                     transition duration-250 ease-[var(--ease-snap)] hover:bg-fill"
        >
          {image.bitmap ? 'Replace' : 'Choose file'}
        </button>
        <span className="max-w-[10rem] truncate font-mono text-[0.68rem] text-ink-soft">
          {image.error ?? (image.name || 'or drop one here')}
        </span>
        {image.bitmap && (
          <button
            type="button"
            onClick={image.clear}
            aria-label="Remove image"
            className="text-[0.82rem] text-ink-soft transition duration-250 ease-[var(--ease-snap)] hover:text-ink"
          >
            ✕
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => image.load(event.target.files?.[0])}
        />
      </div>

      {image.bitmap && (
        <>
          <Segmented options={MODES} value={settings.mode} onChange={set('mode')} />

          {settings.mode === 'silhouette' ? (
            <>
              <Mini
                label="Threshold"
                value={settings.threshold}
                min={0.05}
                max={0.95}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={set('threshold')}
              />
              <Mini
                label="Smoothing"
                value={settings.smoothing}
                min={0}
                max={1.5}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={set('smoothing')}
              />
            </>
          ) : settings.mode === 'edges' ? (
            <>
              <Mini
                label="Detail"
                value={settings.edgeSmoothing}
                min={0.2}
                max={4}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={set('edgeSmoothing')}
              />
              <Mini
                label="Strength"
                value={settings.edgeGain}
                min={0.4}
                max={5}
                step={0.1}
                format={(v) => `${v.toFixed(1)}×`}
                onChange={set('edgeGain')}
              />
            </>
          ) : (
            <>
              <Mini
                label="Brightness"
                value={settings.brightness}
                min={-0.4}
                max={0.4}
                step={0.02}
                format={(v) => v.toFixed(2)}
                onChange={set('brightness')}
              />
              <Mini
                label="Contrast"
                value={settings.contrast}
                min={0.4}
                max={2.5}
                step={0.05}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={set('contrast')}
              />
            </>
          )}

          {/* Ahead of the mode controls in the pipeline, so it sits with them
              rather than after: whether the ground is even in the picture is a
              question you answer before deciding how to draw what is left. */}
          {/* Ahead of the mode controls in the pipeline, so it sits with them:
              whether the ground is even in the picture is a question you answer
              before deciding how to draw what is left. */}
          <Segmented
            size="sm"
            options={CUTS}
            value={settings.cutout === true ? 'edges' : settings.cutout === false ? 'off' : settings.cutout}
            onChange={set('cutout')}
          />
          {image.cutting !== null && image.cutting !== undefined && (
            <span className="font-mono text-[0.66rem] text-ink-soft">
              {image.cutting < 1
                ? `Fetching the model… ${Math.round(image.cutting * 100)}%`
                : 'Finding the subject…'}
            </span>
          )}
          {settings.cutout === 'edges' && (
            <Mini
              label="Tolerance"
              value={settings.cutTolerance}
              min={0}
              max={1}
              step={0.02}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={set('cutTolerance')}
            />
          )}
          <Switch checked={settings.invert} onChange={set('invert')} label="Invert" />
        </>
      )}
    </div>
  );
}

function Mini({ label, value, min, max, step, format, onChange }) {
  return (
    <Row label={label} value={format(value)} className="w-[230px]">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${((value - min) / (max - min)) * 100}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Row>
  );
}
