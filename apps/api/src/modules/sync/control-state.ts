// Runtime knobs the test-control API turns (F12 plan §5 "Test control"). In production nothing changes them:
// the minimum protocol comes from SYNC_MIN_PROTOCOL_VERSION and no failure is ever armed.
export class SyncControl {
  private minOverride: number | null = null;
  private failuresLeft = 0;
  private failureStatus = 503;

  private readonly configuredMin: number;

  constructor(configuredMin: number) {
    this.configuredMin = configuredMin;
  }

  /** The oldest protocol version accepted right now (F12-AC15). */
  minProtocolVersion(): number {
    return this.minOverride ?? this.configuredMin;
  }

  setMinProtocolVersion(version: number): void {
    this.minOverride = version;
  }

  /** The next `count` push/pull requests fail with a temporary `status` (F12-AC6). */
  failNext(count: number, status: number): void {
    this.failuresLeft = count;
    this.failureStatus = status;
  }

  /** The status to fail this request with, or null. */
  takeFailure(): number | null {
    if (this.failuresLeft <= 0) return null;
    this.failuresLeft -= 1;
    return this.failureStatus;
  }

  reset(): void {
    this.minOverride = null;
    this.failuresLeft = 0;
    this.failureStatus = 503;
  }
}
