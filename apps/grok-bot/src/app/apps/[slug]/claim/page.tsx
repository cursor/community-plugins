import { parseGitHubUrl } from "@directories/plugins/github";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  AppClaim,
  type FileClaim,
  type GitHubClaim,
} from "@/components/app-claim";
import { AppLogo } from "@/components/app-logo";
import { getAppToClaim } from "@/data/apps";
import {
  PROOF_FILE,
  proofLine,
  serverProofAddresses,
} from "@/lib/app-claim-proof";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Claim app",
  robots: { index: false },
};

type Props = { params: Promise<{ slug: string }> };

/**
 * The maker of an app nobody owns proves it's theirs. An app that has an
 * owner, or can't be claimed, has no such page.
 */
export default async function ClaimAppPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await requireViewer(`/apps/${slug}/claim`);
  const app = await getAppToClaim(slug);
  if (!app) notFound();
  if (app.ownerId === viewer.id) redirect("/my-bots");
  if (app.ownerId || !app.source) notFound();

  let github: GitHubClaim | null = null;
  let file: FileClaim;
  if (app.source.kind === "repo") {
    const owner = parseGitHubUrl(app.source.repository)?.owner ?? "";
    const login = viewer.github?.login;
    github = !login
      ? { state: "none", owner }
      : login.toLowerCase() === owner.toLowerCase()
        ? { state: "yours", login }
        : { state: "other", login, owner };
    file = {
      kind: "repo",
      repository: app.source.repository,
      fileName: PROOF_FILE,
    };
  } else {
    file = {
      kind: "server",
      addresses: serverProofAddresses(app.source.url, app.homepage),
    };
  }

  return (
    <div className="shell page submit-page claim-page">
      <h1 className="page-title">Claim {app.name}</h1>
      <p className="lede">
        If you made this app, claim it to edit its listing, keep it up to date,
        and show it on your profile.
      </p>
      <div className="submit-preview claim-app" data-testid="app-preview">
        <div className="head">
          <AppLogo name={app.name} logo={app.logo} size={56} />
          <div style={{ minWidth: 0 }}>
            <h2>{app.name}</h2>
            <p className="desc">{app.description}</p>
          </div>
        </div>
      </div>
      <AppClaim
        appId={app.id}
        slug={app.slug}
        name={app.name}
        github={github}
        file={file}
        line={proofLine(viewer.id)}
      />
    </div>
  );
}
