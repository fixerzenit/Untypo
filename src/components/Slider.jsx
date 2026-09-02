import { getFamily, weightIndex } from '../lib/fonts.js';
import { formatValue } from '../lib/params.js';
import Segmented from './ui/Segmented.jsx';
import { Row } from './ui/Controls.jsx';

/**
 * One control, laid out as a single row: name, track, value.
 *
 * Reads its bounds straight from the param definition, so a new pattern's
 * controls appear with no UI work. Two kinds are special-cased: `weight`
 * indexes into the family's real static weights, because a static font only
 * exists at the weights it ships; `select` becomes a row of choices.
 */
/**
 * How far along the track the value sits.
 *
 * Chrome cannot paint a filled portion on its own, so the track's gradient is
 * given the percentage here — the only place that knows both the value and its
 * bounds. Firefox has ::-moz-range-progress and ignores this.
 */
function fillTo(value, min, max) {
  const span = max - min;
  const pct = span > 0 ? ((value - min) / span) * 100 : 0;
  return { '--fill': `${Math.max(0, Math.min(100, pct))}%` };
}

export default function Slider({ param, value, familyId, onChange, animated }) {
  const label = animated ? `▸ ${param.label}` : param.label;

  if (param.kind === 'select') {
    /**
     * A crowded choice takes two columns of the grid.
     *
     * Measured, because the guesses were wrong twice. A column leaves the
     * control exactly 152px whatever is in it, and an option needs about 75 to
     * show its word — so two fit and three do not, and it is three and not
     * five where the line falls. Clipping a word you have to read in order to
     * choose between is the one place truncation is not an acceptable answer.
     *
     * Two columns is enough for every one of them at full length and costs
     * nothing but a little of the row it shares.
     *
     * From `md` and up, which is every width where the grid has more than one
     * column. It was gated at `xl` — the three-column case — which quietly
     * left the two-column one, and at 850px a column gives the same 154px
     * while a three-way still wants 225. The number of columns changes; the
     * arithmetic that says a crowded control needs two of them does not.
     */
    const crowded = param.options.length > 2;
    return (
      <Row label={label} className={crowded ? 'md:col-span-2' : ''}>
        <Segmented
          size="sm"
          className="w-full [&>button]:flex-1"
          options={param.options}
          value={value}
          onChange={onChange}
        />
      </Row>
    );
  }

  if (param.kind === 'weight') {
    const { weights } = getFamily(familyId);
    const index = Math.max(0, weightIndex(familyId, value));
    const single = weights.length < 2;
    return (
      <Row label={label} value={String(weights[index])} hint={single ? 'only' : undefined}>
        <input
          type="range"
          min={0}
          max={Math.max(1, weights.length - 1)}
          step={1}
          value={index}
          disabled={single}
          style={fillTo(index, 0, Math.max(1, weights.length - 1))}
          onChange={(event) => onChange(weights[Number(event.target.value)])}
        />
      </Row>
    );
  }

  return (
    <Row label={label} value={formatValue(param, value)}>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        style={fillTo(value, param.min, param.max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Row>
  );
}
