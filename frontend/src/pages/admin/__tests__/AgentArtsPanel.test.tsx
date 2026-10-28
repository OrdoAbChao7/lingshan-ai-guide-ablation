import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentArtsPanel from '../AgentArtsPanel';

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));

describe('AgentArts local reference panel', () => {
  beforeEach(() => { mocks.post.mockReset(); mocks.get.mockReset(); });
  it('shows the route only with a successful independent check and resolves spot names', async () => {
    mocks.post.mockResolvedValue({ data: { trace_id: 'trace-1', status: 'success', latency_ms: 20,
      data: { validation: { valid: true }, evidence: [{ spot_id: 'LS-001', name: '灵山大照壁', source: 'registered' }],
        route: { totalMinutes: 20, walkingMinutes: 5, visitingMinutes: 15,
          steps: [{ spotId: 'LS-001', start: '09:05', end: '09:20', walkMinutes: 5 }] } }, calls: [] } });
    render(<AgentArtsPanel />);
    fireEvent.click(screen.getByRole('button', { name: '运行并校验' }));
    expect(await screen.findByText('灵山大照壁')).toBeInTheDocument();
    expect(screen.getByText('通过')).toBeInTheDocument();
    expect(screen.getByText(/本地参考编排/)).toBeInTheDocument();
  });
  it('retains failure trace for inspection on HTTP timeout', async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, response: { data: {
      trace_id: 'timeout-trace', status: 'error', latency_ms: 40000, error: { message: '工具调用超时，未发布路线' },
    } } });
    mocks.get.mockResolvedValue({ data: { records: [{ event: 'failed' }] } });
    render(<AgentArtsPanel />);
    fireEvent.click(screen.getByRole('button', { name: '运行并校验' }));
    expect(await screen.findByText('timeout-trace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '读取完整执行记录' }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/admin/agentarts/traces/timeout-trace'));
  });
  it('does not show an unvalidated candidate as an executable route', async () => {
    mocks.post.mockResolvedValue({ data: { trace_id: 'trace-2', status: 'infeasible', latency_ms: 1,
      data: { validation: { valid: false }, route: { totalMinutes: 10, steps: [{ spotId: 'FORGED' }] } } } });
    render(<AgentArtsPanel />);
    fireEvent.click(screen.getByRole('button', { name: '运行并校验' }));
    expect(await screen.findByText('未通过')).toBeInTheDocument();
    expect(screen.queryByText('FORGED')).not.toBeInTheDocument();
  });
  it('merges visitor clarification into the next request', async () => {
    mocks.post.mockResolvedValue({ data: { trace_id: 'trace-3', status: 'needs_clarification', latency_ms: 1,
      data: { clarification: '请补充开始时刻' } } });
    render(<AgentArtsPanel />);
    fireEvent.click(screen.getByRole('button', { name: '运行并校验' }));
    await screen.findByText('请补充开始时刻');
    fireEvent.change(screen.getByLabelText('补充条件'), { target: { value: '现在上午10点' } });
    fireEvent.click(screen.getByRole('button', { name: '补充并重新运行' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1][1].query).toContain('现在上午10点');
  });
});
