/**
 * Two-colour pairs, ready to hand.
 *
 * The app draws in exactly two colours, so a palette here is a pair rather
 * than a ramp — which makes them cheap to offer and easy to judge: what you
 * see in the swatch is the whole thing.
 *
 * Every pair is chosen for contrast first. A generative pattern is mostly
 * edges, and edges are the first thing to go when two colours sit close
 * together in value; a pair that looks handsome as two flat rectangles can
 * turn a field of hairlines into mud.
 */
export const PALETTES = [
  { id: 'ink', name: 'Ink', fg: '#111111', bg: '#d2d2d2' },
  { id: 'newsprint', name: 'Newsprint', fg: '#1a1a1a', bg: '#e8e4d9' },
  { id: 'blueprint', name: 'Blueprint', fg: '#d7e4f5', bg: '#12305c' },
  { id: 'neon', name: 'Neon', fg: '#22d3ff', bg: '#04070d' },
  { id: 'riso', name: 'Riso', fg: '#ff4a3d', bg: '#f4efe4' },
  { id: 'terminal', name: 'Terminal', fg: '#35ff8b', bg: '#06120b' },
  { id: 'sepia', name: 'Sepia', fg: '#3a2a1a', bg: '#e5d3b3' },
  { id: 'punch', name: 'Punch', fg: '#ff2d78', bg: '#101014' },
  { id: 'chalk', name: 'Chalk', fg: '#f2f2f0', bg: '#1e1f22' },
  { id: 'amber', name: 'Amber', fg: '#ffb020', bg: '#150e05' },
];
