import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  /** Inline monorepo routing so published @notecms/sdk has no @notecms/routing dependency. */
  noExternal: ['@notecms/routing'],
});
