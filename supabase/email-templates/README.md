# Supabase email templates

Paste these into **Supabase → Authentication → Emails → Templates**. All
emails carry a 6-digit **code** (`{{ .Token }}`), never a link: links from
the society Gmail land in HKUST junk, and codes work on any device.

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup (first login) | `login-code.html` | `{{ .Token }} is your SASS login code` |
| Magic link (every later login) | `login-code.html` | `{{ .Token }} is your SASS login code` |
| Change email address | `change-email-code.html` | `{{ .Token }} is your code to change your SASS email` |

Also: **Authentication → Sign In / Providers → Email → Secure email change: off**,
so only the NEW address gets a code when someone changes their login email.
