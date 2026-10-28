import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from evaluate import route_violations, assess, normalize_original, EvidenceJournal


class EvaluatorTests(unittest.TestCase):
    def test_journal_opens_once_and_preserves_each_record(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'evidence.jsonl'
            journal = EvidenceJournal(path)
            with patch.object(Path, 'open', side_effect=OSError('reopening denied')):
                journal.append({'id': 1}); journal.append({'id': 2})
                journal.close()
            self.assertEqual(len(path.read_text(encoding='utf-8').splitlines()), 2)

    def test_forged_success_without_route_fails(self):
        case = {'category': 'feasible_route', 'expected_status': 'success', 'input': {'scene_state': {}}}
        self.assertFalse(assess(case, 200, {'status': 'success', 'data': {}}, {})['passed'])

    def test_hard_violation_is_checked_independently(self):
        graph = {'spots': [{'id': 'a', 'visit_minutes': 20, 'mobility': {'wheelchair_accessible': True}, 'opening_windows': ['08:00-17:00']}],
                 'edges': [], 'performances': []}
        scene = {'currentLocation': 'a', 'currentTime': '09:00', 'remainingMinutes': 10, 'mustVisitSpotIds': []}
        route = {'startTime': '09:00', 'totalMinutes': 20, 'walkingMinutes': 0, 'visitingMinutes': 20, 'waitingMinutes': 0,
                 'steps': [{'spotId': 'a', 'arrive': '09:00', 'start': '09:00', 'end': '09:20', 'walkMinutes': 0, 'visitMinutes': 20}]}
        self.assertIn('budget', route_violations(route, scene, graph))

    def test_clarification_must_identify_the_required_field(self):
        case = {'category': 'clarification', 'expected_status': 'needs_clarification', 'missing_fields': ['currentTime']}
        self.assertFalse(assess(case, 200, {'status': 'needs_clarification', 'data': {'missing_fields': []}}, {})['passed'])

    def test_transport_error_does_not_pass_infeasible_case(self):
        case = {'category': 'infeasible', 'expected_status': 'infeasible'}
        self.assertFalse(assess(case, 502, {'status': 'infeasible'}, {})['passed'])

    def test_original_evidence_uses_its_actual_api_field(self):
        output = normalize_original({'answer': '88米', 'evaluation_trace': {'retrievedDocuments': [{'source': 'guide'}]}})
        self.assertEqual(output['data']['evidence'], [{'source': 'guide'}])

    def test_original_empty_route_placeholder_is_a_valid_clarification(self):
        case = {'category': 'clarification', 'expected_status': 'needs_clarification', 'missing_fields': ['currentTime']}
        output = normalize_original({'outcome': 'needs_clarification', 'scene_state': {'missingCriticalFields': ['currentTime']},
                                     'route': {'steps': [], 'feasible': False}})
        self.assertTrue(assess(case, 200, output, {})['passed'])

    def test_zero_buffer_performance_cannot_pass(self):
        graph = {'spots': [{'id': 'a', 'visit_minutes': 15, 'mobility': {'wheelchair_accessible': True}, 'opening_windows': ['08:00-17:00']}],
                 'edges': [], 'performances': [{'id': 'p', 'location_id': 'a', 'start_times': ['10:00'], 'duration_minutes': 15}]}
        scene = {'currentLocation': 'a', 'currentTime': '10:00', 'remainingMinutes': 15, 'mobility': 'wheelchair'}
        route = {'startTime': '10:00', 'totalMinutes': 15, 'walkingMinutes': 0, 'visitingMinutes': 15, 'waitingMinutes': 0,
                 'steps': [{'spotId': 'a', 'arrive': '10:00', 'start': '10:00', 'end': '10:15', 'walkMinutes': 0, 'visitMinutes': 15,
                            'performanceId': 'p', 'performanceStartTime': '10:00'}]}
        self.assertIn('admission_buffer', route_violations(route, scene, graph))


if __name__ == '__main__':
    unittest.main()
