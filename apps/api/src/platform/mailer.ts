// Outbound email. Production sends through Amazon SES (DEC-B06); development and tests keep messages
// in memory so the test-control API can read the OTP (NFR-MNT-005). Message bodies are never logged.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  /** Non-sensitive routing metadata, for the test sink only. */
  meta: { userId: string; kind: 'PASSWORD_RESET_OTP' };
  /** Test sink only: the OTP the message carries. Never stored outside the in-memory sink. */
  otp?: string;
}

export interface Mailer {
  send(message: OutboundEmail): Promise<void>;
}

export class MemoryMailer implements Mailer {
  readonly sent: OutboundEmail[] = [];

  async send(message: OutboundEmail): Promise<void> {
    this.sent.push(message);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export class SesMailer implements Mailer {
  private readonly client: SESv2Client;
  private readonly from: string;

  constructor(region: string, from: string) {
    this.client = new SESv2Client({ region });
    this.from = from;
  }

  async send({ to, subject, text }: OutboundEmail): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
      }),
    );
  }
}
