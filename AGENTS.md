# Contribution Guidelines for Codex Agents

This repository contains the **Cicero_V2** backend (Node.js/Express). Follow these rules when creating pull requests or modifying files.

## Style
- Adhere to the naming conventions in `docs/naming_conventions.md`.
- JavaScript functions and variables use `camelCase`.
- Database table and column names use `snake_case`.
- Place code in the appropriate folder (`src/controller`, `src/service`, etc.).

## Testing
- Run `npm run lint` and `npm test` before committing. Tests rely on Node.js v20+.
- If a command fails because of missing dependencies or network restrictions, note it in the PR under **Testing**.

## Data Mining Workflow
- The Instagram data mining cron is defined in `src/cron/cronInstaDataMining.js` and runs daily at **23:40** (Asia/Jakarta).
- For each active client the cron executes:
  1. `fetchDmPosts` – fetch posts and store extended metadata.
  2. `fetchDmPostInfoForUser` – fetch detailed info and metrics for today’s posts.
  3. `fetchDmHashtagsForUser` – analyze captions and store hashtag info.
  4. `handleFetchLikesInstagramDM` – collect likes for today’s posts.
  5. `handleFetchKomentarInstagramDM` – collect comments for today’s posts.

## Pull Request Notes
- Keep PR titles concise and summarize changes in the body.
- Reference affected file paths and line numbers when relevant.
- Ensure the working tree is clean before submitting.

