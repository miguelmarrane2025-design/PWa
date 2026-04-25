BotSquad Video Uploads
======================

Large videos must not be sent as JSON or base64.

The app now supports:
- `POST /api/video/upload` for normal multipart uploads.
- `POST /api/video/upload/init`, `/chunk`, `/complete` for chunked uploads.
- `POST /api/video/import-url` for direct/public links.
- `POST /api/video/import-server-file` for files already inside `storage/uploads`.

If Nginx is in front of the backend, configure the site/server block with:

```
client_max_body_size 2048M;
```

This avoids 413 for normal multipart uploads. Files above the practical proxy limit should use chunk upload or import by URL/server file.
