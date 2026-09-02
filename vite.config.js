import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The dev port.
 *
 * 5176 is what the README tells you to open and what a second copy of this
 * project will already be sitting on, so it is a preference rather than a
 * requirement: nothing here depends on the number. There is no OAuth callback
 * to match, no webhook registered against it and no CORS allowlist naming it.
 *
 * `strictPort` follows from that. When something has assigned a port through
 * the environment it has already found a free one and expects the server
 * exactly there, so a clash is a real error and should say so. Run by hand
 * with no assignment, the honest behaviour is to take the next port along
 * rather than refuse to start because another window got here first.
 */
const assigned = Number(process.env.PORT);
const port = Number.isFinite(assigned) && assigned > 0 ? assigned : 5176;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port,
    strictPort: port === assigned,
  },
});
