# Mobile push notifications

The app supports Web Push notifications for each phone or browser that enables them. Each device must opt in once. Push notifications can arrive while the app is closed.

## Configure the server

From the `server` directory, generate a VAPID key pair:

```powershell
npx web-push generate-vapid-keys
```

Add the generated values to the server's local `.env` file:

```dotenv
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:<an email address you control>
```

Keep `VAPID_PRIVATE_KEY` secret. Do not commit or share the server `.env` file.

## Store complaint photos permanently

The server uses Cloudinary for new complaint and completion photos when all three
Cloudinary values are configured. Create a Cloudinary account, then add these
environment variables to the backend service on Render:

```dotenv
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<API key>
CLOUDINARY_API_SECRET=<API secret>
```

Keep `CLOUDINARY_API_SECRET` private. Redeploy the backend after setting the
values. New photos will be saved as public Cloudinary URLs. Existing photos that
already return 404 must be uploaded again; this change cannot restore files that
are no longer present on the server.

## Configure hosting

- Host the client on an HTTPS URL and the API on a publicly reachable HTTPS URL. A phone cannot use `localhost` to reach a server running on a different computer.
- Set `VITE_API_BASE_URL` to the API URL before building/deploying the client. Copy `client/.env.example` to `client/.env` for local development, then replace the value with the public API URL for deployment.
- Keep the server VAPID key pair stable. If the keys change, each phone must enable notifications again.
- Restart the backend and rebuild/redeploy the frontend after changing environment values.

## Enable a phone

Open the HTTPS app on each phone, install/add it to the home screen if desired, then tap **Enable phone alerts** and allow notifications. iPhone/iPad Web Push requires iOS/iPadOS 16.4 or later and the site added to the Home Screen.
