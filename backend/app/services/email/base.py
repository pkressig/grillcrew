"""Provider-agnostic transactional email abstraction (D-040).

Implementations must never pass `body_text` (which may contain bearer tokens
for password-reset or invitation links) to the application logger. Only
metadata (recipient, subject, outcome) may be logged.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    body_text: str


class EmailSendError(Exception):
    """Raised when a transport fails to hand off a message.

    Callers are expected to catch this and decide whether to retry. The
    reset/invitation token itself remains valid and safely retryable
    regardless of send outcome (plan `docs/F002_PLAN.md` §15-16), since only
    its hash is ever persisted, before the send is even attempted.
    """


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...
