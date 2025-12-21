# Backends Test Lab

A single Docker Compose stack that spins up Zerobyte alongside emulators for **all supported volume and repository backends**, including rclone. Use this to test every backend type locally without external accounts.

## What's included

### Volume backends (sources to back up)

| Backend | Emulator | Container name | Notes |
|---------|----------|----------------|-------|
| Directory | bind mount | — | Uses `./testdata` |
| SMB | dperson/samba | `testlab-smb` | |
| WebDAV | hacdias/webdav | `testlab-webdav-vol` | Port 6065 |
| NFS | erichough/nfs-server | `testlab-nfs` | Privileged mode |
| rclone | (uses remotes below) | — | See rclone section |

### Repository backends (backup targets)

| Backend | Emulator | Container name | Notes |
|---------|----------|----------------|-------|
| Local | — | — | Uses Zerobyte's internal storage |
| S3 | MinIO | `testlab-minio` | Bucket: `zerobyte` |
| R2 | MinIO | `testlab-minio` | Bucket: `zerobyte-r2` |
| Azure Blob | Azurite | `testlab-azurite` | |
| GCS | fake-gcs-server | `testlab-fakegcs` | |
| REST | restic/rest-server | `testlab-rest-server` | |
| SFTP | atmoz/sftp | `testlab-sftp` | |
| rclone | (uses remotes below) | — | See rclone section |

### Rclone remotes (defined in `rclone.conf`)

| Remote | Target | Container name | Use for |
|--------|--------|----------------|---------|
| `testlab-s3` | MinIO S3 | `testlab-minio` | Volume or repo |
| `testlab-webdav` | WebDAV | `testlab-webdav-rclone` | Volume or repo |
| `testlab-sftp` | SFTP | `testlab-sftp` | Volume or repo |

## Prerequisites

- Docker + Docker Compose
- Linux host (recommended) — NFS and some mount operations require Linux kernel features

> ⚠️ **Docker Desktop**: With WSL2 backend, most features work. Native macOS Docker Desktop may have FUSE limitations.

## Setup

1. Copy the env file:

   ```bash
   cp .env.example .env
   ```

2. Start the stack:

   ```bash
   docker compose up -d
   ```

   > **Test data**: On first startup, the `testdata-init` container automatically generates random folders and files in all volume backends (local directory, SMB, WebDAV, SFTP). No manual data creation needed!

3. Open Zerobyte:

   - `http://localhost:4096`

### What test data is generated?

Each volume backend receives the same folder structure:

```
├── README.txt
├── generated_at.txt
├── documents/
│   ├── doc_1.txt, doc_2.txt, doc_3.txt
│   └── data_1.bin, data_2.bin, data_3.bin (random binary data)
├── images/
│   └── image_1.raw, image_2.raw (random binary data)
├── logs/
│   └── app.log
└── projects/
    ├── app/
    │   ├── package.json
    │   └── index.js
    └── lib/
        └── version.js
```

---

## Creating volumes in Zerobyte

Use these settings in the Zerobyte UI. All credentials use `env://` placeholders to keep secrets out of the database.

### Directory (local bind mount)

| Field | Value | Required |
|-------|-------|----------|
| Type | Directory | ✓ |
| Path | `/testdata` | ✓ |
| Read Only | `false` | (optional) |

### SMB

| Field | Value | Required |
|-------|-------|----------|
| Type | SMB | ✓ |
| Server | `smb` | ✓ |
| Share | `data` | ✓ |
| Username | `env://SMB_USER` | ✓ |
| Password | `env://SMB_PASSWORD` | ✓ |
| Version | `3.0` | (default) |
| Port | `445` | (default) |
| Domain | — | (optional) |
| Read Only | `false` | (optional) |

### WebDAV

| Field | Value | Required |
|-------|-------|----------|
| Type | WebDAV | ✓ |
| Server | `webdav-vol` | ✓ |
| Path | `/` | ✓ |
| Username | `env://WEBDAV_VOL_USER` | (optional) |
| Password | `env://WEBDAV_VOL_PASSWORD` | (optional) |
| Port | `6065` | ✓ |
| SSL | `false` | (optional) |
| Read Only | `false` | (optional) |

### NFS

> ⚠️ **Requires privileged mode**: The NFS server container runs in privileged mode. This works on Docker Desktop with WSL2 backend.

| Field | Value | Required |
|-------|-------|----------|
| Type | NFS | ✓ |
| Server | `nfs` | ✓ |
| Export Path | `/data` | ✓ |
| Version | `4` | ✓ (must be 3, 4, or 4.1) |
| Port | `2049` | (default) |
| Read Only | `false` | (optional) |

### Rclone (volume)

Rclone volumes use remotes defined in `rclone.conf`. Three remotes are pre-configured:

| Field | Value | Required |
|-------|-------|----------|
| Type | rclone | ✓ |
| Remote | `testlab-s3` | ✓ |
| Path | `zerobyte-rclone` | ✓ |
| Read Only | `false` | (optional) |

**Alternative remotes:**

| Remote | Path | Description |
|--------|------|-------------|
| `testlab-s3` | `zerobyte-rclone` | MinIO S3 bucket |
| `testlab-webdav` | `/` | WebDAV server |
| `testlab-sftp` | `/upload` | SFTP server |

---

## Creating repositories in Zerobyte

### Local

| Field | Value | Required |
|-------|-------|----------|
| Type | Local | ✓ |
| Name | (any name) | ✓ |
| Path | — | (optional) |

### S3 (MinIO)

| Field | Value | Required |
|-------|-------|----------|
| Type | S3 | ✓ |
| Endpoint | `http://minio:9000` | ✓ |
| Bucket | `zerobyte` | ✓ |
| Access Key ID | `env://S3_ACCESS_KEY_ID` | ✓ |
| Secret Access Key | `env://S3_SECRET_ACCESS_KEY` | ✓ |

MinIO Console: `http://localhost:9001` (login: value of `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from `.env`).

### R2 (Cloudflare R2 — MinIO emulated)

R2 is S3-compatible. Use the same MinIO but with a separate bucket and credentials:

| Field | Value | Required |
|-------|-------|----------|
| Type | R2 | ✓ |
| Endpoint | `http://minio:9000` | ✓ |
| Bucket | `zerobyte-r2` | ✓ |
| Access Key ID | `env://R2_ACCESS_KEY_ID` | ✓ |
| Secret Access Key | `env://R2_SECRET_ACCESS_KEY` | ✓ |

### Azure Blob (Azurite)

| Field | Value | Required |
|-------|-------|----------|
| Type | Azure | ✓ |
| Container | `zerobyte` | ✓ |
| Account Name | `env://AZURE_ACCOUNT_NAME` | ✓ |
| Account Key | `env://AZURE_ACCOUNT_KEY` | ✓ |
| Endpoint Suffix | `azurite:10000` | (optional) |

> Note: Azurite uses a well-known dev account (`devstoreaccount1`). The container is auto-created on first use.

### GCS (fake-gcs-server)

| Field | Value | Required |
|-------|-------|----------|
| Type | GCS | ✓ |
| Bucket | `zerobyte` | ✓ |
| Project ID | `env://GCS_PROJECT_ID` | ✓ |
| Credentials JSON | `env://GCS_CREDENTIALS_JSON` | ✓ |

> Note: All fields are required. The fake-gcs-server emulator accepts dummy credentials, so the `.env.example` provides a minimal service account JSON.

### REST Server

| Field | Value | Required |
|-------|-------|----------|
| Type | REST | ✓ |
| URL | `http://rest-server:8000` | ✓ |
| Path | `/` | (optional) |
| Username | — | (optional) |
| Password | — | (optional) |

REST server runs without authentication by default. To enable auth, modify `docker-compose.yml` to remove the `--no-auth` flag and set `REST_USER` / `REST_PASSWORD`.

### SFTP

The SSH key pair is **auto-generated** by an init container and shared via a Docker volume.

| Field | Value | Required |
|-------|-------|----------|
| Type | SFTP | ✓ |
| Host | `sftp` | ✓ |
| User | `env://SFTP_USER` | ✓ |
| Path | `/upload` | ✓ |
| Private Key | `file://sftp_key` | ✓ |
| Port | `22` | (default) |

> **How it works**: The `sftp-keygen` init container generates an Ed25519 SSH key pair on first startup. The private key is mounted into Zerobyte at `/run/secrets/sftp_key`, and the public key is mounted into the SFTP server. The `file://` placeholder reads from `/run/secrets/` by default.

### Rclone (repository)

Rclone repositories use remotes defined in `rclone.conf`. This allows using any rclone-supported backend as a Restic repository.

| Field | Value | Required |
|-------|-------|----------|
| Type | rclone | ✓ |
| Remote | `testlab-s3` | ✓ |
| Path | `zerobyte-rclone-repo` | ✓ |

**Alternative remotes:**

| Remote | Path | Description |
|--------|------|-------------|
| `testlab-s3` | `zerobyte-rclone-repo` | MinIO S3 bucket |
| `testlab-webdav` | `/restic-repo` | WebDAV server |
| `testlab-sftp` | `/upload/restic-repo` | SFTP server |

> **How rclone works**: The `rclone.conf` file is mounted into Zerobyte at `/root/.config/rclone/rclone.conf`. Remotes defined there can be used for both volumes (sources) and repositories (targets).

---

## Stopping and cleaning up

```bash
# Stop containers
docker compose down

# Stop and remove volumes (deletes all test data)
docker compose down -v
```

## Troubleshooting

### Volumes

- **SMB mount fails**: Ensure Zerobyte has `SYS_ADMIN` capability and `/dev/fuse` device.
- **NFS mount fails**: Check that the NFS server is running: `docker logs testlab-nfs`. Ensure the container is in privileged mode.
- **WebDAV "No such device"**: Ensure `/dev/fuse` is available. On native macOS Docker Desktop, FUSE may not work.
- **WebDAV auth errors**: Check that `WEBDAV_VOL_USER` and `WEBDAV_VOL_PASSWORD` match in `.env`.

### Repositories

- **MinIO bucket not found**: The `minio-init` container should create it automatically. Check `docker logs testlab-minio-init`.
- **Azurite connection refused**: Wait a few seconds after startup; Azurite can be slow to initialize.
- **GCS emulator issues**: Ensure the `external-url` matches how Zerobyte reaches the container (`http://fakegcs:4443`).
- **REST server unauthorized**: By default, auth is disabled. If you enabled it, ensure credentials match.
- **SFTP connection refused**: The SSH key is auto-generated on first startup. Check `docker logs testlab-sftp-keygen` to verify key generation succeeded. Ensure you're using `file://sftp_key` for the private key field (reads from `/run/secrets/`).
- **Rclone remote not found**: Ensure `rclone.conf` is mounted at `/root/.config/rclone/rclone.conf`. Check `docker logs zerobyte` for rclone errors.

## Notes

- All credentials in `.env.example` are **test-only defaults** — do not use in production.
- The `env://...` placeholders keep secrets out of the Zerobyte database. They are resolved at runtime from environment variables passed to the Zerobyte container.
- NFS server runs in **privileged mode** to access kernel NFS functionality.
- R2 and S3 share the same MinIO server but use different buckets and can have different credentials for testing isolation.
- Rclone remotes are defined in `rclone.conf` with hardcoded credentials for simplicity. In production, you'd manage credentials securely.
- Test data is automatically generated on first startup in all volume backends.
