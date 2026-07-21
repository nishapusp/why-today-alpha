const REPO = "nishapusp/why-today-alpha";
const BRANCH = "main";

/**
 * Server-side only — requires ADMIN_GITHUB_TOKEN as a Netlify environment
 * variable. Needs a fine-grained PAT scoped to this repo with BOTH
 * "Contents: Read and write" (for editing/deleting story data) AND
 * "Actions: Read and write" (for triggering the regenerate-story
 * workflow) — a Contents-only token (which is what's been used for
 * manual git pushes elsewhere) is NOT enough for the regenerate action
 * specifically; confirmed earlier this session that a Contents-only
 * token gets a 403 on workflow dispatch calls.
 */
function requireToken(): string {
  const token = process.env.ADMIN_GITHUB_TOKEN;
  if (!token) throw new Error("ADMIN_GITHUB_TOKEN is not configured");
  return token;
}

async function githubRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = requireToken();
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${body.slice(0, 500)}`);
  }
  // 204 No Content on some endpoints (e.g. workflow dispatch) — nothing to parse.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Reads a file's current content + SHA (needed to write back safely). */
export async function readRepoFile(filePath: string): Promise<{ content: string; sha: string }> {
  const data = (await githubRequest(`/contents/${filePath}?ref=${BRANCH}`)) as { content: string; sha: string };
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

/**
 * Writes a file back. Requires the SHA from a just-prior readRepoFile —
 * GitHub rejects the write with a 409 if the file changed since that SHA
 * was read (optimistic concurrency), which is the correct behavior here:
 * better to fail loudly than silently clobber a change from the
 * scheduled pipeline that landed in between.
 */
export async function writeRepoFile(filePath: string, content: string, sha: string, message: string): Promise<void> {
  await githubRequest(`/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString("base64"),
      sha,
      branch: BRANCH,
    }),
  });
}

/** Triggers a workflow_dispatch — same action as clicking "Run workflow" in the Actions tab. */
export async function triggerWorkflow(workflowFile: string, inputs: Record<string, string>): Promise<void> {
  await githubRequest(`/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: BRANCH, inputs }),
  });
}
