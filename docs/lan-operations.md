# Bakarr LAN Operations Guide

This guide covers a simple production-style LAN setup using `systemd`, health checks, and backup/restore.

## 1) Run as a systemd service

Create `/etc/systemd/system/bakarr.service`:

```ini
[Unit]
Description=Bakarr daemon
After=network.target

[Service]
Type=simple
User=bakarr
Group=bakarr
WorkingDirectory=/opt/bakarr
ExecStart=/opt/bakarr/bakarr daemon
Restart=on-failure
RestartSec=5
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bakarr
sudo systemctl status bakarr
```

## 2) Health endpoints

- Liveness: `GET /api/system/health/live`
- Readiness: `GET /api/system/health/ready`

Examples:

```bash
curl -sSf http://localhost:6789/api/system/health/live
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:6789/api/system/health/ready
```

Readiness returns:
- `200` when database and qBittorrent checks are ready
- `503` when one or more checks are not ready

## 3) Backups

Create a compressed backup (database + config + images):

```bash
bash scripts/backup.sh
```

Optional output directory:

```bash
bash scripts/backup.sh /opt/bakarr /opt/bakarr/backups
```

## 4) Restore

Stop Bakarr first:

```bash
sudo systemctl stop bakarr
```

Restore archive:

```bash
bash scripts/restore.sh /opt/bakarr/backups/bakarr-backup-YYYYmmdd-HHMMSS.tar.gz /opt/bakarr
```

Start Bakarr again:

```bash
sudo systemctl start bakarr
sudo systemctl status bakarr
```
