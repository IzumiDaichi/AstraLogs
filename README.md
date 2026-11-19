# AstraLogs

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for Supabase configuration, Cloudflare Pages Functions deployment, environment secrets, and manual testing.

## Make.com report delivery

Create a scenario with **Webhooks → Custom webhook** as the **Instant** trigger. Enable **Get request headers**, add the webhook URL as Cloudflare's `MAKE_WEBHOOK_URL`, and set the scenario to run immediately when data arrives. Do not add a schedule or any other modules except the filter and Gmail module below.

The sender must POST JSON with these fields:

| Field | Use |
| --- | --- |
| `username` | Available to the scenario; not used in the email mapping below |
| `delivery_email` | Gmail **To** |
| `subject` | Gmail **Subject** |
| `filename` | Attachment file name |
| `file_base64` | Base64-encoded contents of the already-generated `.docx` or `.xlsx` |

Place a filter between the webhook and **Gmail → Send an email**. In the filter, select the webhook request header `x-api-key`, choose **Equal to**, and compare it with the same secret used by the sender as `MAKE_SECRET`. Do not put the secret in the JSON body.

Configure Gmail:

- **To:** map `delivery_email`
- **Subject:** map `subject`
- **Body:** `Your accomplishment report is attached.`
- **Attachment → File name:** map `filename`
- **Attachment → Data:** `toBinary(file_base64; base64)` using the `file_base64` token from the webhook

Do not add Google Drive, Google Sheets, a data store, a database, AI, a router, or an iterator. The scenario only validates the header and emails the received file; it does not create or edit the document.

### Test payload

Turn on **Run once**, then POST this JSON to the custom webhook with an `x-api-key` request header containing the configured secret. This base64 value decodes to a small valid DOCX test file; replace the email address with an inbox you can check.

```json
{
  "username": "Sample Intern",
  "delivery_email": "you@example.com",
  "subject": "AstraLogs report attachment test",
  "filename": "make-test-report.docx",
  "file_base64": "UEsDBBQAAAAIAKmycF021wx85AAAAF8BAAARAAAAd29yZC9kb2N1bWVudC54bWxFUMtuwyAQ/BXEvcGxkiqybOeWW6RKbT8A442xYlgE25L06wtEli+zO/uYWWjPD7OwX/BhRtvx/a7iDKzCcbZTx7+/Lm8nzgJJO8oFLXT8CYGf+zY2I6ofA5ZYErChiR3XRK4RIigNRoYdOrCpd0NvJCXqJxHRj86jghCSvllEXVXvwsjZ8iw54PjM0WXwGai/yjuwCINGvDNJJJUurgSBWpEnMvqCZS+Aoo+y7KbPPxbzZfu6PqSHxUan/HhKuXgNXKVPVUKX6ofXiJ8nTRsdkAjNxhe4rV1RTFc/sd4vtr/p/wFQSwMEFAAAAAgAqbJwXXluM9foAAAArQEAABMAAABbQ29udGVudF9UeXBlc10ueG1sfVDJTsMwEP0Va64oceCAEIrTA8sROJQPGNmTxKo3edzS/j1OW3pAhePMW/X61d47saPMNgYFt20HgoKOxoZJwef6tXkAwQWDQRcDKTgQw2ro14dELKo2sIK5lPQoJeuZPHIbE4WKjDF7LPXMk0yoNziRvOu6e6ljKBRKUxYPGPpnGnHrinjZ1/epRybHIJ5OxCVLAabkrMZScbkL5ldKc05oq/LI4dkmvqkEkFcTFuTvgLPuvQ6TrSHxgbm8oa8s+RWzkSbqra/K9n+bKz3jOFpNF/3ilnLUxFwX9669IB5t+Okvj3MP31BLAwQUAAAACACpsnBdm/036q0AAAApAQAACwAAAF9yZWxzLy5yZWxzjc87DsIwDAbgq0TeaVoGhFDTLgipKyoHsBI3rWgeSsKjtycDA0UMjLZ/f5br9mlmdqcQJ2cFVEUJjKx0arJawKU/bfbAYkKrcHaWBCwUoW3qM82Y8kocJx9ZNmwUMKbkD5xHOZLBWDhPNk8GFwymXAbNPcorauLbstzx8GnA2mSdEhA6VQHrF0//2G4YJklHJ2+GbPpx4iuRZQyakoCHC4qrd7vILPCm5qsXmxdQSwECFAAUAAAACACpsnBdNtcMfOQAAABfAQAAEQAAAAAAAAAAAAAAAAAAAAAAd29yZC9kb2N1bWVudC54bWxQSwECFAAUAAAACACpsnBdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAAAATAQAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAKmycF2b/TfqrQAAACkBAAALAAAAAAAAAAAAAAAAACwCAABfcmVscy8ucmVsc1BLBQYAAAAAAwADALkAAAACAwAAAAA="
}
```

**Compatibility note:** AstraLogs' current `/api/send-report` endpoint still sends the reviewed report text fields (`user_email`, `period_covered`, `specific_tasks`, and `output`), not this file-attachment payload. This Make scenario requires a sender that posts the fields above. No AstraLogs code was changed for this scenario documentation.

## Custom report templates

Run the latest `supabase/schema.sql` to create the private `report-templates` Storage bucket and per-user access policies. In **Integrations → Report template**, upload a `.docx` or `.xlsx` file no larger than 2 MB, test it with sample data, then choose **Use my template** or **Default template**. Filled files are generated in the browser; Word and Excel layouts are preserved.

Use these case-sensitive placeholders:

`{name}` `{id_no}` `{office}` `{program}` `{supervisor}` `{period}` `{tasks_text}` `{outputs_text}` `{date_printed}`

`{id_no}` and `{supervisor}` are left blank. In Word, `{#tasks}{.}{/tasks}` and `{#outputs}{.}{/outputs}` repeat a paragraph for each item. For Excel, put each placeholder in its own cell; enable Wrap Text for `{tasks_text}` and `{outputs_text}`. Type each Word placeholder in one go so Word does not split it across formatting runs.

The custom AI prompt is editable in **Integrations → Prompt** (up to 4,000 characters). Use `{program}`, `{date_from}`, `{date_to}`, and the required `{entries}` variable; other variables are warned about and left unreplaced. Choose **Save prompt** to store changes or **Reset to default** to restore the built-in prompt. The server keeps its system instructions and JSON output contract fixed regardless of custom prompt text.
