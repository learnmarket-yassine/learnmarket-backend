import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import * as path from 'path';
import Twig from 'twig';

@Injectable()
export class EmailService {
  private readonly api: BrevoClient;

  constructor(private readonly config: ConfigService) {
    this.api = new BrevoClient({
      apiKey: this.config.getOrThrow<string>('SIB_API_KEY'),
    });
  }

  async sendMail(data: {
    mailData: {
      sender: { email: string; name?: string };
      receivers: { email: string; name?: string }[];
      subject: string;
      params?: Record<string, any>;
    };
    template: string;
    attachments?: { name: string; content: string }[];
  }): Promise<boolean> {
    try {
      const { mailData, template, attachments } = data;
      const { sender, receivers, subject, params } = mailData;

      const templatePath = path.join(
        __dirname,
        '..',
        'email',
        'templates',
        `${template}.twig`,
      );

      const htmlContent = await new Promise<string>((resolve, reject) => {
        Twig.renderFile(templatePath, params || {}, (err, html) => {
          if (err) return reject(err);
          resolve(html);
        });
      });

      await this.api.transactionalEmails.sendTransacEmail({
        sender,
        to: receivers,
        subject,
        htmlContent,
        ...(attachments?.length ? { attachment: attachments } : {}),
      });

      return true;
    } catch (error) {
      console.error('ERROR SENDING EMAIL:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(data: {
    email: string;
    otp: string;
    name?: string;
    expiresIn?: number;
  }) {
    const expiresIn = data.expiresIn ?? 15;

    const success = await this.sendMail({
      template: 'password-reset',
      mailData: {
        sender: {
          email: 'yassinbenhajali5@gmail.com',
          name: 'LearnMarket',
        },
        receivers: [
          {
            email: data.email,
            name: data.name,
          },
        ],
        subject: 'Reset Your Password',
        params: {
          otp: data.otp,
          name: data.name,
          expiresIn,
        },
      },
    });

    return { success };
  }
}
