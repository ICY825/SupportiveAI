"""Lưu trữ file.

README §8: pilot dùng filesystem, nhưng bọc sẵn lớp trừu tượng để đổi
sang S3/MinIO sau mà không đụng nghiệp vụ.
"""

from app.platform.storage.base import FileStorage, StoredFile
from app.platform.storage.filesystem import FilesystemStorage, storage

__all__ = ["FileStorage", "FilesystemStorage", "StoredFile", "storage"]
