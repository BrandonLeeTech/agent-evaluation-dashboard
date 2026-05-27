"""
檔案用途：server.py 的單元測試
功能：測試路徑解析、結構化內容提取、指標計算等核心功能
"""

import unittest
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from server import resolve_repo_path, structured_content, calculate_metrics


class TestServer(unittest.TestCase):
    def test_resolve_repo_path_current_dir(self):
        """Test resolving current directory"""
        result = resolve_repo_path(".")
        self.assertIsNotNone(result)
        self.assertTrue(Path(result).exists())
    
    def test_structured_content_with_json(self):
        """Test structured content extraction from JSON"""
        mock_result = {"content": [{"type": "text", "text": "{\"data\": \"test\"}"}]}
        result = structured_content(mock_result)
        self.assertIsInstance(result, dict)
        self.assertIn("data", result)
    
    def test_structured_content_direct(self):
        """Test structured content when already structured"""
        mock_result = {"structuredContent": {"test": "data"}}
        result = structured_content(mock_result)
        self.assertEqual(result, {"test": "data"})
    
    def test_calculate_metrics(self):
        """Test metrics calculation"""
        results = [
            {"passed": True, "score": 0.9, "latency": 100, "taskId": "1"},
            {"passed": False, "score": 0.4, "latency": 150, "taskId": "2"},
        ]
        metrics = calculate_metrics(results, threshold=80)
        self.assertEqual(metrics["total"], 2)
        self.assertEqual(metrics["passed"], 1)
        self.assertEqual(metrics["failed"], 1)
        self.assertEqual(metrics["successRate"], 50)


if __name__ == '__main__':
    unittest.main()
