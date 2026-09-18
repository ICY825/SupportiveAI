"""Giao diện lưu trữ file."""

from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO, Protocol, runtime_checkable


@dataclass(frozen=True)
class StoredFile:
    key: str
    size: int
    content_type: str | None = None


@runtime_checkable
class FileStorage(Protocol):
    def save(self, key: str, stream: BinaryIO, *, content_type: str | None = None) -> StoredFile: ...

    def open(self, key: str) -> BinaryIO: ...

    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...
