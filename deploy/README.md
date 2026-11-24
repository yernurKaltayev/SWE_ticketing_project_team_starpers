# Deploying BiletFlow to one server

The whole stack (API, worker, PostgreSQL, MinIO, MailHog, the production web build) runs
with Docker Compose on one Linux VM, behind Caddy for automatic HTTPS. The web and the API
share one origin, so the HttpOnly refresh cookie works with no CORS setup.

```
internet ──443──▶ caddy ──▶ web (nginx: SPA + proxy /api, /health, /c/) ──▶ api ──▶ postgres
                                                                              ├──▶ minio
                                                         worker ──────────────┴──▶ mailhog / SMTP
```

Only ports 22, 80 and 443 need to be reachable. PostgreSQL, MinIO and the API are not
published on the host; MailHog is bound to the server's loopback only.

## Tested setup

Oracle Cloud Always Free, `VM.Standard.A1.Flex` (ARM, 2 OCPU / 12 GB), Ubuntu 24.04,
Docker 29 with Compose v5. Any x86 or ARM VM with 2 GB+ RAM and Docker Compose v2.24+
works the same way.

## 1. Server

1. Create the VM with a public IPv4 address and your SSH key.
2. Allow inbound TCP **80** and **443** in the cloud firewall. On Oracle Cloud this is the
   subnet's Security List (Destination Port Range, Source Port left as All), plus any NSG.
3. Oracle's Ubuntu images also reject everything except SSH inside the VM:

   ```bash
   sudo iptables -I INPUT 5 -p tcp --dport 80 -m state --state NEW -j ACCEPT
   sudo iptables -I INPUT 5 -p tcp --dport 443 -m state --state NEW -j ACCEPT
   sudo netfilter-persistent save
   ```

4. Install Docker:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"   # log out and back in
   ```

5. ARM servers only: MailHog publishes no arm64 image, so enable amd64 emulation once:

   ```bash
   docker run --privileged --rm tonistiigi/binfmt --install amd64
   ```

## 2. Configure

```bash
git clone https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers.git biletflow
cd biletflow/deploy
cp .env.example .env
chmod 600 .env
```

Edit `.env`: set `DOMAIN`, `WEB_BASE_URL` and `PUBLIC_BASE_URL` to your host name, and
replace every `CHANGE` secret with `openssl rand -hex 32`. Without a domain, use
`<ip-with-dashes>.sslip.io` (for example `1-2-3-4.sslip.io`); Caddy gets a real
certificate for it.

`POSTGRES_PASSWORD` and the MinIO credentials are applied only when their volumes are
first created. Changing them later needs the volumes recreated (which deletes the data).

## 3. Start and seed

```bash
docker compose up -d --build --wait
set -a; . ./.env; set +a
docker compose exec -e SEED_PASSWORD="$SEED_PASSWORD" api python -m scripts.seed
```

The API applies migrations on start. In production the seed script refuses the default
demo password, so `SEED_PASSWORD` must be set. Check:

```bash
curl -I https://$DOMAIN/health
```

Swagger is at `https://$DOMAIN/api/v1/docs`.

## Email

Until `SMTP_*` is set, mail goes to MailHog and never leaves the server, so new accounts
cannot verify their email. Read it through an SSH tunnel:

```bash
ssh -L 8025:127.0.0.1:8025 ubuntu@<server>
# then open http://localhost:8025
```

For real email, fill in the `SMTP_*` lines in `.env` (see "Send real email" in
`backend/README.md`) and run `docker compose up -d`.

## Telegram phone verification

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in `.env` (see "Verify phones with
Telegram" in `backend/README.md`) and run `docker compose up -d`. Without them the account page
hides the action. Use a different bot for local development than for the server: two workers
polling one bot would take each other's messages.

## Continuous deployment

`.github/workflows/deploy.yml` deploys every master commit once all CI that ran for it
(Backend CI, Frontend foundation) has passed. Changes only under `deploy/` run no CI and
deploy on push; pull requests that touch `deploy/` only get validated. A failed CI run
blocks the deploy, and a deploy can also be started by hand from the Actions tab
(Deploy → Run workflow).

On the server, `deploy/deploy.sh <sha>` fetches master, deploys the commit only if it
is still the tip of master, runs `docker compose up -d --build --wait`, and rolls back to
the previous commit if the stack does not become healthy (migrations are not reverted).

CI reaches the server with its own SSH key, restricted in `~/.ssh/authorized_keys` to a
forced command, so the key cannot open a shell, forward ports or run anything but
`deploy/ci-deploy.sh` with a commit sha:

```bash
# on your machine: a key used only by CI
ssh-keygen -t ed25519 -N "" -C biletflow-ci-deploy -f ~/.ssh/biletflow_ci_deploy

# on the server: allow it to run the deploy script and nothing else
echo "command=\"$HOME/biletflow/deploy/ci-deploy.sh\",restrict $(cat biletflow_ci_deploy.pub)" \
  >> ~/.ssh/authorized_keys
```

Repository settings (Settings → Secrets and variables → Actions; on a personal-account
repository only its owner can set these):

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | the private key `~/.ssh/biletflow_ci_deploy` |
| Secret | `DEPLOY_HOST` | server IP |
| Secret | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <server IP>` |
| Variable | `DEPLOY_URL` | `https://<DOMAIN>` (smoke check and environment link) |

## Update by hand

```bash
cd ~/biletflow && git pull && cd deploy && docker compose up -d --build --wait
```

## Operations

- Logs: `docker compose logs -f api worker caddy`
- Daily `pg_dump` into `backend/backups/`: `docker compose --profile ops up -d backup`
- Stop: `docker compose down` (volumes, and so the data, are kept; `down -v` deletes them)
