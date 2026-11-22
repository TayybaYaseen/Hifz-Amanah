// Windows argument escaping for commands run through cmd.exe (spawn with `shell: true`).
//
// The gate runs `npx` and `maestro`, which on Windows are .cmd/.bat shims, so Node must start them through cmd.exe.
// cmd.exe reads `|`, `&`, `<`, `>`, `^`, `(`, `)` and `"` as shell syntax, and it expands `%NAME%` (and `!NAME!` with
// delayed expansion) even inside double quotes, so quoting alone is not enough. Each argument is therefore quoted
// for the program (C runtime rules, backslashes before a quote doubled) and then every cmd.exe metacharacter,
// `%` included, is escaped with `^`. A `.cmd`/`.bat` shim parses its arguments a second time when it passes `%*` on,
// so for a shim the escaping is applied twice. This is the technique used by the `cross-spawn` package.

const META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Escapes one argument for a command line that cmd.exe runs.
 * @param {string} arg
 * @param {{ shim?: boolean }} [options] shim: the program is a .cmd/.bat file (default true: npx and maestro are).
 * @returns {string}
 */
export function escapeCmdArg(arg, { shim = true } = {}) {
  let s = String(arg);
  // C runtime quoting: backslashes before a quote are doubled and the quote is escaped; trailing backslashes are
  // doubled so they do not escape the closing quote.
  s = s.replace(/(\\*)"/g, '$1$1\\"');
  s = s.replace(/(\\*)$/, '$1$1');
  s = `"${s}"`;
  s = s.replace(META, '^$1');
  if (shim) s = s.replace(META, '^$1');
  return s;
}

/**
 * The arguments to hand to `spawn(command, args, { shell: true })`: escaped on Windows, unchanged elsewhere (where the
 * gate does not use a shell).
 * @param {readonly string[]} args
 * @param {{ platform?: string, shim?: boolean }} [options]
 * @returns {string[]}
 */
export function shellArgs(args, { platform = process.platform, shim = true } = {}) {
  return platform === 'win32' ? args.map((a) => escapeCmdArg(a, { shim })) : [...args];
}
