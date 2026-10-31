import os
import tempfile
from pathlib import Path

# The app mounts STATIC_DIR at import time, so point it at a stub export first.
static_dir = Path(tempfile.mkdtemp())
(static_dir / "index.html").write_text("<html><body>Kanban Studio</body></html>")
os.environ["STATIC_DIR"] = str(static_dir)

# Default DB for tests that do not set their own; never touch backend/data.
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
