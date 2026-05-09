// Serves /.well-known/security.txt per RFC 9116. Allows researchers
// to find the right contact and policy for vulnerability reports
// without guessing.

export const dynamic = "force-static";

const ONE_YEAR_FROM_NOW = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const BODY = `Contact: mailto:security@spyprophet.app
Expires: ${ONE_YEAR_FROM_NOW}T00:00:00.000Z
Preferred-Languages: en
Canonical: https://www.spyprophet.app/.well-known/security.txt
Policy: https://www.spyprophet.app/disclosures
`;

export function GET() {
  return new Response(BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
