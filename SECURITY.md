# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in RSS Lobster, please report it responsibly.

**Do not open a public issue.** Instead, email **hector@rsslobster.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive an acknowledgment within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Considerations

RSS Lobster generates static HTML from user-provided content. Key security areas:

- **XSS prevention** — All user content is sanitized before HTML generation
- **No JavaScript in output** — Generated sites contain zero client-side JavaScript
- **No database** — No SQL injection surface; data lives in files and git
- **Minimal dependencies** — Small dependency tree reduces supply chain risk
- **RSS reader fetch scope** — The RSS reader fetches URLs provided by the user (feed subscriptions). It does not validate that resolved IPs are public. If you run RSS Lobster on shared or cloud infrastructure, be aware that a subscription to an internal URL (e.g., cloud metadata endpoints) could expose internal data. This is acceptable for the intended use case (personal blogging tool on your own machine) but should be considered if deploying in a multi-tenant environment.

## Disclosure Policy

We follow coordinated disclosure. Once a fix is released, we will:

1. Credit the reporter (unless they prefer anonymity)
2. Publish a security advisory describing the issue and fix
3. Release a patched version
