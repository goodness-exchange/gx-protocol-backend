import { Resend } from 'resend';
import { logger } from '@gx/core-logger';
import { identityConfig } from '../config';

/**
 * Email Service using Resend
 *
 * Enterprise-grade email delivery service for GX Coin platform.
 * Handles all transactional emails including:
 * - Relationship invitations
 * - OTP verification codes
 * - Account notifications
 * - Security alerts
 *
 * CONFIGURATION:
 * - RESEND_API_KEY: API key from resend.com
 * - EMAIL_ENABLED: Set to 'true' to enable sending
 * - EMAIL_FROM_ADDRESS: Sender email address
 * - EMAIL_FROM_NAME: Sender display name
 */

// Initialize Resend client
const resend = identityConfig.resendApiKey
  ? new Resend(identityConfig.resendApiKey)
  : null;

// Brand colors for email templates
const BRAND_COLORS = {
  primary: '#470A69',      // Pantone purple
  secondary: '#4cbb17',    // Kelly green
  background: '#f8fafc',   // Light gray
  text: '#1f2937',         // Dark gray
  textMuted: '#6b7280',    // Medium gray
  border: '#e5e7eb',       // Light border
  success: '#10b981',      // Green
  warning: '#f59e0b',      // Amber
};

/**
 * Base email template wrapper with GX Coin branding
 */
function createEmailWrapper(content: string, preheader?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>GX Coin</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: ${BRAND_COLORS.text};
      background-color: ${BRAND_COLORS.background};
    }
    .preheader {
      display: none !important;
      visibility: hidden;
      opacity: 0;
      color: transparent;
      height: 0;
      width: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .email-body {
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .header {
      background: linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, #6b21a8 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .logo-accent {
      color: ${BRAND_COLORS.secondary};
    }
    .content {
      padding: 32px 24px;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, #6b21a8 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .button-secondary {
      background: ${BRAND_COLORS.secondary};
    }
    .info-box {
      background-color: #f0f9ff;
      border-left: 4px solid #0ea5e9;
      padding: 16px;
      border-radius: 8px;
      margin: 24px 0;
    }
    .warning-box {
      background-color: #fffbeb;
      border-left: 4px solid ${BRAND_COLORS.warning};
      padding: 16px;
      border-radius: 8px;
      margin: 24px 0;
    }
    .footer {
      padding: 24px;
      text-align: center;
      color: ${BRAND_COLORS.textMuted};
      font-size: 12px;
      border-top: 1px solid ${BRAND_COLORS.border};
    }
    .footer a {
      color: ${BRAND_COLORS.primary};
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: ${BRAND_COLORS.border};
      margin: 24px 0;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: ${BRAND_COLORS.text};
      margin: 0 0 16px 0;
    }
    h2 {
      font-size: 18px;
      font-weight: 600;
      color: ${BRAND_COLORS.text};
      margin: 0 0 12px 0;
    }
    p {
      margin: 0 0 16px 0;
      color: ${BRAND_COLORS.textMuted};
    }
    .highlight {
      color: ${BRAND_COLORS.primary};
      font-weight: 600;
    }
    .trust-badge {
      display: inline-block;
      background-color: #dcfce7;
      color: #166534;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }
    .user-card {
      background-color: ${BRAND_COLORS.background};
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .user-name {
      font-size: 18px;
      font-weight: 600;
      color: ${BRAND_COLORS.text};
      margin-bottom: 4px;
    }
    .user-detail {
      font-size: 14px;
      color: ${BRAND_COLORS.textMuted};
    }
    @media only screen and (max-width: 600px) {
      .container {
        padding: 12px;
      }
      .content {
        padding: 24px 16px;
      }
      .button {
        display: block;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  ${preheader ? `<span class="preheader">${preheader}</span>` : ''}
  <div class="container">
    <div class="email-body">
      <div class="header">
        <div class="logo">GX<span class="logo-accent">coin</span></div>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p style="margin-bottom: 8px;">
          <strong>GX Coin</strong> - Productivity-Based Currency
        </p>
        <p style="margin-bottom: 8px;">
          This email was sent by GX Coin. If you didn't expect this email,
          you can safely ignore it.
        </p>
        <p style="margin-bottom: 0;">
          <a href="${identityConfig.appUrl}">Visit GX Coin</a> |
          <a href="${identityConfig.appUrl}/help">Help Center</a> |
          <a href="${identityConfig.appUrl}/privacy">Privacy Policy</a>
        </p>
        <p style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
          © ${new Date().getFullYear()} GX Coin. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Email template for relationship invitations
 */
function createInvitationEmailTemplate(params: {
  referrerName: string;
  relationType: string;
  invitationToken: string;
}): { subject: string; html: string } {
  const { referrerName, relationType, invitationToken } = params;
  const signUpUrl = `${identityConfig.appUrl}/register?ref=${invitationToken}`;

  const relationshipDisplay = relationType.toLowerCase().replace('_', ' ');

  const content = `
    <h1>You've Been Invited! 🎉</h1>
    <p>
      <span class="highlight">${referrerName}</span> has invited you to join GX Coin
      and establish a <span class="highlight">${relationshipDisplay}</span> connection
      on the platform.
    </p>

    <div class="user-card">
      <div class="user-name">${referrerName}</div>
      <div class="user-detail">Wants to connect as: ${relationshipDisplay}</div>
      <div style="margin-top: 8px;">
        <span class="trust-badge">✓ Verified GX Coin Member</span>
      </div>
    </div>

    <h2>What is GX Coin?</h2>
    <p>
      GX Coin is a revolutionary productivity-based currency platform that rewards
      genuine economic contributions. By joining, you'll be part of a trusted
      community building the future of fair finance.
    </p>

    <div class="info-box">
      <strong style="color: #0369a1;">Benefits of Joining:</strong>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #0369a1;">
        <li>Receive your genesis allocation upon KYC verification</li>
        <li>Build your trust score through verified relationships</li>
        <li>Access interest-free community loans</li>
        <li>Participate in decentralized governance</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${signUpUrl}" class="button">Join GX Coin Now</a>
    </div>

    <div class="divider"></div>

    <p style="font-size: 14px;">
      Once you create your account and complete verification, you'll be able to
      confirm your relationship with ${referrerName} and start building your
      trust score together.
    </p>

    <div class="warning-box">
      <strong style="color: #92400e;">Important:</strong>
      <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">
        This invitation was sent because ${referrerName} wants to establish a
        verified relationship with you. Only accept if you personally know this person.
      </p>
    </div>

    <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
      If you didn't expect this invitation or don't know ${referrerName},
      you can safely ignore this email.
    </p>
  `;

  return {
    subject: `${referrerName} invited you to join GX Coin`,
    html: createEmailWrapper(content, `${referrerName} wants to connect with you on GX Coin`),
  };
}

/**
 * Email template for OTP verification
 */
function createOTPEmailTemplate(params: {
  otpCode: string;
  purpose: 'registration' | 'login' | 'password_reset';
  expiryMinutes: number;
}): { subject: string; html: string } {
  const { otpCode, purpose, expiryMinutes } = params;

  const purposeText = {
    registration: 'complete your registration',
    login: 'log in to your account',
    password_reset: 'reset your password',
  }[purpose];

  const content = `
    <h1>Your Verification Code</h1>
    <p>
      Use the code below to ${purposeText}. This code will expire in
      <strong>${expiryMinutes} minutes</strong>.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <div style="
        display: inline-block;
        background-color: ${BRAND_COLORS.background};
        border: 2px dashed ${BRAND_COLORS.border};
        border-radius: 12px;
        padding: 24px 48px;
      ">
        <div style="
          font-size: 36px;
          font-weight: 700;
          letter-spacing: 8px;
          color: ${BRAND_COLORS.primary};
          font-family: 'Courier New', monospace;
        ">${otpCode}</div>
      </div>
    </div>

    <div class="warning-box">
      <strong style="color: #92400e;">Security Notice:</strong>
      <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">
        Never share this code with anyone. GX Coin staff will never ask for
        your verification code. If you didn't request this code, please ignore
        this email or contact support.
      </p>
    </div>

    <div class="divider"></div>

    <p style="font-size: 12px; color: #9ca3af;">
      This code was requested for your GX Coin account. If you didn't make
      this request, your account may have been targeted. Consider changing
      your password.
    </p>
  `;

  const subjects = {
    registration: 'Verify your email to join GX Coin',
    login: 'Your GX Coin login verification code',
    password_reset: 'Reset your GX Coin password',
  };

  return {
    subject: subjects[purpose],
    html: createEmailWrapper(content, `Your verification code is ${otpCode}`),
  };
}

/**
 * Email template for relationship confirmation notification
 */
function createRelationshipConfirmedTemplate(params: {
  recipientName: string;
  otherPartyName: string;
  relationType: string;
  pointsAwarded: number;
}): { subject: string; html: string } {
  const { recipientName, otherPartyName, relationType, pointsAwarded } = params;
  const relationshipDisplay = relationType.toLowerCase().replace('_', ' ');

  const content = `
    <h1>Relationship Confirmed! 🤝</h1>
    <p>
      Great news, ${recipientName}! Your ${relationshipDisplay} relationship
      with <span class="highlight">${otherPartyName}</span> has been confirmed.
    </p>

    <div class="user-card" style="text-align: center;">
      <div style="
        font-size: 48px;
        font-weight: 700;
        color: ${BRAND_COLORS.success};
        margin-bottom: 8px;
      ">+${pointsAwarded}</div>
      <div class="user-detail">Trust Points Earned</div>
    </div>

    <p>
      Your trust score has been updated. Verified relationships help build
      your credibility on the platform and unlock additional benefits.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${identityConfig.appUrl}/settings/relationships" class="button button-secondary">
        View Your Trust Score
      </a>
    </div>

    <div class="info-box">
      <strong style="color: #0369a1;">What's Next?</strong>
      <p style="margin: 8px 0 0 0; color: #0369a1; font-size: 14px;">
        Continue building your trust network by inviting more verified
        relationships. A higher trust score improves your standing in the
        community.
      </p>
    </div>
  `;

  return {
    subject: `${otherPartyName} confirmed your relationship on GX Coin`,
    html: createEmailWrapper(content, `You earned ${pointsAwarded} trust points!`),
  };
}

/**
 * Email Service Class
 */
class EmailService {
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = identityConfig.emailEnabled && !!resend;
    if (!this.isEnabled) {
      logger.warn('Email service is disabled. Set EMAIL_ENABLED=true and RESEND_API_KEY to enable.');
    }
  }

  /**
   * Send a relationship invitation email to a non-registered user
   */
  async sendInvitationEmail(params: {
    recipientEmail: string;
    referrerName: string;
    relationType: string;
    invitationToken: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { recipientEmail, referrerName, relationType, invitationToken } = params;

    logger.info({ recipientEmail, referrerName, relationType }, 'Sending invitation email');

    if (!this.isEnabled) {
      logger.info({ recipientEmail }, 'Email disabled - skipping invitation send');
      return { success: true, messageId: 'disabled' };
    }

    try {
      const template = createInvitationEmailTemplate({
        referrerName,
        relationType,
        invitationToken,
      });

      const result = await resend!.emails.send({
        from: `${identityConfig.emailFromName} <${identityConfig.emailFromAddress}>`,
        to: recipientEmail,
        subject: template.subject,
        html: template.html,
      });

      if (result.error) {
        logger.error({ error: result.error, recipientEmail }, 'Failed to send invitation email');
        return { success: false, error: result.error.message };
      }

      logger.info({ messageId: result.data?.id, recipientEmail }, 'Invitation email sent successfully');
      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      logger.error({ error: error.message, recipientEmail }, 'Email send exception');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send OTP verification email
   */
  async sendOTPEmail(params: {
    recipientEmail: string;
    otpCode: string;
    purpose: 'registration' | 'login' | 'password_reset';
    expiryMinutes?: number;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { recipientEmail, otpCode, purpose, expiryMinutes = 10 } = params;

    logger.info({ recipientEmail, purpose }, 'Sending OTP email');

    if (!this.isEnabled) {
      logger.info({ recipientEmail, otpCode }, 'Email disabled - OTP not sent (test mode)');
      return { success: true, messageId: 'disabled' };
    }

    try {
      const template = createOTPEmailTemplate({
        otpCode,
        purpose,
        expiryMinutes,
      });

      const result = await resend!.emails.send({
        from: `${identityConfig.emailFromName} <${identityConfig.emailFromAddress}>`,
        to: recipientEmail,
        subject: template.subject,
        html: template.html,
      });

      if (result.error) {
        logger.error({ error: result.error, recipientEmail }, 'Failed to send OTP email');
        return { success: false, error: result.error.message };
      }

      logger.info({ messageId: result.data?.id, recipientEmail }, 'OTP email sent successfully');
      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      logger.error({ error: error.message, recipientEmail }, 'Email send exception');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send relationship confirmed notification email
   */
  async sendRelationshipConfirmedEmail(params: {
    recipientEmail: string;
    recipientName: string;
    otherPartyName: string;
    relationType: string;
    pointsAwarded: number;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { recipientEmail, recipientName, otherPartyName, relationType, pointsAwarded } = params;

    logger.info({ recipientEmail, otherPartyName }, 'Sending relationship confirmed email');

    if (!this.isEnabled) {
      logger.info({ recipientEmail }, 'Email disabled - skipping confirmation send');
      return { success: true, messageId: 'disabled' };
    }

    try {
      const template = createRelationshipConfirmedTemplate({
        recipientName,
        otherPartyName,
        relationType,
        pointsAwarded,
      });

      const result = await resend!.emails.send({
        from: `${identityConfig.emailFromName} <${identityConfig.emailFromAddress}>`,
        to: recipientEmail,
        subject: template.subject,
        html: template.html,
      });

      if (result.error) {
        logger.error({ error: result.error, recipientEmail }, 'Failed to send confirmation email');
        return { success: false, error: result.error.message };
      }

      logger.info({ messageId: result.data?.id, recipientEmail }, 'Confirmation email sent successfully');
      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      logger.error({ error: error.message, recipientEmail }, 'Email send exception');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if email service is operational
   */
  isOperational(): boolean {
    return this.isEnabled;
  }
}

// Export singleton instance
export const emailService = new EmailService();

// Export template functions for testing
export {
  createInvitationEmailTemplate,
  createOTPEmailTemplate,
  createRelationshipConfirmedTemplate,
  createEmailWrapper,
};
