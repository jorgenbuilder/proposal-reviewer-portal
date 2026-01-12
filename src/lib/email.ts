import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface ProposalEmailData {
  proposalId: string;
  title: string;
  topic: string;
  dashboardUrl: string;
  appUrl: string;
}

export async function sendProposalNotificationEmail(
  to: string,
  proposal: ProposalEmailData
): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: "ICP Proposals <notifications@icp-proposals.app>",
      to,
      subject: `New Proposal: ${proposal.title}`,
      html: `
        <h2>New ICP Governance Proposal</h2>
        <p>A new proposal has been submitted that matches your subscriptions.</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h3 style="margin: 0 0 8px 0;">#${proposal.proposalId}: ${proposal.title}</h3>
          <p style="margin: 0; color: #666;">Topic: ${proposal.topic}</p>
        </div>

        <p>
          <a href="${proposal.appUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View in App
          </a>
          &nbsp;&nbsp;
          <a href="${proposal.dashboardUrl}" style="color: #000;">
            View on IC Dashboard
          </a>
        </p>

        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />

        <p style="color: #666; font-size: 12px;">
          You're receiving this because push notification delivery failed.
          This is a fallback notification from ICP Proposal Reviewer.
        </p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Email send failed:", error);
    return false;
  }
}
