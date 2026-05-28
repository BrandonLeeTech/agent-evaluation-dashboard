"""
檔案用途：server.py 的單元測試
功能：測試路徑解析、結構化內容提取、指標計算等核心功能
"""

import unittest
import tempfile
from pathlib import Path

from backend import server


class TestServer(unittest.TestCase):
    def setUp(self):
        self._original_history_path = server.HISTORY_DB_PATH
        self._tempdir = tempfile.TemporaryDirectory()
        server.HISTORY_DB_PATH = Path(self._tempdir.name) / "eval_history.sqlite3"

    def tearDown(self):
        server.HISTORY_DB_PATH = self._original_history_path
        self._tempdir.cleanup()

    def test_resolve_repo_path_current_dir(self):
        """Test resolving current directory"""
        result = server.resolve_repo_path(".")
        self.assertIsNotNone(result)
        self.assertTrue(Path(result).exists())

    def test_structured_content_with_json(self):
        """Test structured content extraction from JSON"""
        mock_result = {"content": [{"type": "text", "text": "{\"data\": \"test\"}"}]}
        result = server.structured_content(mock_result)
        self.assertIsInstance(result, dict)
        self.assertIn("data", result)

    def test_structured_content_direct(self):
        """Test structured content when already structured"""
        mock_result = {"structuredContent": {"test": "data"}}
        result = server.structured_content(mock_result)
        self.assertEqual(result, {"test": "data"})

    def test_calculate_metrics(self):
        """Test metrics calculation"""
        results = [
            {"passed": True, "score": 0.9, "latency": 100, "taskId": "1"},
            {"passed": False, "score": 0.4, "latency": 150, "taskId": "2"},
        ]
        metrics = server.calculate_metrics(results, threshold=80)
        self.assertEqual(metrics["total"], 2)
        self.assertEqual(metrics["passed"], 1)
        self.assertEqual(metrics["failed"], 1)
        self.assertEqual(metrics["successRate"], 50)

    def test_history_round_trip(self):
        """Test SQLite history save/load"""
        self.assertEqual(server.load_history(), [])

        run = {
            "id": "run-1",
            "createdAt": "2026-05-28T00:00:00.000Z",
            "config": {"workflow": "testcase"},
            "metrics": {"successRate": 100},
            "results": [],
        }

        server.save_history(run)

        history = server.load_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], "run-1")
        self.assertEqual(history[0]["config"]["workflow"], "testcase")

    def test_history_limit(self):
        """Test history truncation to the newest 100 runs"""
        for index in range(105):
            hour = index // 60
            minute = index % 60
            server.save_history({
                "id": f"run-{index}",
                "createdAt": f"2026-05-28T{hour:02d}:{minute:02d}:00.000Z",
                "config": {"workflow": "testcase"},
                "metrics": {"successRate": 100},
                "results": [],
            })

        history = server.load_history()
        self.assertEqual(len(history), 100)
        self.assertEqual(history[0]["id"], "run-104")
        self.assertEqual(history[-1]["id"], "run-5")


if __name__ == '__main__':
    unittest.main()
