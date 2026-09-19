# AGENTS.md

## Git workflow

- After completing a task, always commit and push without asking.
  Commit messages: English, imperative, concise summary line + body if needed.
- Before pushing, `git pull --rebase` if the remote is ahead.
- If the working directory is not a git repo, initialize one, create a
  PRIVATE GitHub repo (`gh repo create <name> --private --source . --push`)
  and push there. Never publish the user's code publicly.
