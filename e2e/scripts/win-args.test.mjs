// Regression test for e2e/scripts/win-args.mjs: arguments reach a program unchanged when cmd.exe starts it through a
// .cmd shim (how the gate runs npx and maestro on Windows), including `%`, which cmd.exe expands even inside quotes.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { escapeCmdArg, shellArgs } from './win-args.mjs';

const TRICKY = [
  '%PATH%', // an environment variable that exists: must not be expanded
  '100%',
  '50% (half)',
  '%%',
  '!PATH!',
  '\\(US-033\\)|\\(US-034\\)', // the gate's --grep pattern
  'with space',
  'quote " inside',
  'a & b | c > d < e ^ f',
  'trailing\\',
  'C:\\path with space\\',
  '',
];

describe('win-args · escaping', () => {
  it('leaves arguments unchanged off Windows', () => {
    expect(shellArgs(['a b', '%PATH%'], { platform: 'linux' })).toEqual(['a b', '%PATH%']);
  });

  it('caret-escapes % so cmd.exe cannot expand it, and escapes twice for a shim', () => {
    expect(escapeCmdArg('%PATH%', { shim: false })).toBe('^"^%PATH^%^"');
    expect(escapeCmdArg('%PATH%')).toBe('^^^"^^^%PATH^^^%^^^"');
  });
});

const dir = process.platform === 'win32' ? mkdtempSync(join(tmpdir(), 'win-args-')) : '';
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.runIf(process.platform === 'win32')('win-args · through cmd.exe and a .cmd shim (Windows)', () => {
  it('every argument arrives exactly as given', () => {
    const script = join(dir, 'echo-args.cjs');
    writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
    // Like npm's npx.cmd: a batch file that hands %* to node.
    const shim = join(dir, 'echo args.cmd');
    writeFileSync(shim, `@"${process.execPath}" "${script}" %*\r\n`);
    const res = spawnSync(`"${shim}"`, shellArgs(TRICKY), { shell: true, encoding: 'utf8' });
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual(TRICKY);
  });

  it('a real .exe started through cmd.exe (shim: false) also receives every argument exactly', () => {
    const script = join(dir, 'echo-args.cjs');
    writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
    const res = spawnSync(`"${process.execPath}"`, shellArgs([script, ...TRICKY], { shim: false }), { shell: true, encoding: 'utf8' });
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual(TRICKY);
  });
});
