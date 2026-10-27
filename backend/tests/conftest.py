import os
import tempfile
from pathlib import Path

# The app mounts STATIC_DIR at import time, so point it at a stub export first.
static_dir = Path(tempfile.mkdtemp())
(static_dir / "index.html").write_text("<html><body>Kanban Studio</body></html>")
os.environ["STATIC_DIR"] = str(static_dir)
