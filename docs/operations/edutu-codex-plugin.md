# Edutu Codex plugin

The Edutu plugin lets a user run a read-only search across Edutu's active, verified, non-duplicate opportunity catalog. The featured prompt is **Find open global opportunities on Edutu.** First use connects an existing Edutu account through Clerk. Users can create an account on [Edutu](https://www.edutu.org/signup). An active live Pro or Scholar entitlement is required for every search. Free, Lite, expired, and sandbox-only subscriptions do not unlock search.

## Backend and OAuth setup

1. Deploy the NestJS API through the Edutu production backend service in Dokploy. It serves Streamable HTTP at `https://backend.edutu.org/mcp`. OAuth discovery is at `https://backend.edutu.org/.well-known/oauth-protected-resource/mcp`. For an isolated staging environment, set `EDUTU_MCP_RESOURCE_URL` to that environment's canonical `/mcp` URL and use a matching staging plugin and Clerk instance.
2. In the Clerk instance configured by `CLERK_ISSUER_URL`, create the custom scope `opportunities:read` with the label **Search Edutu opportunities**. In OAuth application settings, enable JWT access tokens and resource audience claims. Keep the hosted consent flow available.
3. Enable CIMD discovery and restrict admission to explicitly allowed clients. Pre-register the exact Client ID URL shown by the OpenAI connection form, with `opportunities:read` as its application scope. For the stable issuer-identified callback the Client ID URL is `https://chatgpt.com/oauth/client.json`. Leave dynamic client registration disabled. Clerk includes `offline_access` so users can stay connected.
4. Check that the protected resource metadata matches the exact MCP URL and Clerk issuer. An anonymous POST to `/mcp` should return 401 with a `WWW-Authenticate` discovery challenge. In Codex, connect through OAuth and confirm the token exchange uses the MCP URL as its resource. The API validates the signature, issuer, audience, token type, expiry, and scope before opening the MCP server.

## Package and release

The portable package is in `plugins/edutu`. For repo testing, select **Edutu Plugins** in the Codex plugin directory and install **Edutu**. For an upload, zip the contents of `plugins/edutu` at the archive root.

For a public listing, upload the package with its remote MCP server in the OpenAI developer portal, choose OAuth with CIMD and request `opportunities:read offline_access` in the connection form, and complete review before publication. Supply a dedicated active Pro reviewer account via the portal's private fields. The verified publisher should check that Edutu's published privacy policy and terms cover this integration and provide a demo showing the OAuth connection and a successful search.

Verify with a paid test account and a free or Lite account. With paid access, test worldwide browsing, a keyword, a destination, a result limit, and an empty query result. Show returned dates and links in the demo. With unpaid or expired access, confirm search returns `pro_required` and no listings. Also verify the signed-out OAuth prompt and that a token for another audience cannot discover or call tools. Paid account access is handled on Edutu. The plugin contains no purchase flow.

[Clerk CIMD setup](https://clerk.com/docs/guides/configure/auth-strategies/oauth/client-id-metadata-documents) · [OpenAI plugin submission](https://developers.openai.com/plugins/deploy/submission)
