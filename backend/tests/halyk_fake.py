"""An in-process stand-in for Halyk ePay's test servers (httpx.MockTransport). No network."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs

import httpx

from app.core.config import get_settings

TEST_SECRET = "halyk-test-secret-for-unit-tests"


@dataclass
class FakeHalyk:
    # invoiceId -> check-status body. Missing invoices answer resultCode 102 (not found yet).
    statuses: dict[str, dict[str, Any]] = field(default_factory=dict)
    requests: list[httpx.Request] = field(default_factory=list)
    token_forms: list[dict[str, str]] = field(default_factory=list)
    fail_network: bool = False
    operation_status: int = 200

    def set(
        self,
        invoice_id: str,
        status_name: str,
        *,
        result_code: str = "100",
        transaction_id: str = "tx-1",
        amount: float = 2500,
    ) -> None:
        self.statuses[invoice_id] = {
            "resultCode": result_code,
            "resultMessage": "SUCCESS" if result_code == "100" else "reject",
            "transaction": None
            if result_code != "100"
            else {
                "id": transaction_id,
                "invoiceID": invoice_id,
                "amount": amount,
                "currency": "KZT",
                "statusName": status_name,
                "cardMask": "440563...5096",
                "reason": "Successfully",
                "reference": "123",
            },
        }

    def operations(self) -> list[str]:
        return [r.url.path for r in self.requests if "/operation/" in r.url.path]

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.fail_network:
            raise httpx.ConnectError("down", request=request)
        self.requests.append(request)
        settings = get_settings()
        if str(request.url) == settings.halyk_oauth_url:
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            self.token_forms.append(form)
            if form.get("client_secret") != TEST_SECRET:
                return httpx.Response(401, json={"error": "invalid_client"})
            return httpx.Response(
                200,
                json={
                    "access_token": f"tok-{len(self.token_forms)}",
                    "expires_in": 7200,
                    "refresh_token": "",
                    "scope": form.get("scope"),
                    "token_type": "Bearer",
                },
            )
        if not request.headers.get("Authorization", "").startswith("Bearer tok-"):
            return httpx.Response(401)
        path = request.url.path
        if "/check-status/payment/transaction/" in path:
            invoice = path.rsplit("/", 1)[-1]
            body = self.statuses.get(
                invoice, {"resultCode": "102", "resultMessage": "not found", "transaction": None}
            )
            return httpx.Response(200, content=json.dumps(body))
        if "/operation/" in path:
            return httpx.Response(self.operation_status, json={})
        return httpx.Response(404)

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)
