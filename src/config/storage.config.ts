import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  /**
   * Where uploaded logos, wall photographs and seeded presets live.
   *
   * Served read-only at /static. Proof panels already write under the same
   * root (see `app.proofDir`), so one directory is the whole of what a
   * deployment has to persist between restarts.
   */
  dir: process.env.STORAGE_DIR ?? './storage',
}));
