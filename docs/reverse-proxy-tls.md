# Reverse Proxy TLS (LAN)

If Bakarr is accessed by other devices on your LAN, terminate HTTPS at a reverse proxy and forward traffic to Bakarr on `127.0.0.1:6789`.

## Caddy example

```caddyfile
bakarr.local {
  encode zstd gzip

  reverse_proxy 127.0.0.1:6789 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-For {remote_host}
  }
}
```

Notes:
- Caddy can issue local certs for internal domains with its local CA.
- Import Caddy local CA on client devices to avoid browser warnings.

## Nginx example

```nginx
server {
    listen 443 ssl http2;
    server_name bakarr.local;

    ssl_certificate     /etc/ssl/certs/bakarr.local.crt;
    ssl_certificate_key /etc/ssl/private/bakarr.local.key;

    location / {
        proxy_pass http://127.0.0.1:6789;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Recommended runtime settings

- Keep `secure_cookies = true` in `config.toml`.
- Keep `allow_api_key_in_query = false` unless you need query-token fallback for SSE/stream.
- Restrict `cors_allowed_origins` to trusted origins only.
