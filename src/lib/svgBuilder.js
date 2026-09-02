import { num } from './patterns/helpers.js';
import { STILL } from './motion.js';

/**
 * The single source of truth for rendering. The live preview injects this
 * string, `Download SVG` writes it to disk, and `Download PNG` rasterises it —
 * so a card's preview and its two exports can never drift apart.
 *
 * @param sized  false for the preview (fills its container), true for export
 *               (explicit px dimensions, which Firefox needs to rasterise an
 *               SVG in an <img>, and which give Illustrator a real artboard)
 */
export function buildSVG({
  geo,
  pattern,
  params,
  fg,
  bg,
  transparent,
  uid,
  font,
  fx = STILL,
  sized = false,
}) {
  const ids = { clip: `clip-${uid}`, pattern: `pat-${uid}` };
  const { defs = '', body = '', clip = true } = pattern.render({
    p: params,
    geo,
    fg,
    bg,
    ids,
    fx,
    font,
  });

  const clipDef = clip ? `<clipPath id="${ids.clip}"><path d="${geo.d}"/></clipPath>` : '';

  const background = transparent
    ? ''
    : `<rect x="${num(geo.box.x)}" y="${num(geo.box.y)}" width="${num(geo.box.width)}" height="${num(geo.box.height)}" fill="${bg}"/>`;

  const content = clip ? `<g clip-path="url(#${ids.clip})">${body}</g>` : body;

  const dimensions = sized
    ? `width="${num(geo.box.width)}" height="${num(geo.box.height)}"`
    : 'width="100%" height="100%"';

  const definitions = clipDef || defs ? `<defs>${clipDef}${defs}</defs>` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geo.viewBox}" ${dimensions} ` +
    `preserveAspectRatio="xMidYMid meet">${definitions}${background}${content}</svg>`
  );
}
