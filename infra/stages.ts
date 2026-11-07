export type StageName = "staging" | "prod";

export interface StageConfig {
  name: StageName;
  account: string;
  region: string;
  domain?: { name: string; certificateArn: string };
  mobile?: { appleAppIds: string; androidPackage: string; androidCertSha256: string };
}

export const githubRepo = "ayhansipahi/rsc-mfe-demo";

export const stages: StageConfig[] = [
  { name: "staging", account: "644789169398", region: "eu-central-1" },
  {
    name: "prod",
    account: "644789169398",
    region: "eu-central-1",
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
