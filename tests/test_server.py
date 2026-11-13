"""
檔案用途：server.py 的單元測試
功能：測試路徑解析、結構化內容提取、指標計算等核心功能
"""

import json
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

    def test_dotenv_loading(self):
        """Test that load_dotenv reads keys and populates os.environ"""
        import os
        import tempfile
        from pathlib import Path
        
        # Save original env
        orig_key = os.environ.get("TEST_KEY_ENV_VAR")
        
        # Create a temp .env file
        with tempfile.TemporaryDirectory() as tempdir:
            orig_root = server.ROOT
            server.ROOT = Path(tempdir)
            try:
                (server.ROOT / ".env").write_text(
                    "# This is a comment\nTEST_KEY_ENV_VAR=my_secret_token\n",
                    encoding="utf-8"
                )
                server.load_dotenv()
                self.assertEqual(os.environ.get("TEST_KEY_ENV_VAR"), "my_secret_token")
            finally:
                server.ROOT = orig_root
                if orig_key is None:
                    os.environ.pop("TEST_KEY_ENV_VAR", None)
                else:
                    os.environ["TEST_KEY_ENV_VAR"] = orig_key

    def test_sanitize_secrets(self):
        """Test that sanitize_secrets redacts API keys"""
        text_with_key_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini?key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q"
        text_with_raw_key = "Found secret key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q in the codebase"
        
        self.assertIn("key=[REDACTED]", server.sanitize_secrets(text_with_key_url))
        self.assertNotIn("AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q", server.sanitize_secrets(text_with_raw_key))
        self.assertIn("AIzaSy[REDACTED]", server.sanitize_secrets(text_with_raw_key))

    def test_extract_json_block(self):
        """Test that extract_json_block parses JSON nested in markdown wrappers"""
        text_with_markdown = "Here is the result:\n```json\n{\"score\": 0.9, \"passed\": true}\n```\nHope this helps!"
        text_plain = "{\"score\": 0.8, \"passed\": false}"
        
        res_markdown = server.extract_json_block(text_with_markdown)
        res_plain = server.extract_json_block(text_plain)
        
        self.assertEqual(res_markdown["score"], 0.9)
        self.assertTrue(res_markdown["passed"])
        self.assertEqual(res_plain["score"], 0.8)
        self.assertFalse(res_plain["passed"])
        self.assertIsNone(server.extract_json_block("not a json at all"))

    def test_calculate_repo_score_ignores_unassessed_weight(self):
        score = server.calculate_repo_score([
            {"status": "assessed", "weight": 20, "score": 1},
            {"status": "assessed", "weight": 10, "score": 0.5},
            {"status": "unassessed", "weight": 70, "score": None},
        ])
        self.assertEqual(score["score"], 83)
        self.assertEqual(score["coverage"], 30)

    def test_repo_benchmark_local_mode_skips_llm_and_reports_partial_coverage(self):
        from unittest.mock import patch

        class FakeClient:
            def call_tool(self, name, arguments):
                if name == "repo_summary":
                    data = {"root": "/repo", "file_count": 4, "extensions": {".py": 2},
                            "top_level_files": ["README.md", "server.py", ".gitignore"]}
                elif name == "scan_repo_quality":
                    data = {"root": "/repo", "readme_files": ["README.md"],
                            "dependency_files": ["requirements.txt"], "env_examples": [],
                            "test_files": ["tests/test_sample.py"], "ci_files": [".github/workflows/ci.yml"],
                            "issues": []}
                else:
                    raise AssertionError(f"Unexpected MCP tool: {name}")
                return {"structuredContent": data}

            def status(self):
                return {"name": "local-repo", "running": True}

        with patch.object(server.registry, "get", return_value=FakeClient()), \
             patch.object(server.LLMClient, "generate") as generate:
            result = server.run_repo_benchmark(repo_root=None, model_preset="local")

        run = result["run"]
        self.assertEqual(run["metrics"]["coverage"], 60)
        self.assertEqual(run["evaluation"]["modelStatus"], "not_requested")
        self.assertEqual(run["evaluation"]["aiCallCount"], 0)
        self.assertEqual(run["metrics"]["cost"], 0)
        self.assertEqual(sum(item["status"] == "not_requested" for item in run["results"]), 3)
        generate.assert_not_called()

    def test_repo_benchmark_ai_failure_keeps_local_score_without_fake_fallback(self):
        from unittest.mock import patch

        class FakeClient:
            def call_tool(self, name, arguments):
                if name == "repo_summary":
                    data = {"root": "/repo", "file_count": 4, "extensions": {".py": 2},
                            "top_level_files": ["README.md", "server.py", ".gitignore"]}
                elif name == "scan_repo_quality":
                    data = {"root": "/repo", "readme_files": ["README.md"],
                            "dependency_files": ["requirements.txt"], "env_examples": [],
                            "test_files": ["tests/test_sample.py"], "ci_files": [".github/workflows/ci.yml"],
                            "issues": []}
                elif name == "inspect_qa_context":
                    data = {"inspected_files": [{"path": "server.py", "kind": "source",
                                                  "content_excerpt": "def run(): return True"}]}
                elif name == "read_file":
                    data = {"path": "README.md", "content": "Run with python server.py"}
                else:
                    raise AssertionError(f"Unexpected MCP tool: {name}")
                return {"structuredContent": data}

            def status(self):
                return {"name": "local-repo", "running": True}

        with patch.object(server.registry, "get", return_value=FakeClient()), \
             patch.object(server.LLMClient, "generate", side_effect=RuntimeError("API unavailable")) as generate:
            result = server.run_repo_benchmark(repo_root=None, model_preset="gpt-4o-mini")

        run = result["run"]
        self.assertEqual(run["metrics"]["coverage"], 60)
        self.assertEqual(run["evaluation"]["modelStatus"], "failed")
        self.assertEqual(run["evaluation"]["aiCallCount"], 1)
        self.assertTrue(all(item["score"] is None for item in run["results"] if item["source"] == "ai"))
        generate.assert_called_once()

    def test_repo_benchmark_ai_success_records_scores_and_usage(self):
        from unittest.mock import patch

        class FakeClient:
            def call_tool(self, name, arguments):
                if name == "repo_summary":
                    data = {"root": "/repo", "file_count": 4, "extensions": {".py": 2},
                            "top_level_files": ["README.md", "server.py", ".gitignore"]}
                elif name == "scan_repo_quality":
                    data = {"root": "/repo", "readme_files": ["README.md"],
                            "dependency_files": ["requirements.txt"], "env_examples": [],
                            "test_files": ["tests/test_sample.py"], "ci_files": [".github/workflows/ci.yml"],
                            "issues": []}
                elif name == "inspect_qa_context":
                    data = {"inspected_files": [{"path": "server.py", "kind": "source",
                                                  "content_excerpt": "def run(): return True"},
                                                 {"path": "tests/test_sample.py", "kind": "test",
                                                  "content_excerpt": "def test_run(): assert run()"}]}
                elif name == "read_file":
                    data = {"path": "README.md", "content": "Run with python server.py"}
                else:
                    raise AssertionError(f"Unexpected MCP tool: {name}")
                return {"structuredContent": data}

            def status(self):
                return {"name": "local-repo", "running": True}

        checks = [{"id": check_id, "score": 1, "reason": "Evidence supports the criterion", "evidence": ["server.py"]}
                  for check_id in ("test_quality", "docs_consistency", "maintenance")]
        llm_response = {"text": json.dumps({"checks": checks}),
                        "usage": {"inputTokens": 500, "outputTokens": 100, "totalTokens": 600}}
        with patch.object(server.registry, "get", return_value=FakeClient()), \
             patch.object(server.LLMClient, "generate", return_value=llm_response) as generate:
            result = server.run_repo_benchmark(repo_root=None, model_preset="gpt-4o-mini")

        run = result["run"]
        self.assertEqual(run["metrics"]["coverage"], 100)
        self.assertEqual(run["metrics"]["repoScore"], 100)
        self.assertEqual(run["metrics"]["tokens"], 600)
        self.assertEqual(run["evaluation"]["modelStatus"], "complete")
        self.assertEqual(run["evaluation"]["aiCallCount"], 1)
        generate.assert_called_once()

    def test_llm_client_gemini_request_format(self):
        """Test that LLMClient.generate formats Gemini API call correctly"""
        import os
        from unittest.mock import patch, MagicMock
        
        # Save original API key and mock it
        orig_key = os.environ.get("GEMINI_API_KEY")
        os.environ["GEMINI_API_KEY"] = "mock_key"
        
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "candidates": [{
                "content": {
                    "parts": [{"text": "{\"score\": 0.95}"}]
                }
            }]
        }).encode("utf-8")
        
        try:
            with patch("urllib.request.urlopen") as mock_urlopen:
                mock_urlopen.return_value.__enter__.return_value = mock_response
                res = server.LLMClient.generate("gemini", "gemini-2.5-flash", "test prompt", system_instruction="sys prompt")
                
                self.assertEqual(res, "{\"score\": 0.95}")
                mock_urlopen.assert_called_once()
                args, kwargs = mock_urlopen.call_args
                req = args[0]
                self.assertEqual(req.full_url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=mock_key")
                self.assertEqual(req.method, "POST")
                
                payload = json.loads(req.data.decode("utf-8"))
                self.assertEqual(payload["contents"][0]["parts"][0]["text"], "test prompt")
                self.assertEqual(payload["systemInstruction"]["parts"][0]["text"], "sys prompt")
        finally:
            if orig_key is None:
                os.environ.pop("GEMINI_API_KEY", None)
            else:
                os.environ["GEMINI_API_KEY"] = orig_key

    def test_llm_client_ollama_request_format(self):
        """Test that LLMClient.generate formats Ollama API call correctly"""
        from unittest.mock import patch, MagicMock
        
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{
                "message": {"content": "{\"score\": 0.85}"}
            }]
        }).encode("utf-8")
        
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.return_value.__enter__.return_value = mock_response
            res = server.LLMClient.generate("ollama", "llama3", "test prompt", system_instruction="sys prompt")
            
            self.assertEqual(res, "{\"score\": 0.85}")
            mock_urlopen.assert_called_once()
            args, kwargs = mock_urlopen.call_args
            req = args[0]
            self.assertEqual(req.full_url, "http://localhost:11434/v1/chat/completions")
            self.assertEqual(req.method, "POST")
            
            payload = json.loads(req.data.decode("utf-8"))
            self.assertEqual(payload["model"], "llama3")
            self.assertEqual(payload["messages"][0]["role"], "system")
            self.assertEqual(payload["messages"][0]["content"], "sys prompt")
            self.assertEqual(payload["messages"][1]["role"], "user")
            self.assertEqual(payload["messages"][1]["content"], "test prompt")
            self.assertEqual(payload["response_format"]["type"], "json_object")

    def test_llm_client_openai_request_format(self):
        """Test that LLMClient.generate formats OpenAI API call correctly"""
        import os
        from unittest.mock import patch, MagicMock
        
        orig_key = os.environ.get("OPENAI_API_KEY")
        os.environ["OPENAI_API_KEY"] = "mock_openai_key"
        
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{
                "message": {"content": "{\"score\": 0.92}"}
            }]
        }).encode("utf-8")
        
        try:
            with patch("urllib.request.urlopen") as mock_urlopen:
                mock_urlopen.return_value.__enter__.return_value = mock_response
                res = server.LLMClient.generate("openai", "gpt-4o-mini", "test prompt", system_instruction="sys prompt")
                
                self.assertEqual(res, "{\"score\": 0.92}")
                mock_urlopen.assert_called_once()
                args, kwargs = mock_urlopen.call_args
                req = args[0]
                self.assertEqual(req.full_url, "https://api.openai.com/v1/chat/completions")
                self.assertEqual(req.method, "POST")
                self.assertEqual(req.headers.get("Authorization"), "Bearer mock_openai_key")
                
                payload = json.loads(req.data.decode("utf-8"))
                self.assertEqual(payload["model"], "gpt-4o-mini")
                self.assertEqual(payload["messages"][0]["role"], "system")
                self.assertEqual(payload["messages"][0]["content"], "sys prompt")
                self.assertEqual(payload["messages"][1]["role"], "user")
                self.assertEqual(payload["messages"][1]["content"], "test prompt")
                self.assertEqual(payload["response_format"]["type"], "json_object")
        finally:
            if orig_key is None:
                os.environ.pop("OPENAI_API_KEY", None)
            else:
                os.environ["OPENAI_API_KEY"] = orig_key


if __name__ == '__main__':
    unittest.main()
