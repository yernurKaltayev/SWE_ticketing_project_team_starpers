# Halyk ePay: Dummy Payment Integration for a University Project (Ticketon-like Platform)

Stack: FastAPI (backend) + web app + mobile app.
Goal: a dummy payment flow for a university project that uses a real Kazakhstan bank payment API, free and with no registration.

## Why Halyk ePay

- It has a public test environment, and the test credentials and a test card are published right in the docs.
- **No registration, no sole proprietorship/LLP and no verification required.**
- It offers a payment page, a widget, status checks, refunds and an Android SDK.
- Docs: https://epayment.kz/en-US/docs (see the "Test credentials" section)

Alternatives:

- **Freedom Pay**: requires merchant registration (new merchants start in test mode).
- **CloudPayments**: also requires merchant registration.
- **Kaspi Pay**: business-only, no public sandbox.
- **Stripe test mode**: no verification needed, but it isn't a Kazakhstan system.

## Test credentials (shared by everyone)

| Parameter       | Value                         |
| --------------- | ----------------------------- |
| Test dashboard  | https://test-epay.homebank.kz |
| Dashboard login | epay@halykbank.kz             |

| Dashboard password | XZG1E@Mm |
| ClientID | `test` |
| ClientSecret | `yF587AV9Ms94qN2QShFzVR3vFnWkhjbAK3sG` |
| TerminalID | `67e34d63-102f-4bd1-898e-370781d0074d` (some docs sections list `c36b282f-6819-4d4f-85df-a4bdc8a8f703`) |
| Test card | `4405639704015096`, expiry 01/25, CVC 815 |

> The card expiry shown in the docs may be out of date. If a payment fails, check the "Test credentials" section or email epay@halykbank.kz.

## Endpoints (test environment)

| Purpose                 | URL                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Get token               | `POST https://testoauth.homebank.kz/epay2/oauth2/token`                             |
| Payment form JS library | `https://test-epay.homebank.kz/payform/payment-api.js`                              |
| Check status            | `GET https://testepay.homebank.kz/api/check-status/payment/transaction/{invoiceId}` |

The production token endpoint is `https://epay-oauth.homebank.kz/oauth2/token`, but it requires a contract with the bank.

## Payment flow

1. The user books a ticket, and the backend creates an order with status `pending`.
2. The backend requests a token for that order (`invoiceID`, `amount`, `postLink`).
3. The frontend loads `payment-api.js` and calls `halyk.pay(paymentObject)` with the token.
4. The user enters the test card on the bank's page.
5. The bank sends a callback to `postLink`, and the backend marks the order as `paid`.
6. As a safeguard, the backend also checks the status via check-status.

## Backend example (FastAPI)

```python
import httpx
from fastapi import FastAPI, Request

app = FastAPI()
EPAY = {
    "client_id": "test",
    "client_secret": "yF587AV9Ms94qN2QShFzVR3vFnWkhjbAK3sG",  # move to .env in the real project
    "terminal": "67e34d63-102f-4bd1-898e-370781d0074d",
}

@app.post("/payments/{order_id}/init")
async def init_payment(order_id: str):
    amount = 5000  # take from the order in the DB
    invoice_id = order_id.zfill(9)  # unique, digits only
    async with httpx.AsyncClient() as c:
        r = await c.post("https://testoauth.homebank.kz/epay2/oauth2/token", data={
            "grant_type": "client_credentials", "scope": "payment",
            "client_id": EPAY["client_id"], "client_secret": EPAY["client_secret"],
            "invoiceID": invoice_id, "amount": amount, "currency": "KZT",
            "terminal": EPAY["terminal"],
            "postLink": "https://<public-url>/payments/callback",
        })
    return {"auth": r.json(), "invoiceId": invoice_id, "amount": amount,
            "terminal": EPAY["terminal"]}  # the frontend passes this to halyk.pay()

@app.post("/payments/callback")
async def callback(req: Request):
    data = await req.json()
    # data["code"] == "ok" → mark the ticket as paid
    return {"ok": True}
```

## Important notes

- **Keep the ClientSecret on the backend only.** The frontend receives a ready-made token from the backend.
- **The test merchant is shared**, so you'll see other people's transactions in the dashboard. `invoiceID` must be unique, e.g. the order ID plus a timestamp.
- **`postLink` must be a public URL.** Options:
  - `cloudflared tunnel --url http://localhost:8000` works with no signup;
  - ngrok is free but needs an account for the authtoken;
  - deploy the backend (Render, Railway).
- **Mobile app:**
  - open the payment page in a WebView, which is the simplest option;
  - or use the ePay Android SDK with `BuildType.DEBUG` for the test environment.
- **Real payments** require a contract with Halyk and a registered business (sole proprietorship/LLP). None of this is needed for a dummy payment.
