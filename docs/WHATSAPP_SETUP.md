# WhatsApp Cloud API setup

How the live SarafuPay number (+255 650 972 587) is wired. Use the same steps for your own number. The `/chat` simulator works without any of this.

## 1. Meta app and WhatsApp account

1. developers.facebook.com → **Create app** → use case *Connect with customers through WhatsApp*, linked to your business portfolio.
2. WhatsApp Manager → add a phone number that is **not** registered in the WhatsApp or WhatsApp Business app, verify it by SMS, and set the display name (it is reviewed by Meta).
3. Business portfolio → **System users** → create one, assign the app and the WhatsApp account, then generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`.

## 2. Register the number and subscribe the app

With the system-user token (Graph API Explorer or curl):

```bash
# register the phone number for Cloud API (6-digit PIN of your choice)
POST /{PHONE_NUMBER_ID}/register        {"messaging_product":"whatsapp","pin":"123456"}

# let your app receive events from the WhatsApp account
POST /{WABA_ID}/subscribed_apps
```

## 3. Webhook

- Callback URL: `https://<your-app>/api/whatsapp`
- Verify token: any random string, the same value as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field.

On a sleeping free Render instance, wake the app first (open `/api/health`) so Meta's verification request doesn't time out.

## 4. Environment variables

| Env | Value |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | System-user token |
| `WHATSAPP_PHONE_NUMBER_ID` | From WhatsApp Manager → Phone numbers |
| `WHATSAPP_APP_SECRET` | App settings → Basic (used to verify `X-Hub-Signature-256`) |
| `WHATSAPP_VERIFY_TOKEN` | Same string as in the webhook config |
| `WHATSAPP_DISPLAY_NUMBER` | Number in international format without `+`, e.g. `255650972587`. Share cards then use `wa.me` links |

## Notes

- **Duplicate deliveries:** Meta retries a webhook if the response is slow (for example, on a cold start). The handler answers immediately and de-duplicates by message ID in the `processed_messages` table.
- **24-hour window:** free-form messages can only be sent within 24 hours of the user's last message. Reminders to people who haven't messaged recently need approved message templates (on the roadmap).
- **Groups:** Cloud API bots can't join ordinary WhatsApp groups, so organisers forward the share card (with a `wa.me` deep link) into their group instead.
