from pathlib import Path
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "SupportiveAI"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./supportive_ai.db"

    # Redis Queue
    REDIS_URL: str = "redis://localhost:6379/0"

    # Object Storage
    STORAGE_PROVIDER: str = "local"
    STORAGE_LOCAL_DIR: str = "./storage/uploads"

    # AI Pipeline & Confidence Thresholds (ADD v2 Section 16)
    CONFIDENCE_AUTO_PROCESS_THRESHOLD: float = 0.95
    CONFIDENCE_HUMAN_VERIFY_THRESHOLD: float = 0.80
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # Security
    SECRET_KEY: str = "supportive-ai-secret-key-development-only"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, list):
            return v
        return []

    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
