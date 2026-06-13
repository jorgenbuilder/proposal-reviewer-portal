import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface ProposalEmailData {
  proposalId: string;
  title: string;
  topic: string;
  dashboardUrl: string;
  appUrl: string;
}

/**
 * Alert the operator when the forum access credential (User-API-Key) appears to be
 * revoked or invalid, so detection can be re-minted. Sent to ALERT_EMAIL (default the
 * project owner).
 */
export async function sendForumCredentialAlertEmail(detail: string): Promise<boolean> {
  const to = process.env.ALERT_EMAIL || "jorgen@buildnode.io";
  try {
    const { error } = await resend.emails.send({
      from: "ICP Proposals <notifications@icp-proposals.app>",
      to,
      subject: "⚠️ Forum access credential failed (forum-post detection)",
      html: `
        <h2>Forum access credential issue</h2>
        <p>The portal's forum User-API-Key was rejected, so canonical forum-post
        detection is paused for the affected proposal(s).</p>
        <div style="background:#fff3f3;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #f3c0c0;">
          <code style="color:#a00;">${detail}</code>
        </div>
        <p><strong>Fix:</strong> re-mint the key and update <code>FORUM_USER_API_KEY</code>:</p>
        <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">cd ii-automation
STORE_OP=1 FORUM_USER='…' FORUM_PASS='…' node scripts/mint-userapikey.mjs</pre>
        <p style="color:#666;font-size:12px;">Then redeploy / update the Vercel env var.
        Detection auto-resumes on the next proposal once the key is valid.</p>
      `,
    });
    if (error) {
      console.error("Resend error (forum credential alert):", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Forum credential alert email failed:", error);
    return false;
  }
}

/**
 * Alert the operator when an automated verification audit flags a proposal as NOT safely
 * verified — so it is NOT auto-posted. Should be rare (wasm mismatch, blank output, etc.).
 */
export async function sendVerificationFlagEmail(
  proposalId: string,
  reasons: string[],
  runUrl: string | null
): Promise<boolean> {
  const to = process.env.ALERT_EMAIL || "jorgen@buildnode.io";
  try {
    const { error } = await resend.emails.send({
      from: "ICP Proposals <notifications@icp-proposals.app>",
      to,
      subject: `⚠️ Verification audit flagged proposal #${proposalId} (NOT posted)`,
      html: `
        <h2>Verification audit flagged #${proposalId}</h2>
        <p>The automated checker did <strong>not</strong> post a verification note for this
        proposal because the build verification could not be independently confirmed.
        Nothing was posted to the forum.</p>
        <ul>
          ${reasons.map((r) => `<li><code>${r}</code></li>`).join("")}
        </ul>
        ${runUrl ? `<p>Verification run: <a href="${runUrl}">${runUrl}</a></p>` : ""}
        <p style="color:#666;font-size:12px;">Review manually. This alert means a discrepancy
        between the GitHub Actions verification and the on-chain proposal, a blank/missing
        result, or a failed run.</p>
      `,
    });
    if (error) { console.error("Resend error (verification flag):", error); return false; }
    return true;
  } catch (error) {
    console.error("Verification flag email failed:", error);
    return false;
  }
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
