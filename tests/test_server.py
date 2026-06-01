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

    def test_timeout_config_parsing(self):
        """Test that StdioMCPClient parses timeout from config"""
        client_default = server.StdioMCPClient("test", {"command": "echo"})
        self.assertEqual(client_default.timeout, 10.0)

        client_custom = server.StdioMCPClient("test", {"command": "echo", "timeout": 15})
        self.assertEqual(client_custom.timeout, 15.0)

    def test_client_stop_cleans_resources(self):
        """Test that stop() terminates process and closes streams"""
        from unittest.mock import MagicMock
        client = server.StdioMCPClient("test", {"command": "echo"})
        mock_proc = MagicMock()
        client.process = mock_proc
        
        client.stop()
        
        self.assertIsNone(client.process)
        mock_proc.terminate.assert_called_once()
        mock_proc.wait.assert_called_once()
        mock_proc.stdin.close.assert_called_once()
        mock_proc.stdout.close.assert_called_once()
        mock_proc.stderr.close.assert_called_once()

    def test_client_timeout_auto_recovery(self):
        """Test that a timeout exception calls stop() to auto-recover"""
        import queue
        from unittest.mock import MagicMock, patch
        client = server.StdioMCPClient("test", {"command": "echo"})
        mock_proc = MagicMock()
        mock_proc.poll.return_value = None # Running
        client.process = mock_proc
        
        # Mock _write to do nothing
        client._write = MagicMock()
        
        # Mock messages.get to raise queue.Empty (timeout)
        with patch.object(client.messages, "get", side_effect=queue.Empty):
            with patch.object(client, "stop") as mock_stop:
                with self.assertRaises(server.MCPError) as context:
                    client._request_started("test_method", {}, timeout=1.0)
                
                self.assertIn("MCP request timed out", str(context.exception))
                mock_stop.assert_called_once()

    def test_concurrent_ensure_started_lock(self):
        """Test that concurrent ensure_started runs safely and avoids double start"""
        import threading
        import subprocess
        from unittest.mock import MagicMock, patch
        
        client = server.StdioMCPClient("test", {"command": "echo"})
        start_count = 0
        
        def mock_popen_func(*args, **kwargs):
            nonlocal start_count
            start_count += 1
            # Return mock process with mocked stdin/stdout/stderr
            p = MagicMock()
            p.poll.return_value = None
            p.stdin = MagicMock()
            p.stdout = MagicMock()
            p.stderr = MagicMock()
            return p

        # Mock _request_started to avoid running initialize payload over stdio
        with patch("subprocess.Popen", side_effect=mock_popen_func):
            with patch.object(client, "_request_started"):
                with patch.object(client, "_notify_started"):
                    # We run multiple threads trying to call ensure_started at the same time
                    threads = []
                    for _ in range(5):
                        t = threading.Thread(target=client.ensure_started)
                        threads.append(t)
                        t.start()
                    for t in threads:
                        t.join()
        
        # Popen should have been called exactly once because of RLock guarding ensure_started
        self.assertEqual(start_count, 1)


if __name__ == '__main__':
    unittest.main()
