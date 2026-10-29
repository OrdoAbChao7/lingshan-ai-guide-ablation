"""HTTP evaluation with raw evidence. Local reference results are never AgentArts results."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend/python/tools'))
from test_accuracy import evaluate_answer


def clock(value):
    hour, minute = map(int, value.split(':'))
    return hour * 60 + minute


def route_violations(route, scene, graph):
    """Independent implementation; do not trust the service's feasible/validation flag."""
    errors, seen = [], set()
    if not route or not route.get('steps'):
        return ['empty_route']
    spots = {spot['id']: spot for spot in graph['spots']}
    edges = {}
    for edge in graph['edges']:
        edges[edge['from'], edge['to']] = edge
        edges[edge['to'], edge['from']] = edge
    try:
        start_time = clock(scene['currentTime'])
        previous_time, previous_spot = start_time, scene['currentLocation']
        walk_total = visit_total = wait_total = 0
        if route['startTime'] != scene['currentTime']: errors.append('start_mismatch')
        for step in route['steps']:
            spot_id = step['spotId']
            spot = spots[spot_id]
            if spot_id in seen or spot_id in scene.get('visitedSpotIds', []): errors.append('repeated_spot')
            seen.add(spot_id)
            segment = step.get('pathSpotIds') or [previous_spot, spot_id]
            if segment[0] != previous_spot or segment[-1] != spot_id: errors.append('path_endpoints')
            walking = 0
            for a, b in zip(segment, segment[1:]):
                if a == b: continue
                edge = edges.get((a, b))
                if not edge: errors.append('disconnected'); continue
                walking += edge['walk_minutes']
                if scene.get('mobility') in ['limited', 'wheelchair'] and not edge['accessible']: errors.append('inaccessible_edge')
            if scene.get('mobility') in ['limited', 'wheelchair'] and not spot['mobility']['wheelchair_accessible']: errors.append('inaccessible_spot')
            arrive, start, end = map(clock, [step['arrive'], step['start'], step['end']])
            waiting = start - arrive
            if arrive != previous_time + walking or step['walkMinutes'] != walking: errors.append('walking_timeline')
            if waiting < 0 or end - start != step['visitMinutes']: errors.append('visit_timeline')
            if 'waitingMinutes' in step and step['waitingMinutes'] != waiting: errors.append('waiting_timeline')
            def open_at(t):
                for window in spot['opening_windows']:
                    lo, hi = map(clock, window.split('-'))
                    if (lo <= t <= hi) if lo <= hi else (t >= lo or t <= hi): return True
                return False
            if not open_at(start) or not open_at(end): errors.append('opening_window')
            if step.get('performanceId'):
                performance = next(p for p in graph['performances'] if p['id'] == step['performanceId'])
                if performance['location_id'] != spot_id or step.get('performanceStartTime') not in performance['start_times']: errors.append('performance_contract')
                if step['visitMinutes'] != performance['duration_minutes'] or start != clock(step['performanceStartTime']): errors.append('performance_duration')
                buffer = 20 if scene.get('mobility') in ['limited', 'wheelchair'] else 15
                if waiting < buffer: errors.append('admission_buffer')
            else:
                expected = spot['visit_minutes']
                if scene.get('pace') == 'slow': expected = math.ceil(expected * 1.2)
                if scene.get('pace') == 'fast': expected = max(10, math.ceil(expected * 0.85))
                if step['visitMinutes'] != expected: errors.append('visit_contract')
            previous_time, previous_spot = end, spot_id
            walk_total += walking; visit_total += step['visitMinutes']; wait_total += waiting
        if not set(scene.get('mustVisitSpotIds', [])).issubset(seen): errors.append('missing_must_visit')
        total = previous_time - start_time
        if total > scene['remainingMinutes']: errors.append('budget')
        if [route['totalMinutes'], route['walkingMinutes'], route['visitingMinutes'], route['waitingMinutes']] != [total, walk_total, visit_total, wait_total]: errors.append('aggregate_mismatch')
        if total != walk_total + visit_total + wait_total: errors.append('conservation')
    except (KeyError, ValueError, TypeError, StopIteration):
        errors.append('invalid_contract')
    return sorted(set(errors))


def assess(case, http_status, output, graph):
    data = output.get('data') or {}
    errors = []
    if case.get('expected_http'):
        return {'passed': http_status == case['expected_http'], 'hard_violations': []}
    passed = http_status == 200 and output.get('status') == case['expected_status']
    if case['category'] == 'knowledge':
        fact = evaluate_answer(data.get('answer', ''), case['fact_contract'])
        passed = passed and fact['passed'] and bool(data.get('evidence'))
    if case['category'] == 'feasible_route':
        # Evaluate against original constraints, not a silently relaxed scene returned by service.
        errors = route_violations(data.get('route'), case['input']['scene_state'], graph)
        passed = passed and not errors
    if case['category'] == 'clarification':
        route = data.get('route') or {}
        passed = passed and set(case['missing_fields']).issubset(data.get('missing_fields', [])) and not route.get('steps') and not route.get('feasible')
    if case['category'] == 'infeasible':
        passed = passed and not (data.get('route') or {}).get('feasible')
    if case['category'] != 'feasible_route' and data.get('route') and (
            data['route'].get('feasible') or output.get('status') == 'success'):
        scene = case.get('input', {}).get('scene_state')
        errors = route_violations(data['route'], scene, graph) if scene else ['missing_original_constraints']
        passed = passed and not errors
    return {'passed': bool(passed), 'hard_violations': errors}


def post(url, body, key):
    headers = {'Content-Type': 'application/json'}
    if key: headers['X-API-Key'] = key
    request = Request(url, data=json.dumps(body).encode(), headers=headers, method='POST')
    try:
        with urlopen(request, timeout=55) as response: return response.status, json.load(response)
    except HTTPError as error:
        try: return error.code, json.load(error)
        except ValueError: return error.code, {'error': {'code': 'NON_JSON_HTTP_ERROR'}}
    except (URLError, TimeoutError, ValueError): return 0, {'status': 'error', 'error': {'code': 'TRANSPORT_ERROR'}}


def audit_linked(base_url, output, key):
    if not output.get('trace_id') or not output.get('call_id'): return False
    request = Request(base_url.rstrip('/') + '/api/v1/agentarts/traces/' + output['trace_id'], headers={'X-API-Key': key or ''})
    try:
        with urlopen(request, timeout=10) as response: records = json.load(response)['records']
        return any(r.get('event') == 'completed' and r.get('call_id') == output['call_id'] and
                   r.get('output', {}).get('status') == output.get('status') for r in records)
    except (URLError, TimeoutError, ValueError, KeyError): return False


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def normalize_original(raw):
    status = 'success' if raw.get('answer') else raw.get('outcome', 'error')
    if status == 'feasible': status = 'success'
    return {'status': status, 'data': {'answer': raw.get('answer'),
            'evidence': raw.get('evaluation_trace', {}).get('retrievedDocuments', []),
            'route': raw.get('route'), 'missing_fields': raw.get('scene_state', {}).get('missingCriticalFields', [])},
            'original_response': raw}


class EvidenceJournal:
    """Keep one append stream open, so progress never truncates earlier evidence."""
    def __init__(self, path):
        self.stream = Path(path).open('x', encoding='utf-8')

    def append(self, record):
        self.stream.write(json.dumps(record, ensure_ascii=False) + '\n')
        self.stream.flush()

    def close(self):
        self.stream.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8010')
    parser.add_argument('--profile', choices=['original', 'local_reference', 'agentarts'], required=True)
    parser.add_argument('--decision-url', help='AgentArts normalization bridge URL; must return the documented envelope')
    parser.add_argument('--run-config', type=Path, required=True, help='Nonsecret JSON with model, workflow, tool versions and runtime mode')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--cases', type=Path, default=Path(__file__).with_name('cases-v1.json'))
    parser.add_argument('--categories', default='knowledge,feasible_route,infeasible,clarification,boundary')
    args = parser.parse_args()
    if args.profile == 'agentarts' and not args.decision_url: parser.error('agentarts requires a real --decision-url')
    config = json.loads(args.run_config.read_text(encoding='utf-8-sig'))
    if args.profile == 'agentarts' and not config.get('workflow_version'): parser.error('agentarts requires workflow_version in run-config')
    key = os.environ.get('AGENTARTS_TOOL_API_KEY')
    if args.profile != 'original' and not key: parser.error('Set AGENTARTS_TOOL_API_KEY in environment (never in command arguments)')
    args.output_dir.mkdir(parents=True, exist_ok=False)
    raw_cases = args.cases.read_bytes()
    dataset = json.loads(raw_cases.decode('utf-8-sig'))
    graph = {name: json.loads((ROOT / f'data/route/{name}.json').read_text(encoding='utf-8')) for name in ['spots', 'edges', 'performances']}
    selected = set(args.categories.split(','))
    records = []
    (args.output_dir / 'run-start.json').write_text(json.dumps({
        'git_commit': git('rev-parse', 'HEAD'), 'git_status': git('status', '--porcelain'),
        'dataset_sha256': hashlib.sha256(raw_cases).hexdigest(), 'profile': args.profile, 'run_config': config,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    journal = EvidenceJournal(args.output_dir / 'records.jsonl')
    for case in dataset['cases']:
        if case['category'] not in selected: continue
        if case.get('requires_fixture') or (args.profile == 'original' and case['category'] == 'boundary'):
            skipped = {'id': case['id'], 'category': case['category'], 'execution': 'not_run', 'reason': 'requires_isolated_fixture_or_tool_adapter'}
            records.append(skipped); journal.append(skipped)
            continue
        endpoint = args.base_url.rstrip('/') + '/api/v1/agentarts' + case['endpoint']
        body = case['input']
        if args.profile == 'agentarts' and case['endpoint'] == '/decide': endpoint = args.decision_url
        if args.profile == 'original':
            knowledge = case['category'] == 'knowledge'
            endpoint = args.base_url.rstrip('/') + ('/api/v1/visitor/qa' if knowledge else '/api/v1/visitor/route/plan')
            body = {'query': body['query'], 'session_id': f'ict-eval-{time.time_ns()}'} if knowledge else {'scene_state': body['scene_state']}
        started = time.perf_counter()
        code, output = post(endpoint, body, None if case.get('omit_auth') else key)
        latency = round((time.perf_counter() - started) * 1000, 2)
        if args.profile == 'original':
            output = normalize_original(output)
        result = assess(case, code, output, graph)
        if args.profile == 'agentarts' and case['endpoint'] == '/decide' and output.get('execution_origin') != 'agentarts': result['passed'] = False
        record = {'id': case['id'], 'category': case['category'], 'execution': 'executed', 'input': body,
                  'http_status': code, 'output': output, 'latency_ms': latency, **result}
        if not case.get('expected_http') and args.profile == 'local_reference':
            record['audit_linked'] = audit_linked(args.base_url, output, key)
        records.append(record)
        journal.append(record)
        print(f'{case["id"]}: {"PASS" if result["passed"] else "FAIL"} ({code}, {latency}ms)')
    journal.close()
    executed = [r for r in records if r['execution'] == 'executed']
    latencies = sorted(r['latency_ms'] for r in executed)
    source_paths = sorted(set(list((ROOT / 'backend/src').rglob('*.ts')) + list((ROOT / 'backend/scripts').glob('*.ts')) +
                              list((ROOT / 'frontend/src').rglob('*.tsx')) + list((ROOT / 'data/route').glob('*.json')) +
                              list((ROOT / 'data/raw').glob('*.txt')) + list(Path(__file__).parent.glob('*.py'))))
    manifest = {'timestamp_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'profile': args.profile,
                'git_commit': git('rev-parse', 'HEAD'), 'git_status': git('status', '--porcelain'),
                'dataset_version': dataset['version'], 'dataset_status': dataset['status'],
                'dataset_sha256': hashlib.sha256(raw_cases).hexdigest(), 'run_config': config,
                'source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}}
    summary = {'selected': len(records), 'executed': len(executed), 'not_run': len(records) - len(executed),
               'passed': sum(r['passed'] for r in executed), 'hard_violations': sum(bool(r['hard_violations']) for r in executed),
               'mean_ms': round(statistics.mean(latencies), 2) if latencies else None,
               'p95_ms': latencies[max(0, math.ceil(len(latencies) * .95) - 1)] if latencies else None,
               'http_504_count': sum(r['http_status'] == 504 for r in executed),
               'trace_id_count': sum(bool(r['output'].get('trace_id')) for r in executed)}
    summary['categories'] = {category: {'executed': sum(r['category'] == category for r in executed),
                                       'passed': sum(r['category'] == category and r['passed'] for r in executed)} for category in selected}
    normal = [r for r in executed if r['category'] != 'boundary']
    summary['normal_http_success'] = {'successful': sum(r['http_status'] == 200 for r in normal), 'total': len(normal)}
    summary['persisted_audit_linked'] = {'verified': sum(r.get('audit_linked', False) for r in normal),
                                       'eligible': sum('audit_linked' in r for r in normal)}
    for name, value in [('manifest', manifest), ('summary', summary), ('records', records)]:
        (args.output_dir / f'{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    (args.output_dir / 'report.md').write_text(f'# {args.profile} 开发验证\n\n非独立盲测，非平台性能结论。\n\n```json\n{json.dumps(summary, ensure_ascii=False, indent=2)}\n```\n', encoding='utf-8')
    return 1 if any(not r['passed'] for r in executed) else 0


if __name__ == '__main__':
    sys.exit(main())
