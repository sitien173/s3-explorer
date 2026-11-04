# Manual verification checklist

Run these checks on a desktop session with a working keyring and access to the
AWS account. Use test resources where possible.

- [ ] Sign in with AWS SSO, select the intended profile, and verify its buckets
  load without entering long-lived access keys.
- [ ] Expire or revoke the SSO session, refresh the connection, and verify the
  expired-session banner explains that sign-in is needed again.
- [ ] Browse a bucket in a region different from the profile's configured
  region, and verify the region redirect allows the bucket to load.
- [ ] Add a connection and save its secret while the desktop keyring is
  available; restart the app and verify the secret remains available through
  the keyring.
- [ ] Install and launch the AppImage; verify the app opens and can browse a
  test bucket.
- [ ] Install the .deb on a supported Debian/Ubuntu desktop; verify its
  dependencies install and the app launches and browses a test bucket.
