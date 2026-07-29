/**
 * Email Templates Seed
 * Run: npx tsx seeds/emailTemplates.seed.ts
 *
 * Upserts 10 pre-built pediatric email templates.
 * Existing templates with the same name are updated in-place (idempotent).
 */

import 'dotenv/config'
import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// ─── Responsive email shell ───────────────────────────────────────────────────
// Wraps any content block in a consistent 600px responsive email layout.

function shell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;">
  <tr><td align="center" style="padding:28px 16px;">

    <!-- Outer wrapper -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

      <!-- ── HEADER ─────────────────────────────────────────────────────── -->
      <tr>
        <td style="background:linear-gradient(135deg,#134e4a 0%,#0f766e 100%);border-radius:12px 12px 0 0;padding:30px 36px;text-align:center;">
          <p style="margin:0;color:#ccfbf1;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">KiDS 0 to 18</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:18px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Integrative Pediatrics</p>
          <p style="margin:6px 0 0;color:#99f6e4;font-size:12px;font-family:Arial,Helvetica,sans-serif;">Compassionate care from birth through age 18</p>
        </td>
      </tr>

      <!-- ── CONTENT ────────────────────────────────────────────────────── -->
      <tr>
        <td style="background-color:#ffffff;padding:36px;">
${content}
        </td>
      </tr>

      <!-- ── FOOTER ─────────────────────────────────────────────────────── -->
      <tr>
        <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:24px 36px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="text-align:center;">
                <p style="margin:0 0 6px;color:#64748b;font-size:13px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{practice_name}}</p>
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
                  {{practice_address}}<br>
                  Phone: <a href="tel:{{practice_phone}}" style="color:#0f766e;text-decoration:none;">{{practice_phone}}</a> &nbsp;&bull;&nbsp;
                  <a href="{{practice_website}}" style="color:#0f766e;text-decoration:none;">Visit our website</a>
                </p>
                <p style="margin:14px 0 0;color:#94a3b8;font-size:11px;font-family:Arial,Helvetica,sans-serif;">
                  <a href="{{view_in_browser_link}}" style="color:#94a3b8;text-decoration:underline;">View in browser</a>
                  &nbsp;&nbsp;|&nbsp;&nbsp;
                  <a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
                </p>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:10px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
                  This email contains information related to your child's healthcare at {{practice_name}}.<br>
                  Please do not forward this email. HIPAA protected.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`
}

// ─── Reusable HTML snippets ───────────────────────────────────────────────────

const btn = (href: string, label: string, bg = '#0f766e') => `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0;">
            <tr>
              <td style="background-color:${bg};border-radius:8px;text-align:center;">
                <a href="${href}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.3px;">${label}</a>
              </td>
            </tr>
          </table>`

const apptCard = `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:20px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Date</p>
                      <p style="margin:3px 0 0;color:#1e293b;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{appointment_date}}</p>
                    </td>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Time</p>
                      <p style="margin:3px 0 0;color:#1e293b;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{appointment_time}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Doctor</p>
                      <p style="margin:3px 0 0;color:#1e293b;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{doctor_name}}</p>
                    </td>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Visit Type</p>
                      <p style="margin:3px 0 0;color:#1e293b;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{appointment_type}}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`

const cancelPolicy = `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;background-color:#fefce8;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
            <tr>
              <td style="padding:14px 18px;">
                <p style="margin:0;color:#92400e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Cancellation Policy</p>
                <p style="margin:4px 0 0;color:#78350f;font-size:13px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">We require <strong>{{cancellation_policy_hours}} hours notice</strong> to cancel or reschedule. Late cancellations may result in a cancellation fee. To cancel, call us at <a href="tel:{{practice_phone}}" style="color:#78350f;">{{practice_phone}}</a>.</p>
              </td>
            </tr>
          </table>`

const divider = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid #f1f5f9;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`

// ─── Template HTML bodies ─────────────────────────────────────────────────────

const T1_CONFIRMATION_HTML = shell(`
          <h2 style="margin:0 0 4px;color:#0f766e;font-size:22px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Appointment Confirmed ✓</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, we look forward to seeing {{patient_first_name}}!</p>
${apptCard}
          <p style="margin:20px 0 10px;color:#1e293b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">What to Bring</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Insurance card &amp; photo ID</td></tr>
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; List of current medications or supplements</td></tr>
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Any completed registration or screening forms</td></tr>
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Any referral documents if applicable</td></tr>
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Questions you'd like to discuss with {{doctor_name}}</td></tr>
          </table>
          <p style="margin:20px 0 8px;color:#1e293b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Our Location</p>
          <p style="margin:0;color:#475569;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">{{practice_address}}<br>Please arrive 10 minutes early to complete any remaining check-in paperwork.</p>
${cancelPolicy}
          <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Questions before your visit? We're here to help — call us at <a href="tel:{{practice_phone}}" style="color:#0f766e;font-weight:600;">{{practice_phone}}</a>.</p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">See you soon,<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T1_CONFIRMATION_PLAIN = `Hi {{parent_first_name}},

Your appointment is confirmed! We look forward to seeing {{patient_first_name}}.

APPOINTMENT DETAILS
-------------------
Date:        {{appointment_date}}
Time:        {{appointment_time}}
Doctor:      {{doctor_name}}
Visit Type:  {{appointment_type}}

WHAT TO BRING
- Insurance card & photo ID
- List of current medications
- Completed registration forms (if applicable)
- Any referral documents
- Questions for {{doctor_name}}

LOCATION
{{practice_address}}
Please arrive 10 minutes early.

CANCELLATION POLICY
We require {{cancellation_policy_hours}} hours notice to cancel or reschedule.
Call us at {{practice_phone}} to make changes.

Questions? Call us at {{practice_phone}}.

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T2_REMINDER_48_HTML = shell(`
          <h2 style="margin:0 0 4px;color:#0f766e;font-size:22px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Appointment in 2 Days</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, just a friendly reminder for {{patient_first_name}}'s upcoming visit.</p>
${apptCard}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;background-color:#f0fdfa;border:1px solid #a7f3d0;border-radius:10px;">
            <tr>
              <td style="padding:18px 24px;">
                <p style="margin:0 0 10px;color:#065f46;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Pre-Visit Checklist</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td style="padding:4px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9711;&nbsp; Complete Develo registration forms online (link in your earlier email)</td></tr>
                  <tr><td style="padding:4px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9711;&nbsp; Verify your insurance information is current</td></tr>
                  <tr><td style="padding:4px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9711;&nbsp; Write down any questions or concerns for {{doctor_name}}</td></tr>
                  <tr><td style="padding:4px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9711;&nbsp; Note any changes in {{patient_first_name}}'s health, growth, or behavior</td></tr>
                </table>
              </td>
            </tr>
          </table>
${cancelPolicy}
          <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Need to make a change? Call us at <a href="tel:{{practice_phone}}" style="color:#0f766e;font-weight:600;">{{practice_phone}}</a>.</p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">We'll see you soon,<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T2_REMINDER_48_PLAIN = `Hi {{parent_first_name}},

This is a friendly reminder that {{patient_first_name}} has an appointment in 2 days.

APPOINTMENT DETAILS
-------------------
Date:        {{appointment_date}}
Time:        {{appointment_time}}
Doctor:      {{doctor_name}}
Visit Type:  {{appointment_type}}

PRE-VISIT CHECKLIST
- Complete Develo registration forms online (link was in your earlier email)
- Verify your insurance information is current
- Write down questions for {{doctor_name}}
- Note any changes in {{patient_first_name}}'s health or behavior

CANCELLATION POLICY
We require {{cancellation_policy_hours}} hours notice to cancel.
Call us at {{practice_phone}}.

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T3_DEVELO_HTML = shell(`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
            <tr><td style="padding:12px 18px;"><p style="margin:0;color:#92400e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#9888; Action Required Before Your Visit</p></td></tr>
          </table>
          <h2 style="margin:0 0 8px;color:#1e293b;font-size:21px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Complete {{patient_first_name}}'s Registration Forms</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, to ensure {{patient_first_name}} receives the best possible care at their upcoming appointment, please complete the patient registration forms through our secure online portal before your visit.</p>
          <p style="margin:0 0 10px;color:#1e293b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Why complete forms online?</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Saves time — no waiting room paperwork</td></tr>
            <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Gives {{doctor_name}} time to review before your appointment</td></tr>
            <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Secure &amp; HIPAA-compliant — your data is protected</td></tr>
            <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Takes approximately 10–15 minutes to complete</td></tr>
          </table>
${btn('{{develo_link}}', 'Complete Registration Forms')}
          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;font-family:Arial,Helvetica,sans-serif;">Button not working? Copy this link into your browser:<br><span style="color:#0f766e;word-break:break-all;">{{develo_link}}</span></p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0;color:#991b1b;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#9888; If forms are not completed online:</p>
                <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">You will need to arrive <strong>30 minutes early</strong> to complete all paperwork in the office. This may shorten your appointment time with {{doctor_name}}.</p>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Have questions about the forms? Call us at <a href="tel:{{practice_phone}}" style="color:#0f766e;font-weight:600;">{{practice_phone}}</a> — we're happy to help.</p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Thank you,<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T3_DEVELO_PLAIN = `Hi {{parent_first_name}},

ACTION REQUIRED: Please complete {{patient_first_name}}'s patient registration forms before your upcoming visit.

Complete forms here: {{develo_link}}

WHY COMPLETE ONLINE?
- Saves time — no waiting room paperwork
- Gives {{doctor_name}} time to review before your appointment
- Secure & HIPAA-compliant
- Takes approximately 10-15 minutes

IF FORMS ARE NOT COMPLETED ONLINE:
You will need to arrive 30 minutes early to complete paperwork in the office.
This may shorten your appointment time with {{doctor_name}}.

Questions? Call us at {{practice_phone}}.

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T4_NOVOPSYCH_HTML = shell(`
          <h2 style="margin:0 0 8px;color:#1e293b;font-size:21px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Complete {{patient_first_name}}'s Screening Forms</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, {{doctor_name}} has requested that you complete a brief developmental screening for {{patient_first_name}} before the upcoming appointment in 2–3 days.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f5f3ff;border:1px solid #c4b5fd;border-radius:10px;">
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 8px;color:#5b21b6;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">What is NovoPsych?</p>
                <p style="margin:0;color:#4c1d95;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">NovoPsych is a clinically validated, age-appropriate screening tool used by pediatric practices to identify developmental, behavioral, and emotional concerns early. It is secure, confidential, and takes approximately 10–15 minutes to complete online.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f0fdf4;border:1px solid #a7f3d0;border-radius:10px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0;color:#065f46;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#128274; This is a legitimate request from {{practice_name}}</p>
                <p style="margin:6px 0 0;color:#047857;font-size:13px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">This screening was requested by {{doctor_name}} as part of {{patient_first_name}}'s care. The link below is secure and goes directly to the NovoPsych platform.</p>
              </td>
            </tr>
          </table>
${btn('{{novopsych_link}}', 'Start Screening — 10–15 mins', '#7c3aed')}
          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;font-family:Arial,Helvetica,sans-serif;">Button not working? Copy this link:<br><span style="color:#7c3aed;word-break:break-all;">{{novopsych_link}}</span></p>
${divider}
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Completing the screening helps {{doctor_name}}:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Identify areas where {{patient_first_name}} may benefit from additional support</td></tr>
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Make the most of your appointment time</td></tr>
            <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Provide personalized, evidence-based recommendations</td></tr>
          </table>
          <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Questions? Call <a href="tel:{{practice_phone}}" style="color:#0f766e;font-weight:600;">{{practice_phone}}</a>.</p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Thank you,<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T4_NOVOPSYCH_PLAIN = `Hi {{parent_first_name}},

{{doctor_name}} has requested a brief developmental screening for {{patient_first_name}} before the upcoming appointment.

Start screening here: {{novopsych_link}}

WHAT IS NOVOPSYCH?
NovoPsych is a clinically validated, age-appropriate screening tool used by pediatric practices to identify developmental, behavioral, and emotional concerns early. It is secure, confidential, and takes approximately 10-15 minutes.

This screening was legitimately requested by {{doctor_name}} at {{practice_name}}.

The screening helps {{doctor_name}}:
- Identify areas where {{patient_first_name}} may benefit from support
- Make the most of your appointment time
- Provide personalized recommendations

Questions? Call {{practice_phone}}.

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T5_SAMEDAY_HTML = shell(`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background:linear-gradient(135deg,#0f766e,#0369a1);border-radius:10px;">
            <tr>
              <td style="padding:24px;text-align:center;">
                <p style="margin:0;color:#ccfbf1;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Today's Appointment</p>
                <p style="margin:6px 0;color:#ffffff;font-size:36px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{appointment_time}}</p>
                <p style="margin:0;color:#a5f3fc;font-size:14px;font-family:Arial,Helvetica,sans-serif;">{{appointment_date}}</p>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, this is a reminder that <strong style="color:#1e293b;">{{patient_first_name}}'s appointment</strong> with <strong style="color:#1e293b;">{{doctor_name}}</strong> is <strong style="color:#0f766e;">today</strong>!</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
            <tr>
              <td width="50%" style="padding:8px 12px 8px 0;vertical-align:top;">
                <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Doctor</p>
                <p style="margin:0;color:#1e293b;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{doctor_name}}</p>
              </td>
              <td width="50%" style="padding:8px 0;vertical-align:top;">
                <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Visit Type</p>
                <p style="margin:0;color:#1e293b;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{appointment_type}}</p>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:18px 22px;">
                <p style="margin:0 0 10px;color:#1e293b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Check-In Instructions</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Arrive <strong>10 minutes early</strong> to complete check-in</td></tr>
                  <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Have your <strong>insurance card</strong> ready at the front desk</td></tr>
                  <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Location: <strong>{{practice_address}}</strong></td></tr>
                  <tr><td style="padding:4px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Free parking available on-site</td></tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <p style="margin:0 0 4px;color:#0f766e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Need to reach us?</p>
                <a href="tel:{{practice_phone}}" style="color:#0f766e;font-size:18px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">{{practice_phone}}</a>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">See you today!<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T5_SAMEDAY_PLAIN = `Hi {{parent_first_name}},

REMINDER: {{patient_first_name}}'s appointment is TODAY!

Time:        {{appointment_time}}
Date:        {{appointment_date}}
Doctor:      {{doctor_name}}
Visit Type:  {{appointment_type}}

CHECK-IN INSTRUCTIONS
- Arrive 10 minutes early
- Have your insurance card ready
- Location: {{practice_address}}
- Free parking available on-site

NEED TO REACH US?
{{practice_phone}}

See you today!
The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T6_CANCELLED_HTML = shell(`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:20px;text-align:center;">
                <p style="margin:0;color:#94a3b8;font-size:40px;font-family:Arial,Helvetica,sans-serif;">&#128197;</p>
                <p style="margin:8px 0 0;color:#64748b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Appointment Cancelled</p>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;font-family:Arial,Helvetica,sans-serif;">{{appointment_date}} at {{appointment_time}} &bull; {{doctor_name}}</p>
              </td>
            </tr>
          </table>
          <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Your appointment has been cancelled</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, we've successfully cancelled {{patient_first_name}}'s appointment. We understand that schedules change, and we're always here when your family needs us.</p>
          <p style="margin:0 0 16px;color:#1e293b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Regular well-child visits are an important part of {{patient_first_name}}'s health journey. When you're ready to reschedule, we'd love to see you.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:18px 22px;text-align:center;">
                <p style="margin:0 0 8px;color:#0f766e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Ready to rebook?</p>
                <p style="margin:0 0 12px;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Call us and we'll find a time that works perfectly for your family.</p>
                <a href="tel:{{practice_phone}}" style="display:inline-block;padding:12px 28px;background-color:#0f766e;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">Call {{practice_phone}}</a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">We hope to see {{patient_first_name}} soon.<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T6_CANCELLED_PLAIN = `Hi {{parent_first_name}},

Your appointment has been successfully cancelled.

CANCELLED APPOINTMENT
Date:   {{appointment_date}}
Time:   {{appointment_time}}
Doctor: {{doctor_name}}

We understand schedules change. When you're ready to reschedule, we're here for you.

READY TO REBOOK?
Call us at {{practice_phone}} and we'll find a time that works.

We hope to see {{patient_first_name}} soon.

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T7_NOSHOW_HTML = shell(`
          <h2 style="margin:0 0 8px;color:#1e293b;font-size:21px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">We missed you today, {{parent_first_name}}</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">We noticed that {{patient_first_name}} wasn't able to make the appointment scheduled for <strong style="color:#1e293b;">{{appointment_date}}</strong>. We hope everything is okay with your family.</p>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Life gets busy — we completely understand. We'd love to find a time that works better for you, because keeping up with {{patient_first_name}}'s care is important to us.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:20px 24px;text-align:center;">
                <p style="margin:0 0 6px;color:#0f766e;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Let's find a new time</p>
                <p style="margin:0 0 14px;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Our team is ready to help you reschedule at a convenient time.</p>
                <a href="tel:{{practice_phone}}" style="display:inline-block;padding:12px 28px;background-color:#0f766e;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">Call Us to Reschedule</a>
                <p style="margin:12px 0 0;color:#0f766e;font-size:15px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{practice_phone}}</p>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#fefce8;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
            <tr>
              <td style="padding:14px 18px;">
                <p style="margin:0;color:#92400e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">A gentle reminder</p>
                <p style="margin:4px 0 0;color:#78350f;font-size:13px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">Regular well-child visits help us track {{patient_first_name}}'s growth, provide vaccinations on schedule, and catch any concerns early. We want to make sure {{patient_first_name}} doesn't fall behind on important care milestones.</p>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">We care about {{patient_first_name}}'s health and your family's wellbeing. Please reach out whenever you're ready.<br><br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T7_NOSHOW_PLAIN = `Hi {{parent_first_name}},

We missed {{patient_first_name}} at the appointment on {{appointment_date}}. We hope everything is okay.

Life gets busy — we completely understand. We'd love to reschedule at a time that works better for your family.

RESCHEDULE YOUR APPOINTMENT
Call us at {{practice_phone}} and we'll find a new time.

Regular well-child visits are important to track {{patient_first_name}}'s growth and keep vaccinations on schedule. We want to make sure your child doesn't fall behind on care milestones.

Please reach out whenever you're ready. We're here for your family.

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T8_POSTVISIT_HTML = shell(`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background:linear-gradient(135deg,#f0fdfa,#ccfbf1);border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:20px;text-align:center;">
                <p style="margin:0;font-size:36px;font-family:Arial,Helvetica,sans-serif;">&#9829;</p>
                <p style="margin:6px 0 0;color:#0f766e;font-size:16px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Thank you for visiting us today!</p>
              </td>
            </tr>
          </table>
          <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Great seeing {{patient_first_name}}, {{parent_first_name}}!</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">We truly enjoyed today's visit and appreciate the trust you place in our team to care for {{patient_first_name}}. We hope your experience was positive and that all your questions were answered.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:18px 22px;">
                <p style="margin:0 0 10px;color:#1e293b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">After Your Visit</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Follow any instructions or prescriptions provided by {{doctor_name}}</td></tr>
                  <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Schedule any recommended follow-up appointments</td></tr>
                  <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Contact us if {{patient_first_name}} develops new or worsening symptoms</td></tr>
                  <tr><td style="padding:5px 0;color:#475569;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#9654;&nbsp; Complete any referrals or lab work as ordered</td></tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
            <tr>
              <td width="48%" style="padding:16px;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;vertical-align:top;">
                <p style="margin:0 0 6px;color:#0f766e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Have Questions?</p>
                <p style="margin:0 0 8px;color:#475569;font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Our team is available during office hours for any follow-up questions.</p>
                <a href="tel:{{practice_phone}}" style="color:#0f766e;font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">{{practice_phone}}</a>
              </td>
              <td width="4%">&nbsp;</td>
              <td width="48%" style="padding:16px;background-color:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;vertical-align:top;">
                <p style="margin:0 0 6px;color:#7c3aed;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Sign Up for Our Portal</p>
                <p style="margin:0 0 8px;color:#475569;font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Access visit summaries, lab results, and request refills online.</p>
                <a href="{{practice_website}}" style="color:#7c3aed;font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Register now &rarr;</a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Thank you for being part of the {{practice_name}} family. We are honored to be {{patient_first_name}}'s pediatric home.<br><br><strong style="color:#1e293b;">{{doctor_name}} &amp; The {{practice_name}} Team</strong></p>
`)

const T8_POSTVISIT_PLAIN = `Hi {{parent_first_name}},

Thank you for bringing {{patient_first_name}} in today! We truly enjoyed the visit and appreciate your trust in our team.

AFTER YOUR VISIT
- Follow any instructions or prescriptions from {{doctor_name}}
- Schedule any recommended follow-up appointments
- Contact us if {{patient_first_name}} develops new or worsening symptoms
- Complete any referrals or lab work as ordered

HAVE QUESTIONS?
Call us at {{practice_phone}} during office hours.

PATIENT PORTAL
Access visit summaries, lab results, and more at {{practice_website}}

Thank you for being part of the {{practice_name}} family.

{{doctor_name}} & The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T9_WELLCHILD_HTML = shell(`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background:linear-gradient(135deg,#0f766e,#0891b2);border-radius:10px;">
            <tr>
              <td style="padding:24px;text-align:center;">
                <p style="margin:0;font-size:36px;font-family:Arial,Helvetica,sans-serif;">&#127774;</p>
                <p style="margin:8px 0 0;color:#ffffff;font-size:17px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Time for {{patient_first_name}}'s Well-Child Check!</p>
              </td>
            </tr>
          </table>
          <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Hi {{parent_first_name}}, it's that time!</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Based on {{patient_first_name}}'s health record, it's time to schedule their annual well-child visit. These checkups are one of the most important things you can do to support your child's long-term health and development.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:18px 22px;">
                <p style="margin:0 0 10px;color:#0f766e;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">What's included at the {{patient_age}} Well-Child Visit</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td style="padding:5px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Growth &amp; development measurement (height, weight, BMI)</td></tr>
                  <tr><td style="padding:5px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Age-appropriate developmental and behavioral screening</td></tr>
                  <tr><td style="padding:5px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Vaccination review and any due immunizations</td></tr>
                  <tr><td style="padding:5px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Vision and hearing check</td></tr>
                  <tr><td style="padding:5px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Nutrition, sleep, and activity guidance</td></tr>
                  <tr><td style="padding:5px 0;color:#047857;font-size:13px;font-family:Arial,Helvetica,sans-serif;">&#10003;&nbsp; Time for all your questions with {{doctor_name}}</td></tr>
                </table>
              </td>
            </tr>
          </table>
${btn('{{practice_website}}', 'Schedule {{patient_first_name}}\'s Checkup')}
          <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Prefer to call? We're happy to help: <a href="tel:{{practice_phone}}" style="color:#0f766e;font-weight:600;">{{practice_phone}}</a></p>
${divider}
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Well-child visits are typically fully covered by insurance at 100% with no co-pay. Check with your insurer to confirm your benefits.</p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Looking forward to seeing {{patient_first_name}} soon!<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T9_WELLCHILD_PLAIN = `Hi {{parent_first_name}},

It's time to schedule {{patient_first_name}}'s well-child visit!

These annual checkups are one of the most important things you can do for your child's long-term health and development.

WHAT'S INCLUDED AT THE {{patient_age}} WELL-CHILD VISIT
- Growth & development measurement
- Age-appropriate developmental and behavioral screening
- Vaccination review and any due immunizations
- Vision and hearing check
- Nutrition, sleep, and activity guidance
- Time for all your questions with {{doctor_name}}

Schedule online at {{practice_website}}
Or call us at {{practice_phone}}

Note: Well-child visits are typically fully covered by insurance at 100%. Check with your insurer to confirm.

Looking forward to seeing {{patient_first_name}} soon!

The {{practice_name}} Team

---
To unsubscribe: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─────────────────────────────────────────────────────────────────────────────

const T10_NEWSLETTER_HTML = shell(`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
            <tr>
              <td style="text-align:center;">
                <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Monthly Newsletter</p>
                <h1 style="margin:6px 0 0;color:#1e293b;font-size:24px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{month_year}} Health Tips</h1>
                <p style="margin:6px 0 0;color:#64748b;font-size:13px;font-family:Arial,Helvetica,sans-serif;">From the {{practice_name}} family to yours</p>
              </td>
            </tr>
          </table>

          <!-- Article 1 -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f766e;padding:4px 16px;">
                <p style="margin:0;color:#ccfbf1;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Featured Article</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 22px;">
                <h3 style="margin:0 0 8px;color:#1e293b;font-size:16px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{article_1_title}}</h3>
                <p style="margin:0 0 12px;color:#475569;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">{{article_1_excerpt}}</p>
                <a href="{{article_1_link}}" style="color:#0f766e;font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Read more &rarr;</a>
              </td>
            </tr>
          </table>

          <!-- Article 2 -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="background-color:#0369a1;padding:4px 16px;">
                <p style="margin:0;color:#e0f2fe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Child Development</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 22px;">
                <h3 style="margin:0 0 8px;color:#1e293b;font-size:16px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{article_2_title}}</h3>
                <p style="margin:0 0 12px;color:#475569;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">{{article_2_excerpt}}</p>
                <a href="{{article_2_link}}" style="color:#0369a1;font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Read more &rarr;</a>
              </td>
            </tr>
          </table>

          <!-- Seasonal tip -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 6px;color:#92400e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#127807; Seasonal Health Tip</p>
                <p style="margin:0;color:#78350f;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">{{seasonal_tip}}</p>
              </td>
            </tr>
          </table>

${divider}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <p style="margin:0 0 6px;color:#0f766e;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Ready for {{patient_first_name}}'s next visit?</p>
                <a href="tel:{{practice_phone}}" style="color:#0f766e;font-size:16px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">{{practice_phone}}</a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">Wishing your family a healthy {{month_year}}!<br><strong style="color:#1e293b;">The {{practice_name}} Team</strong></p>
`)

const T10_NEWSLETTER_PLAIN = `{{practice_name}} — {{month_year}} Health Newsletter

Hi {{parent_first_name}},

FEATURED ARTICLE
{{article_1_title}}
{{article_1_excerpt}}
Read more: {{article_1_link}}

CHILD DEVELOPMENT
{{article_2_title}}
{{article_2_excerpt}}
Read more: {{article_2_link}}

SEASONAL HEALTH TIP
{{seasonal_tip}}

---

Ready to schedule {{patient_first_name}}'s next visit?
Call us at {{practice_phone}} or visit {{practice_website}}

Wishing your family a healthy {{month_year}}!
The {{practice_name}} Team

---
To unsubscribe from our newsletter: {{unsubscribe_link}}
View in browser: {{view_in_browser_link}}`

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = [
  {
    name:      'Appointment Confirmation',
    type:      'TRANSACTIONAL' as const,
    subject:   'Appointment Confirmed — {{appointment_date}} at {{appointment_time}}',
    htmlBody:  T1_CONFIRMATION_HTML,
    plainBody: T1_CONFIRMATION_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'appointment_date', 'appointment_time', 'doctor_name', 'appointment_type', 'practice_name', 'practice_address', 'practice_phone', 'cancellation_policy_hours', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      '48-Hour Appointment Reminder',
    type:      'TRANSACTIONAL' as const,
    subject:   "Reminder: {{patient_first_name}}'s appointment is in 2 days",
    htmlBody:  T2_REMINDER_48_HTML,
    plainBody: T2_REMINDER_48_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'appointment_date', 'appointment_time', 'doctor_name', 'appointment_type', 'practice_phone', 'cancellation_policy_hours', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'Develo EHR Registration Link',
    type:      'TRANSACTIONAL' as const,
    subject:   "Action Required: Complete {{patient_first_name}}'s Registration Before Your Visit",
    htmlBody:  T3_DEVELO_HTML,
    plainBody: T3_DEVELO_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'doctor_name', 'develo_link', 'practice_name', 'practice_phone', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'NovoPsych Screening Reminder',
    type:      'TRANSACTIONAL' as const,
    subject:   "Please Complete {{patient_first_name}}'s Screening Forms — Appointment in 2-3 Days",
    htmlBody:  T4_NOVOPSYCH_HTML,
    plainBody: T4_NOVOPSYCH_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'doctor_name', 'novopsych_link', 'practice_name', 'practice_phone', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'Same-Day Appointment Reminder',
    type:      'TRANSACTIONAL' as const,
    subject:   "Today is {{patient_first_name}}'s appointment at {{appointment_time}}",
    htmlBody:  T5_SAMEDAY_HTML,
    plainBody: T5_SAMEDAY_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'appointment_date', 'appointment_time', 'doctor_name', 'appointment_type', 'practice_name', 'practice_address', 'practice_phone', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'Appointment Cancellation Confirmation',
    type:      'TRANSACTIONAL' as const,
    subject:   'Appointment Cancelled — {{appointment_date}}',
    htmlBody:  T6_CANCELLED_HTML,
    plainBody: T6_CANCELLED_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'appointment_date', 'appointment_time', 'doctor_name', 'practice_name', 'practice_phone', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'No-Show Follow-Up',
    type:      'TRANSACTIONAL' as const,
    subject:   "We missed you today — Let's reschedule {{patient_first_name}}'s appointment",
    htmlBody:  T7_NOSHOW_HTML,
    plainBody: T7_NOSHOW_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'appointment_date', 'doctor_name', 'practice_name', 'practice_phone', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'Post-Visit Thank You',
    type:      'TRANSACTIONAL' as const,
    subject:   "Thank you for visiting — {{patient_first_name}}'s care summary",
    htmlBody:  T8_POSTVISIT_HTML,
    plainBody: T8_POSTVISIT_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'doctor_name', 'practice_name', 'practice_phone', 'practice_website', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'Well-Child Check Due',
    type:      'AUTOMATED' as const,
    subject:   "It's time for {{patient_first_name}}'s Well Child Check",
    htmlBody:  T9_WELLCHILD_HTML,
    plainBody: T9_WELLCHILD_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'patient_age', 'doctor_name', 'practice_name', 'practice_phone', 'practice_website', 'unsubscribe_link', 'view_in_browser_link'],
  },
  {
    name:      'Monthly Practice Newsletter',
    type:      'BULK' as const,
    subject:   '{{practice_name}} — {{month_year}} Health Tips for Families',
    htmlBody:  T10_NEWSLETTER_HTML,
    plainBody: T10_NEWSLETTER_PLAIN,
    variables: ['parent_first_name', 'patient_first_name', 'month_year', 'article_1_title', 'article_1_excerpt', 'article_1_link', 'article_2_title', 'article_2_excerpt', 'article_2_link', 'seasonal_tip', 'practice_name', 'practice_phone', 'practice_website', 'unsubscribe_link', 'view_in_browser_link'],
  },
]

// ─── Seed runner ──────────────────────────────────────────────────────────────

async function main() {
  console.log('📧 Seeding email templates...\n')

  let created = 0
  let updated = 0

  for (const t of TEMPLATES) {
    const existing = await prisma.emailTemplate.findFirst({
      where:  { name: t.name },
      select: { id: true },
    })

    if (existing) {
      await prisma.emailTemplate.update({
        where: { id: existing.id },
        data:  { ...t, variables: t.variables },
      })
      console.log(`  ↻ Updated : ${t.name}`)
      updated++
    } else {
      await prisma.emailTemplate.create({
        data: { ...t, variables: t.variables, isActive: true },
      })
      console.log(`  ✓ Created : ${t.name}`)
      created++
    }
  }

  console.log(`\n✅ Done — ${created} created, ${updated} updated\n`)
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
