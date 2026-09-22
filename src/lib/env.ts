/**
 * Vite inlines `import.meta.env.FOO` at build time and bakes in `undefined`
 * when the variable is absent from the build environment. Reading process.env
 * as a fallback means a value added or changed in Vercel after a build still
 * resolves at runtime instead of silently staying stale.
 *
 * Note the `||`: an existing-but-blank variable inlines as an empty string, and
 * `??` would treat that as a real value and never consult process.env.
 */
export const readEnv = (inlined: string | undefined, key: string): string | undefined => {
  const trimmed = inlined?.trim() || process.env[key]?.trim();
  return trimmed ? trimmed : undefined;
};
