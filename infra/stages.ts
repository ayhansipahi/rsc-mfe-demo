export type StageName = "staging" | "prod";

export interface StageConfig {
  name: StageName;
  account: string;
  region: string;
  domain?: { name: string; certificateArn: string };
  mobile?: { appleAppIds: string; androidPackage: string; androidCertSha256: string };
}

// The `sub` claim prefix of this repository's GitHub OIDC tokens; the deploy roles trust only it. Read yours with
// `gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix`. GitHub's immutable
// subject format adds owner and repository ids, so a renamed or re-created repository does not match.
export const githubSubject = "repo:ayhansipahi@721142/rsc-mfe-demo@1445500800";

export const stages: StageConfig[] = [
  { name: "staging", account: "644789169398", region: "eu-central-1" },
  {
    name: "prod",
    account: "644789169398",
    region: "eu-central-1",
    domain: {
      name: "rscmfe.sph.sh",
      certificateArn: "arn:aws:acm:us-east-1:644789169398:certificate/2ce976c9-3236-4a77-bd0a-bcf27799271c",
    },
    mobile: {
      appleAppIds: "3EWL9B9GPV.sh.sph.rscmfe,H8N47UY3F8.sh.sph.rscmfe",
      androidPackage: "sh.sph.rscmfe",
      androidCertSha256:
        "08:D3:48:FC:4A:42:AD:A3:B9:03:05:3F:D6:68:6E:73:B4:5F:8C:17:A1:18:E9:6A:08:B4:FA:0B:2F:F7:8D:A9",
    },
  },
];

export function prefix(stage: StageConfig): string {
  return `rsc-mfe-${stage.name}`;
}
