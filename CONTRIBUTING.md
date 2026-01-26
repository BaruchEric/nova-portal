# Contributing to Nova Portal

## Collaborators

| Account | Role | SSH Host |
|---------|------|----------|
| **BaruchEric** | Owner (Eric) | `github.com` |
| **novasinclair16** | Developer (Nova) | `github-nova` |

## Git Setup

Both accounts can push to this repo. Use the appropriate remote:

```bash
# Push as Eric (owner)
git push origin main

# Push as Nova 
git push nova main
```

## Commit Conventions

### Eric's commits
```
feat: add new feature
fix: bug fix
docs: update docs
```

### Nova's commits
```
✨ feat: add new feature
🐛 fix: bug fix
📝 docs: update docs
🔧 chore: maintenance
```

## Workflow

1. **Feature branches**: Create branches for new features
2. **Direct push**: Small fixes can go directly to main
3. **Code review**: Tag each other for significant changes

## Deployment

Nova handles deployments via Cloudflare:
```bash
cd public
wrangler pages deploy . --project-name=nova-portal
```

## Questions?

Chat with Nova at https://nova.beric.ca 💬
