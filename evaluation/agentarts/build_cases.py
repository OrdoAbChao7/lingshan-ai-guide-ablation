"""Build reproducible DEVELOPMENT candidates; never relabel them as a held-out blind set."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = Path(__file__).parent


def build():
    facts = json.loads((ROOT / 'backend/python/tools/test_questions.json').read_text(encoding='utf-8'))[:20]
    cases = []
    for fact in facts:
        cases.append(dict(id=f'fact-{fact["id"]:02}', category='knowledge', endpoint='/decide',
                          input={'intent': 'knowledge', 'query': fact['question']}, expected_status='success', fact_contract=fact))
    def state(**values):
        return dict(currentLocation='south_gate', currentTime='09:00', remainingMinutes=240,
                    mobility='normal', mustVisitSpotIds=[], **values)
    destinations = ['LS-001', 'LS-003', 'LS-004', 'LS-005', 'LS-006', 'LS-008', 'LS-009',
                    'LS-010', 'LS-011', 'LS-012', 'LS-013', 'LS-014', 'LS-015', 'LS-016',
                    'LS-002', 'LS-007', 'LS-013', 'LS-006', 'LS-014', 'LS-011']
    for i, destination in enumerate(destinations):
        scene = state(); scene.update(mustVisitSpotIds=[destination], mobility=['normal', 'limited', 'wheelchair'][i % 3])
        cases.append(dict(id=f'route-{i+1:02}', category='feasible_route', endpoint='/decide',
                          input={'intent': 'route', 'scene_state': scene}, expected_status='success'))
    for i, destination in enumerate(destinations[:15]):
        scene = state(); scene.update(remainingMinutes=1, mustVisitSpotIds=[destination])
        cases.append(dict(id=f'impossible-{i+1:02}', category='infeasible', endpoint='/decide',
                          input={'intent': 'route', 'scene_state': scene}, expected_status='infeasible'))
    for i in range(15):
        field = ['currentLocation', 'currentTime', 'remainingMinutes'][i % 3]
        scene = state(); scene['mustVisitSpotIds'] = [destinations[i]]; del scene[field]
        cases.append(dict(id=f'missing-{i+1:02}', category='clarification', endpoint='/decide',
                          input={'intent': 'route', 'scene_state': scene}, expected_status='needs_clarification', missing_fields=[field]))
    boundaries = [
        ('empty-query', '/tools/extract_scene_state', {'query': ''}, 400),
        ('injected-route', '/tools/plan_route', {'scene_state': {'steps': [], 'feasible': True}}, 400),
        ('bad-clock', '/tools/plan_route', {'scene_state': {'currentTime': '25:00'}}, 400),
        ('negative-time', '/tools/plan_route', {'scene_state': {'remainingMinutes': -1}}, 400),
        ('unknown-tool', '/tools/invent_route', {}, 404),
        ('no-intent', '/decide', {'query': '你好'}, 400),
        ('no-key', '/tools/plan_route', {'scene_state': {}}, 401),
        ('bad-route', '/tools/validate_route', {'scene_state': state(), 'route': {'feasible': True}}, 400),
    ]
    for name, endpoint, body, status in boundaries:
        cases.append(dict(id=f'boundary-{name}', category='boundary', endpoint=endpoint, input=body,
                          expected_http=status, omit_auth=name == 'no-key'))
    for name in ['timeout', 'tool-failure']:
        cases.append(dict(id=f'fault-{name}', category='boundary', requires_fixture=True,
                          fixture_test='backend/tests/agentarts/http.test.ts', expected_status='error',
                          note='仅在隔离测试桩中注入异常；真实平台需在隔离部署复现，未执行不得计通过。'))
    document = {'version': 'development-v1', 'status': 'development_candidates_not_blind',
                'counts': {'knowledge': 20, 'feasible_route': 20, 'infeasible': 15, 'clarification': 15, 'boundary': 10},
                'cases': cases}
    assert len(cases) == 80
    DEST.mkdir(exist_ok=True)
    content = json.dumps(document, ensure_ascii=False, indent=2) + '\n'
    (DEST / 'cases-v1.json').write_text(content, encoding='utf-8')
    print(f'80 development candidates; sha256={hashlib.sha256(content.encode()).hexdigest()}')


if __name__ == '__main__':
    build()
