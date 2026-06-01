"""
檔案用途：MCP 客戶端的單元測試
功能：測試 MCP 錯誤處理和基本功能
"""

import unittest
import tempfile
from pathlib import Path

from backend.server import MCPError
from backend.mcp_servers import local_repo_server


class TestMCPClient(unittest.TestCase):
    def test_mcp_error_is_runtime_error(self):
        """Test MCPError is a RuntimeError subclass"""
        error = MCPError("test error")
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(str(error), "test error")
    
    def test_mcp_error_message(self):
        """Test MCPError message handling"""
        error = MCPError("Connection failed")
        self.assertIn("Connection failed", str(error))

    def test_inspect_qa_context_uses_real_repo_files(self):
        """Test grounded QA context reads source and test evidence"""
        original_root = local_repo_server.ROOT
        try:
            with tempfile.TemporaryDirectory() as tempdir:
                root = Path(tempdir)
                (root / "app").mkdir()
                (root / "tests").mkdir()
                (root / "app" / "auth.py").write_text(
                    "def login(user, password):\n    return user == 'admin'\n",
                    encoding="utf-8",
                )
                (root / "tests" / "test_auth.py").write_text(
                    "def test_login():\n    assert True\n",
                    encoding="utf-8",
                )
                local_repo_server.ROOT = root

                result = local_repo_server.inspect_qa_context({
                    "query": "Find missing edge cases in auth login flow",
                })
        finally:
            local_repo_server.ROOT = original_root

        self.assertGreater(result["grounding"]["source_match_count"], 0)
        self.assertGreater(result["grounding"]["test_match_count"], 0)
        self.assertTrue(any(item["path"] == "app/auth.py" for item in result["source_matches"]))
        self.assertTrue(any(item["path"] == "tests/test_auth.py" for item in result["test_matches"]))


if __name__ == '__main__':
    unittest.main()
