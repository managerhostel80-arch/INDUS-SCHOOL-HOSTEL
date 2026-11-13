# Google Drive database backups

The Admin Settings page can save a database backup to Google Drive and restore a selected backup. Drive access is performed by the server; the service-account private key must never be placed in frontend settings or committed to GitHub.

## Configure the server

1. In Google Cloud, create a service account, enable the Google Drive API, and create a JSON key for the account.
2. Create a folder in a Google Shared Drive and give the service account's `client_email` access to that Shared Drive/folder. The service account needs permission to create, list, and read files. Shared Drives are required because service accounts do not have personal Drive storage.
3. Set `GOOGLE_DRIVE_FOLDER_ID` to the folder ID from its Drive URL.
4. Base64-encode the complete service-account JSON key and set the result as `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`. Set this and `DB_BACKUP_KEY` as private environment variables on the server host; do not commit their values.
5. Redeploy/restart the server. In Admin Settings, enter the configured `DB_BACKUP_KEY`, choose **Export to Google Drive**, or load and select a backup before **Import from Google Drive**.

Restoring replaces all requests, team members, and push subscriptions in the database. Database JSON backups contain media links, not the underlying media files.
