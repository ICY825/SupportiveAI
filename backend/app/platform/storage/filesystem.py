"""Lưu file trên đĩa cục bộ."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.platform.storage.base import StoredFile


class FilesystemStorage:
    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.storage_root).resolve()

    def _path(self, key: str) -> Path:
        # Chặn key kiểu "../../etc/passwd" thoát ra ngoài thư mục gốc.
        candidate = (self.root / key).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise ValidationError(f"Key không hợp lệ: {key!r}")
        return candidate

    def save(self, key: str, stream: BinaryIO, *, content_type: str | None = None) -> StoredFile:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as target:
            shutil.copyfileobj(stream, target)
        return StoredFile(key=key, size=path.stat().st_size, content_type=content_type)

    def open(self, key: str) -> BinaryIO:
        path = self._path(key)
        if not path.exists():
            raise NotFoundError(f"Không có file {key!r}")
        return path.open("rb")

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


storage = FilesystemStorage()
