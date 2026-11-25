// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TravelSettingsPanel from './TravelSettingsPanel';
import { ProjectContext } from '../../contexts/projectContextValue';

afterEach(cleanup);

const renderPanel = (project) => {
  const setTravel = vi.fn();
  render(
    <ProjectContext.Provider value={{ project: { externalSessions: [], ...project }, setTravel }}>
      <TravelSettingsPanel />
    </ProjectContext.Provider>,
  );
  return setTravel;
};

describe('TravelSettingsPanel (本校 ⇄ 亀井町の移動)', () => {
  it('既定は 30 分・注意 60 分。直すと設定に書く (欄を離れたとき)', () => {
    const setTravel = renderPanel({});
    const minutes = screen.getByRole('spinbutton', { name: /移動時間/ });
    const caution = screen.getByRole('spinbutton', { name: /注意/ });
    expect(minutes.value).toBe('30');
    expect(caution.value).toBe('60');
    expect(screen.queryByRole('button', { name: /既定に戻す/ })).not.toBeInTheDocument();
    fireEvent.focus(minutes);
    fireEvent.change(minutes, { target: { value: '25' } });
    fireEvent.blur(minutes);
    expect(setTravel).toHaveBeenLastCalledWith({ routes: [{ a: '本校', b: '亀井町', minutes: 25 }], cautionMinutes: 60 });
    fireEvent.focus(caution);
    fireEvent.change(caution, { target: { value: '90' } });
    fireEvent.blur(caution);
    expect(setTravel).toHaveBeenLastCalledWith({ routes: [{ a: '本校', b: '亀井町', minutes: 30 }], cautionMinutes: 90 });
  });

  it('既定から変えていれば「既定に戻す」。場所の欄の前に取り込んだものがあれば取り込み直しを案内する', () => {
    const setTravel = renderPanel({
      travel: { routes: [{ a: '本校', b: '亀井町', minutes: 40 }], cautionMinutes: 60 },
      externalSessions: [
        { id: 1, date: '1/4(月)', teacherName: '石原', memo: '高1・高2 Ⅱ期 高校①', source: 'seniorKoshu', sourceKey: '1:x' },
      ],
    });
    expect(screen.getByRole('spinbutton', { name: /移動時間/ }).value).toBe('40');
    expect(document.body.textContent).toContain('本校以外の場所の他学年セッション: 1 件');
    expect(document.body.textContent).toContain('場所の欄ができる前に取り込んだもの 1 件');
    fireEvent.click(screen.getByRole('button', { name: /既定に戻す/ }));
    expect(setTravel).toHaveBeenLastCalledWith(null);
  });
});
