// Runtime configuration from the environment. Secrets come from the platform secret store in
// production (NFR-SEC-004) and are never committed or logged.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const Env = z.object({
  // Unset means production, so a deploy that forgets NODE_ENV still demands real secrets (code review M4).
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  /** Proxy hops in front of the API whose X-Forwarded-For is trusted (0 = none). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().optional(),
  /** HMAC key for access and challenge tokens. */
  JWT_SECRET: z.string().min(32).optional(),
  /** Pepper for OTP and recovery-code hashes. */
  HASH_PEPPER: z.string().min(32).optional(),
  /** 32-byte key, base64, for encrypting TOTP secrets at rest. */
  TOTP_ENCRYPTION_KEY: z.string().optional(),
  MAIL_TRANSPORT: z.enum(['memory', 'ses']).default('memory'),
  MAIL_FROM: z.string().default('no-reply@hifzamanah.invalid'),
  AWS_REGION: z.string().default('ap-south-1'),
  /** Enables the test-control API (NFR-MNT-005). Never set in production. */
  TEST_CONTROL_SECRET: z.string().min(16).optional(),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string | undefined;
  jwtSecret: Uint8Array;
  hashPepper: string;
  totpKey: Buffer;
  mail: { transport: 'memory' | 'ses'; from: string; awsRegion: string };
  testControlSecret: string | undefined;
  trustProxyHops: number;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = Env.parse(source);
  const production = env.NODE_ENV === 'production';
  const required = (name: string, value: string | undefined): string => {
    if (value) return value;
    if (production) throw new Error(`${name} must be set in production`);
    // Development/test only: an ephemeral random value. Sessions do not survive a restart.
    return randomBytes(32).toString('base64');
  };
  if (env.TEST_CONTROL_SECRET && env.NODE_ENV !== 'test') {
    throw new Error('TEST_CONTROL_SECRET must never be set in production; it is allowed only with NODE_ENV=test');
  }
  if (production && env.MAIL_TRANSPORT !== 'ses') throw new Error('Production must send email through SES (DEC-B06)');

  const totpKey = Buffer.from(required('TOTP_ENCRYPTION_KEY', env.TOTP_ENCRYPTION_KEY), 'base64');
  if (totpKey.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded');

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: new TextEncoder().encode(required('JWT_SECRET', env.JWT_SECRET)),
    hashPepper: required('HASH_PEPPER', env.HASH_PEPPER),
    totpKey,
    mail: { transport: env.MAIL_TRANSPORT, from: env.MAIL_FROM, awsRegion: env.AWS_REGION },
    testControlSecret: env.TEST_CONTROL_SECRET,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  };
}
