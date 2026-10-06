/**
 * Build the visual harness bundle with the esbuild JS API.
 *
 * The npm script used to pass --define:process.env.NODE_ENV="development" on
 * the command line, but Windows shells strip the quotes, esbuild then treats
 * the value as an IDENTIFIER, and the emitted bundle references a bare
 * `development` variable — React's entry throws ReferenceError the moment the
 * bundle runs. Building through the API keeps the define a real string no
 * matter which shell invokes it.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['dev/main.tsx'],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2020',
  outfile: 'dev/bundle.js',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
})
