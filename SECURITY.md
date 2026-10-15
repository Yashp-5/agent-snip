# Security policy

Agent Skills contain executable instructions and may bundle scripts. Treat every third-party skill as untrusted until it has been reviewed.

Agent Snip selection and optimization are not authorization mechanisms. Applications must independently enforce:

- filesystem and network isolation;
- tool permissions and user approvals;
- provenance and integrity requirements;
- secret-handling and data-residency policies;
- validation against the original tool schema.

Please report suspected vulnerabilities privately through GitHub Security Advisories after the repository is published. Do not include production secrets or personal data in a report.

