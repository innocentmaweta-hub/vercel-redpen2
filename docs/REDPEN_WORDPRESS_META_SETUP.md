# RedPen WordPress persistence setup

RedPen stores cloud sessions and grading history in WordPress user meta through `/wp-json/wp/v2/users/<id>`.

WordPress only exposes custom user meta through the REST API when that meta is registered with `show_in_rest => true`. The repository now includes `wordpress-plugin/redpen-user-meta.php` for this purpose.

## Install

1. Copy `wordpress-plugin/redpen-user-meta.php` into the WordPress site's `wp-content/plugins/redpen-user-meta/` directory.
2. Activate **RedPen User Meta** in WordPress Admin → Plugins.
3. Confirm the RedPen API's WordPress Application Password has permission to edit users.
4. In the Vercel environment, set the WordPress URL, username/application-password, and a strong `JWT_SECRET`.
5. Sign in to RedPen and verify that creating a session survives a page reload.

## Required environment variables

Use `.env.example` as the template. Never commit `.env` or real credentials.

## Smoke test

After deployment, an authenticated user should be able to:

- `GET /api/sessions` and receive `{ "sessions": [] }` or their saved sessions.
- `POST /api/sessions` to create/update a session.
- `DELETE /api/sessions?id=<id>` to remove a session.
- `GET /api/history` and receive `{ "history": [] }` or their saved records.

If WordPress cannot persist the metadata, the API now returns a storage error instead of falsely reporting success.
